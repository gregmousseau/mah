import {
  createTodoIssue,
  findIssueByRegistrarFingerprint,
  type LinearTicket,
} from '../integrations/linear.js'
import type { RegistrarReport } from './types.js'

export interface FindingTicketClient {
  findByFingerprint(fingerprint: string): Promise<LinearTicket | null>
  createTodo(teamId: string, title: string, body: string): Promise<LinearTicket>
}

const defaultClient: FindingTicketClient = {
  findByFingerprint: findIssueByRegistrarFingerprint,
  createTodo: createTodoIssue,
}

export async function dispatchFindingTickets(
  report: RegistrarReport,
  teamId: string | undefined,
  client: FindingTicketClient = defaultClient,
): Promise<void> {
  if (report.findingsMode !== 'ticket' || !report.ticketDispatchEnabled) return
  if (!report.reviewComplete) return
  if (!teamId) {
    report.errors.push('Ticket dispatch approved but findings.ticketTeamId is not configured.')
    for (const action of report.ticketActions.filter((item) => item.reason === 'ready')) {
      action.reason = 'dispatch-failed'
      action.error = 'Missing findings.ticketTeamId.'
    }
    return
  }

  for (const action of report.ticketActions.filter((item) => item.reason === 'ready')) {
    try {
      const existing = await client.findByFingerprint(action.fingerprint)
      if (existing) {
        action.reason = 'duplicate'
        attachIssue(action, existing)
        continue
      }
      const created = await client.createTodo(teamId, action.title, action.body)
      action.dispatched = true
      action.reason = 'created'
      attachIssue(action, created)
    } catch (error) {
      action.reason = 'dispatch-failed'
      action.error = error instanceof Error ? error.message : String(error)
      report.errors.push(`Ticket dispatch failed for ${action.packetId}: ${action.error}`)
    }
  }
}

function attachIssue(
  action: RegistrarReport['ticketActions'][number],
  issue: LinearTicket,
): void {
  action.issueId = issue.id
  action.issueIdentifier = issue.identifier
  action.issueUrl = issue.url
}
