import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createTodoIssue,
  findIssueByRegistrarFingerprint,
  LinearIssueCreateNotAttemptedError,
  type LinearTicket,
} from '../integrations/linear.js'
import { sanitizeEvidence } from './redact.js'
import type { RegistrarReport } from './types.js'

export interface FindingTicketClient {
  findByFingerprint(teamId: string, fingerprint: string): Promise<LinearTicket | null>
  createTodo(teamId: string, title: string, body: string): Promise<LinearTicket>
}

const defaultClient: FindingTicketClient = {
  findByFingerprint: findIssueByRegistrarFingerprint,
  createTodo: createTodoIssue,
}

const customClientReceipts = new WeakMap<
  FindingTicketClient,
  Map<string, Promise<DispatchResult>>
>()

interface DispatchResult {
  issue: LinearTicket
  created: boolean
}

interface PendingReservation {
  version: 2
  teamId: string
  fingerprint: string
  status: 'pending'
}

interface CompletedReservation {
  version: 2
  teamId: string
  fingerprint: string
  status: 'created' | 'existing'
  issue: LinearTicket
}

type TicketReservation = PendingReservation | CompletedReservation

interface LegacyPendingReservation {
  version: 1
  fingerprint: string
  status: 'pending'
}

type ReadReservation = TicketReservation | LegacyPendingReservation

export async function dispatchFindingTickets(
  report: RegistrarReport,
  teamId: string | undefined,
  client: FindingTicketClient = defaultClient,
  options: { reservationDirectory?: string } = {},
): Promise<void> {
  if (report.findingsMode !== 'ticket' || !report.ticketDispatchEnabled) return
  if (!report.reviewComplete) return
  if (!teamId || !report.ticketTeamId || report.ticketTeamId !== teamId) {
    report.errors.push(
      'Ticket dispatch approved but findings.ticketTeamId is missing or does not match the report.',
    )
    for (const action of report.ticketActions.filter((item) => item.reason === 'ready')) {
      action.reason = 'dispatch-failed'
      action.error = 'Missing or mismatched findings.ticketTeamId.'
    }
    return
  }

  for (const action of report.ticketActions.filter((item) => item.reason === 'ready')) {
    try {
      const result = client === defaultClient || options.reservationDirectory
        ? await dispatchWithDurableReservation(
          action,
          teamId,
          client,
          options.reservationDirectory,
        )
        : await dispatchWithClientReservation(action, teamId, client)
      action.dispatched = result.created
      action.reason = result.created ? 'created' : 'duplicate'
      attachIssue(action, result.issue)
    } catch (error) {
      action.reason = 'dispatch-failed'
      action.error = sanitizeEvidence(
        error instanceof Error ? error.message : String(error),
      )
      report.errors.push(`Ticket dispatch failed for ${action.packetId}: ${action.error}`)
    }
  }
}

async function dispatchWithDurableReservation(
  action: RegistrarReport['ticketActions'][number],
  teamId: string,
  client: FindingTicketClient,
  reservationDirectory?: string,
): Promise<DispatchResult> {
  const root = resolve(
    reservationDirectory
      ?? resolve(process.cwd(), '.mah', 'registrar', 'ticket-reservations'),
  )
  await mkdir(root, { recursive: true })
  const identity = reservationIdentity(teamId, action.fingerprint)
  const receiptPath = resolve(root, `${identity}.json`)
  const legacyReceiptPath = resolve(root, `${action.fingerprint}.json`)
  const lockPath = resolve(root, `${identity}.lock`)

  const beforeLock = await readScopedReservation(
    receiptPath,
    legacyReceiptPath,
    action.fingerprint,
    teamId,
  )
  if (beforeLock?.status === 'pending') {
    throw pendingReservationError(teamId, action.fingerprint)
  }
  if (beforeLock) return { issue: beforeLock.issue, created: false }

  await acquireLock(lockPath)
  try {
    const reservation = await readScopedReservation(
      receiptPath,
      legacyReceiptPath,
      action.fingerprint,
      teamId,
    )
    if (reservation?.status === 'pending') {
      throw pendingReservationError(teamId, action.fingerprint)
    }
    if (reservation) return { issue: reservation.issue, created: false }

    const existing = await client.findByFingerprint(teamId, action.fingerprint)
    if (existing?.team.id === teamId) {
      await writeReservation(receiptPath, {
        version: 2,
        teamId,
        fingerprint: action.fingerprint,
        status: 'existing',
        issue: existing,
      })
      return { issue: existing, created: false }
    }

    // Persist intent before crossing the Linear mutation boundary. If the
    // process crashes or the response is lost, later runs stop for manual
    // reconciliation instead of risking a duplicate issue.
    await writeReservation(receiptPath, {
      version: 2,
      teamId,
      fingerprint: action.fingerprint,
      status: 'pending',
    })
    let created: LinearTicket
    try {
      created = await client.createTodo(teamId, action.title, action.body)
      assertIssueTeam(created, teamId)
    } catch (error) {
      if (error instanceof LinearIssueCreateNotAttemptedError) {
        await rm(receiptPath, { force: true })
      }
      throw error
    }
    await writeReservation(receiptPath, {
      version: 2,
      teamId,
      fingerprint: action.fingerprint,
      status: 'created',
      issue: created,
    })
    return { issue: created, created: true }
  } finally {
    await rm(lockPath, { recursive: true, force: true })
  }
}

