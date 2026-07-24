import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LINEAR_ENDPOINT = 'https://api.linear.app/graphql'
const KEY_PATH = join(homedir(), 'clawd', '.secrets', 'linear-api-key')

export interface LinearTicket {
  id: string
  identifier: string
  title: string
  description: string
  state: { name: string; type: string }
  team: { key: string; id: string }
  branchName: string
  url: string
}

// Signals that issue creation failed before issueCreate was sent. Callers may
// safely clear an exactly-once reservation only for this error class.
export class LinearIssueCreateNotAttemptedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LinearIssueCreateNotAttemptedError'
  }
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>
}

function loadKey(): string {
  if (!existsSync(KEY_PATH)) {
    throw new Error(`Linear API key not found at ${KEY_PATH}`)
  }
  const key = readFileSync(KEY_PATH, 'utf-8').trim()
  if (!key) {
    throw new Error(`Linear API key file is empty: ${KEY_PATH}`)
  }
  return key
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = loadKey()
  const res = await fetch(LINEAR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Linear personal API keys are passed raw — no "Bearer" prefix
      'Authorization': key,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Linear API HTTP ${res.status}: ${body.slice(0, 500)}`)
  }

  const json = await res.json() as GraphQLResponse<T>
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Linear API error: ${json.errors.map(e => e.message).join('; ')}`)
  }
  if (!json.data) {
    throw new Error('Linear API returned no data')
  }
  return json.data
}

const TICKET_QUERY = `
  query Ticket($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      branchName
      url
      state { name type }
      team { key id }
    }
  }
`

export async function fetchTicket(id: string): Promise<LinearTicket> {
  const data = await gql<{ issue: LinearTicket | null }>(TICKET_QUERY, { id })
  if (!data.issue) {
    throw new Error(`Linear ticket not found: ${id}`)
  }
  // Linear's `description` is nullable; normalize to empty string.
  if (data.issue.description == null) data.issue.description = ''
  return data.issue
}

const COMMENT_MUTATION = `
  mutation Comment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id }
    }
  }
`

export async function postComment(id: string, body: string): Promise<void> {
  const data = await gql<{ commentCreate: { success: boolean } }>(COMMENT_MUTATION, {
    input: { issueId: id, body },
  })
  if (!data.commentCreate.success) {
    throw new Error(`Linear commentCreate returned success=false for ${id}`)
  }
}

const TEAM_STATES_QUERY = `
  query TeamStates($teamId: String!) {
    team(id: $teamId) {
      states { nodes { id name type } }
    }
  }
`

const STATE_UPDATE_MUTATION = `
  mutation IssueStateUpdate($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
    }
  }
`

interface WorkflowState {
  id: string
  type: string
}

interface TeamStatesCache { [teamId: string]: Map<string, WorkflowState> }
const teamStatesCache: TeamStatesCache = {}

async function resolveState(teamId: string, stateName: string): Promise<WorkflowState> {
  if (!teamStatesCache[teamId]) {
    const data = await gql<{ team: { states: { nodes: Array<{ id: string; name: string; type: string }> } } }>(
      TEAM_STATES_QUERY,
      { teamId },
    )
    const map = new Map<string, WorkflowState>()
    for (const node of data.team.states.nodes) {
      map.set(node.name.toLowerCase(), { id: node.id, type: node.type })
    }
    teamStatesCache[teamId] = map
  }
  const state = teamStatesCache[teamId].get(stateName.toLowerCase())
  if (!state) {
    const known = Array.from(teamStatesCache[teamId].keys()).join(', ')
    throw new Error(`Linear state "${stateName}" not found for team ${teamId}. Known states: ${known}`)
  }
  return state
}

export async function setStatus(id: string, stateName: string, teamId: string): Promise<void> {
  const stateId = (await resolveState(teamId, stateName)).id
  const data = await gql<{ issueUpdate: { success: boolean } }>(STATE_UPDATE_MUTATION, { id, stateId })
  if (!data.issueUpdate.success) {
    throw new Error(`Linear issueUpdate returned success=false for ${id}`)
  }
}

const FINDING_SEARCH_QUERY = `
  query FindingSearch($teamId: ID!, $fingerprintMarker: String!) {
    issues(
      first: 10
      filter: {
        team: { id: { eq: $teamId } }
        description: { contains: $fingerprintMarker }
      }
    ) {
      nodes { id identifier title description url state { name type } team { key id } branchName }
    }
  }
`

const ISSUE_CREATE_MUTATION = `
  mutation FindingCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier title description url state { name type } team { key id } branchName }
    }
  }
`

export async function findIssueByRegistrarFingerprint(
  teamId: string,
  fingerprint: string,
): Promise<LinearTicket | null> {
  const fingerprintMarker = `Registrar fingerprint: ${fingerprint}`
  const data = await gql<{ issues: { nodes: LinearTicket[] } }>(
    FINDING_SEARCH_QUERY,
    { teamId, fingerprintMarker },
  )
  return data.issues.nodes.find((issue) =>
    issue.team.id === teamId
    && issue.description?.includes(fingerprintMarker)) ?? null
}

export async function createTodoIssue(
  teamId: string,
  title: string,
  description: string,
): Promise<LinearTicket> {
  let todoState: WorkflowState
  try {
    todoState = await resolveState(teamId, 'Todo')
  } catch (error) {
    throw new LinearIssueCreateNotAttemptedError(
      error instanceof Error ? error.message : String(error),
    )
  }
  if (todoState.type.toLowerCase() !== 'unstarted') {
    throw new LinearIssueCreateNotAttemptedError(
      `Linear state "Todo" is not an unstarted state for team ${teamId}; refusing to create future work.`,
    )
  }
  const data = await gql<{
    issueCreate: { success: boolean; issue: LinearTicket | null }
  }>(ISSUE_CREATE_MUTATION, {
    input: { teamId, stateId: todoState.id, title, description },
  })
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error('Linear issueCreate returned success=false or no issue')
  }
  if (
    data.issueCreate.issue.team.id !== teamId
    ||
    data.issueCreate.issue.state.name.toLowerCase() !== 'todo'
    || data.issueCreate.issue.state.type.toLowerCase() !== 'unstarted'
  ) {
    throw new Error(
      `Created issue did not land in team ${teamId}'s unstarted Todo: `
      + data.issueCreate.issue.identifier,
    )
  }
  return data.issueCreate.issue
}
