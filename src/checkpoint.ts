import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { AgentResult, DeliveryIdentity } from './types.js'
import { inspectDeliveryPreflight } from './reliability.js'

export const RECOVERABLE_CHECKPOINT_FILE = 'recoverable-checkpoint.json'
export const RECOVERABLE_CHECKPOINT_CODE = 'MAH_RECOVERABLE_CHECKPOINT'

export interface RecoverableCheckpoint {
  version: 1
  status: 'dirty' | 'verified'
  recordedAt: string
  repoPath: string
  baseHeadSha: string
  round: number
  dirtyPaths: string[]
  termination?: AgentResult['termination']
  rawActivityPath?: string
  candidateIdentity?: DeliveryIdentity
}

export interface WorktreeCheckpointState {
  repoPath: string
  headSha: string
  dirtyPaths: string[]
}

export interface QAOnlyResumeRequest {
  candidateSha: string
  round: number
}

export function inspectWorktreeCheckpoint(
  repoPath: string,
  ignoredStatePaths: string[] = [],
): WorktreeCheckpointState {
  const requested = resolveExpanded(repoPath)
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: requested,
    encoding: 'utf8',
  }).trim()
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
  const ignored = ignoredStatePaths
    .map((path) => normalizePath(relative(repo, resolve(path))))
    .filter((path) => path && !path.startsWith('../'))
  const dirtyPaths = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repo, encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => normalizePath(line.slice(3).split(' -> ').at(-1) ?? ''))
    .filter((path) => path && !ignored.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    ))
    .sort()
  return { repoPath: repo, headSha, dirtyPaths }
}

export function persistRecoverableCheckpoint(input: {
  sprintPath: string
  repoPath: string
  ignoredStatePaths?: string[]
  round: number
  result: AgentResult
}): RecoverableCheckpoint | null {
  const state = inspectWorktreeCheckpoint(
    input.repoPath,
    input.ignoredStatePaths,
  )
  if (state.dirtyPaths.length === 0) return null
  const checkpoint: RecoverableCheckpoint = {
    version: 1,
    status: 'dirty',
    recordedAt: new Date().toISOString(),
    repoPath: state.repoPath,
    baseHeadSha: state.headSha,
    round: input.round,
    dirtyPaths: state.dirtyPaths,
    termination: input.result.termination,
    rawActivityPath: input.result.rawActivityPath,
  }
  writeFileSync(
    resolve(input.sprintPath, RECOVERABLE_CHECKPOINT_FILE),
    `${JSON.stringify(checkpoint, null, 2)}\n`,
  )
  return checkpoint
}

export function loadRecoverableCheckpoint(
  sprintPath: string,
): RecoverableCheckpoint | null {
  const path = resolve(sprintPath, RECOVERABLE_CHECKPOINT_FILE)
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as RecoverableCheckpoint
  if (parsed.version !== 1 || !Array.isArray(parsed.dirtyPaths)) {
    throw new Error(`${RECOVERABLE_CHECKPOINT_CODE}: invalid checkpoint record.`)
  }
  return parsed
}

export function recoverableCheckpointError(
  checkpoint: RecoverableCheckpoint,
): Error {
  return new Error(
    `${RECOVERABLE_CHECKPOINT_CODE}: preserved Dev R${checkpoint.round} `
    + `checkpoint with ${checkpoint.dirtyPaths.length} dirty path(s). `
    + 'Validate and commit it, then resume QA with the exact candidate SHA; '
    + 'ordinary Dev retry is blocked.',
  )
}

export function verifyQAOnlyResume(input: {
  sprintPath: string
  repoPath: string
  request: QAOnlyResumeRequest
  ignoredStatePaths?: string[]
}): DeliveryIdentity {
  const checkpoint = loadRecoverableCheckpoint(input.sprintPath)
  if (!checkpoint) {
    throw new Error(`${RECOVERABLE_CHECKPOINT_CODE}: QA-only resume requires a saved checkpoint.`)
  }
  if (checkpoint.round !== input.request.round) {
    throw new Error(
      `${RECOVERABLE_CHECKPOINT_CODE}: checkpoint round ${checkpoint.round} `
      + `does not match requested round ${input.request.round}.`,
    )
  }
  const preflight = inspectDeliveryPreflight(input.repoPath, {
    ignoredStatePaths: input.ignoredStatePaths,
  })
  if (preflight.identity.candidateSha !== input.request.candidateSha) {
    throw new Error(
      `${RECOVERABLE_CHECKPOINT_CODE}: QA-only candidate mismatch; `
      + `expected ${input.request.candidateSha}, got ${preflight.identity.candidateSha}.`,
    )
  }
  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', checkpoint.baseHeadSha, input.request.candidateSha],
      { cwd: checkpoint.repoPath, stdio: 'ignore' },
    )
  } catch {
    throw new Error(
      `${RECOVERABLE_CHECKPOINT_CODE}: candidate is not descended from the saved checkpoint base.`,
    )
  }
  const changedPaths = new Set(
    execFileSync(
      'git',
      ['diff', '--name-only', checkpoint.baseHeadSha, input.request.candidateSha, '--'],
      { cwd: checkpoint.repoPath, encoding: 'utf8' },
    ).split('\n').filter(Boolean).map(normalizePath),
  )
  const missing = checkpoint.dirtyPaths.filter((path) => !changedPaths.has(path))
  if (missing.length > 0) {
    throw new Error(
      `${RECOVERABLE_CHECKPOINT_CODE}: candidate does not contain checkpoint path(s): `
      + missing.slice(0, 3).join(', '),
    )
  }
  const verified: RecoverableCheckpoint = {
    ...checkpoint,
    status: 'verified',
    candidateIdentity: preflight.identity,
  }
  writeFileSync(
    resolve(input.sprintPath, RECOVERABLE_CHECKPOINT_FILE),
    `${JSON.stringify(verified, null, 2)}\n`,
  )
  return preflight.identity
}

function resolveExpanded(path: string): string {
  if (!path.startsWith('~/')) return resolve(path)
  return resolve(process.env.HOME ?? '', path.slice(2))
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^"+|"+$/g, '')
}