async function dispatchWithClientReservation(
  action: RegistrarReport['ticketActions'][number],
  teamId: string,
  client: FindingTicketClient,
): Promise<DispatchResult> {
  let receipts = customClientReceipts.get(client)
  if (!receipts) {
    receipts = new Map()
    customClientReceipts.set(client, receipts)
  }
  const identity = reservationIdentity(teamId, action.fingerprint)
  const pending = receipts.get(identity)
  if (pending) {
    const result = await pending
    return { issue: result.issue, created: false }
  }

  const operation = (async () => {
    let mutationAttempted = false
    try {
      const existing = await client.findByFingerprint(teamId, action.fingerprint)
      if (existing?.team.id === teamId) return { issue: existing, created: false }
      mutationAttempted = true
      const issue = await client.createTodo(teamId, action.title, action.body)
      assertIssueTeam(issue, teamId)
      return { issue, created: true }
    } catch (error) {
      if (!mutationAttempted || error instanceof LinearIssueCreateNotAttemptedError) {
        receipts.delete(identity)
        throw error
      }
      throw pendingReservationError(teamId, action.fingerprint, error)
    }
  })()
  receipts.set(identity, operation)
  return operation
}

async function acquireLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      await mkdir(lockPath)
      return
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      await delay(25)
    }
  }
  throw new Error('Timed out waiting for the registrar fingerprint reservation.')
}

async function readScopedReservation(
  scopedPath: string,
  legacyPath: string,
  expectedFingerprint: string,
  expectedTeamId: string,
): Promise<ReadReservation | null> {
  const scoped = await readReservation(
    scopedPath,
    expectedFingerprint,
    expectedTeamId,
    false,
  )
  if (scoped) return scoped
  return readReservation(legacyPath, expectedFingerprint, expectedTeamId, true)
}

async function readReservation(
  path: string,
  expectedFingerprint: string,
  expectedTeamId: string,
  allowLegacy: boolean,
): Promise<ReadReservation | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (allowLegacy && isLinearTicket(parsed)) {
      // Backward compatibility for receipts written by the first rollout.
      if (parsed.team.id !== expectedTeamId) return null
      return {
        version: 2,
        teamId: expectedTeamId,
        fingerprint: expectedFingerprint,
        status: 'existing',
        issue: parsed,
      }
    }
    if (
      allowLegacy
      && hasReservationIdentity(parsed, 1, expectedFingerprint)
      && parsed.status === 'pending'
    ) {
      // A v1 pending receipt predates team scoping and may represent an
      // ambiguous mutation. It cannot be retried automatically for any team.
      return {
        version: 1,
        fingerprint: expectedFingerprint,
        status: 'pending',
      }
    }
    if (
      allowLegacy
      && hasReservationIdentity(parsed, 1, expectedFingerprint)
      && (parsed.status === 'created' || parsed.status === 'existing')
      && 'issue' in parsed
      && isLinearTicket(parsed.issue)
    ) {
      if (parsed.issue.team.id !== expectedTeamId) return null
      return {
        version: 2,
        teamId: expectedTeamId,
        fingerprint: expectedFingerprint,
        status: parsed.status,
        issue: parsed.issue,
      }
    }
    if (
      hasReservationIdentity(parsed, 2, expectedFingerprint, expectedTeamId)
      && parsed.status === 'pending'
    ) {
      return {
        version: 2,
        teamId: expectedTeamId,
        fingerprint: expectedFingerprint,
        status: 'pending',
      }
    }
    if (
      hasReservationIdentity(parsed, 2, expectedFingerprint, expectedTeamId)
      && (parsed.status === 'created' || parsed.status === 'existing')
      && 'issue' in parsed
      && isLinearTicket(parsed.issue)
      && parsed.issue.team.id === expectedTeamId
    ) {
      return {
        version: 2,
        teamId: expectedTeamId,
        fingerprint: expectedFingerprint,
        status: parsed.status,
        issue: parsed.issue,
      }
    }
    throw new Error('Registrar ticket reservation is malformed; refusing to create a possible duplicate.')
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

function hasReservationIdentity(
  value: unknown,
  version: 1 | 2,
  fingerprint: string,
  teamId?: string,
): value is Record<string, unknown> & { status: unknown } {
  return typeof value === 'object'
    && value !== null
    && 'version' in value
    && value.version === version
    && 'fingerprint' in value
    && value.fingerprint === fingerprint
    && 'status' in value
    && (version === 1 || ('teamId' in value && value.teamId === teamId))
}

async function writeReservation(path: string, reservation: TicketReservation): Promise<void> {
  const tempPath = `${path}.${process.pid}.tmp`
  await writeFile(tempPath, JSON.stringify(reservation), { flag: 'wx' })
  await rename(tempPath, path)
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'EEXIST'
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
}

function isLinearTicket(value: unknown): value is LinearTicket {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'identifier' in value
    && typeof value.identifier === 'string'
    && 'url' in value
    && typeof value.url === 'string'
    && 'team' in value
    && typeof value.team === 'object'
    && value.team !== null
    && 'id' in value.team
    && typeof value.team.id === 'string'
}

function pendingReservationError(
  teamId: string,
  fingerprint: string,
  cause?: unknown,
): Error {
  const detail = cause instanceof Error ? ` Last error: ${cause.message}` : ''
  return new Error(
    `Registrar reservation ${fingerprint} for team ${teamId} is pending; `
    + `reconcile it with Linear before retrying.${detail}`,
  )
}

function reservationIdentity(teamId: string, fingerprint: string): string {
  return `awc249-${createHash('sha256')
    .update(`${teamId}\0${fingerprint}`)
    .digest('hex')}`
}

function assertIssueTeam(issue: LinearTicket, teamId: string): void {
  if (issue.team.id !== teamId) {
    throw new Error(
      `Linear returned issue ${issue.identifier} for a different team after creation.`,
    )
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function attachIssue(
  action: RegistrarReport['ticketActions'][number],
  issue: LinearTicket,
): void {
  action.issueId = issue.id
  action.issueIdentifier = issue.identifier
  action.issueUrl = issue.url
}
