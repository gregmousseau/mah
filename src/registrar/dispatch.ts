import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createTodoIssue,
  findIssueByRegistrarFingerprint,
  type LinearTicket,
} from '../integrations/linear.js'
import { sanitizeEvidence } from './redact.js'
import type { RegistrarReport } from './types.js'

export interface FindingTicketClient {
  findByFingerprint(fingerprint: string): Promise<LinearTicket | null>
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
  version: 1
  fingerprint: string
  status: 'pending'
}

interface CompletedReservation {
  version: 1
  fingerprint: string
  status: 'created' | 'existing'
  issue: LinearTicket
}

type TicketReservation = PendingReservation | CompletedReservation

export async function dispatchFindingTickets(
  report: RegistrarReport,
  teamId: string | undefined,
  client: FindingTicketClient = defaultClient,
  options: { reservationDirectory?: string } = {},
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
  const receiptPath = resolve(root, `${action.fingerprint}.json`)
  const lockPath = resolve(root, `${action.fingerprint}.lock`)

  const beforeLock = await readReservation(receiptPath, action.fingerprint)
  if (beforeLock?.status === 'pending') throw pendingReservationError(action.fingerprint)
  if (beforeLock) return { issue: beforeLock.issue, created: false }

  await acquireLock(lockPath)
  try {
    const reservation = await readReservation(receiptPath, action.fingerprint)
    if (reservation?.status === 'pending') throw pendingReservationError(action.fingerprint)
    if (reservation) return { issue: reservation.issue, created: false }

    const existing = await client.findByFingerprint(action.fingerprint)
    if (existing) {
      await writeReservation(receiptPath, {
        version: 1,
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
      version: 1,
      fingerprint: action.fingerprint,
      status: 'pending',
    })
    const created = await client.createTodo(teamId, action.title, action.body)
    await writeReservation(receiptPath, {
      version: 1,
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
  const pending = receipts.get(action.fingerprint)
  if (pending) {
    const result = await pending
    return { issue: result.issue, created: false }
  }

  const operation = (async () => {
    const existing = await client.findByFingerprint(action.fingerprint)
    if (existing) return { issue: existing, created: false }
    return { issue: await client.createTodo(teamId, action.title, action.body), created: true }
  })()
  receipts.set(action.fingerprint, operation)
  try {
    return await operation
  } catch (error) {
    receipts.delete(action.fingerprint)
    throw error
  }
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

async function readReservation(
  path: string,
  expectedFingerprint: string,
): Promise<TicketReservation | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (isLinearTicket(parsed)) {
      // Backward compatibility for receipts written by the first rollout.
      return {
        version: 1,
        fingerprint: expectedFingerprint,
        status: 'existing',
        issue: parsed,
      }
    }
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'version' in parsed
      && parsed.version === 1
      && 'fingerprint' in parsed
      && parsed.fingerprint === expectedFingerprint
      && 'status' in parsed
      && parsed.status === 'pending'
    ) {
      return parsed as PendingReservation
    }
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'version' in parsed
      && parsed.version === 1
      && 'fingerprint' in parsed
      && parsed.fingerprint === expectedFingerprint
      && 'status' in parsed
      && (parsed.status === 'created' || parsed.status === 'existing')
      && 'issue' in parsed
      && isLinearTicket(parsed.issue)
    ) {
      return parsed as CompletedReservation
    }
    throw new Error('Registrar ticket reservation is malformed; refusing to create a possible duplicate.')
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
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
}

function pendingReservationError(fingerprint: string): Error {
  return new Error(
    `Registrar reservation ${fingerprint} is pending; reconcile it with Linear before retrying.`,
  )
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
