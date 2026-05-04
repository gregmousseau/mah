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

interface TeamStatesCache { [teamId: string]: Map<string, string> }
const teamStatesCache: TeamStatesCache = {}

async function resolveStateId(teamId: string, stateName: string): Promise<string> {
  if (!teamStatesCache[teamId]) {
    const data = await gql<{ team: { states: { nodes: Array<{ id: string; name: string; type: string }> } } }>(
      TEAM_STATES_QUERY,
      { teamId },
    )
    const map = new Map<string, string>()
    for (const node of data.team.states.nodes) {
      map.set(node.name.toLowerCase(), node.id)
    }
    teamStatesCache[teamId] = map
  }
  const stateId = teamStatesCache[teamId].get(stateName.toLowerCase())
  if (!stateId) {
    const known = Array.from(teamStatesCache[teamId].keys()).join(', ')
    throw new Error(`Linear state "${stateName}" not found for team ${teamId}. Known states: ${known}`)
  }
  return stateId
}

export async function setStatus(id: string, stateName: string, teamId: string): Promise<void> {
  const stateId = await resolveStateId(teamId, stateName)
  const data = await gql<{ issueUpdate: { success: boolean } }>(STATE_UPDATE_MUTATION, { id, stateId })
  if (!data.issueUpdate.success) {
    throw new Error(`Linear issueUpdate returned success=false for ${id}`)
  }
}
