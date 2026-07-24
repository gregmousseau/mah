import type {
  AgentTerminationReason,
  ExecuteOptions,
  ProjectConfig,
} from './types.js'

const MINUTE_MS = 60_000

export const DEFAULT_DEV_IDLE_TIMEOUT_MS = 12 * MINUTE_MS
export const DEFAULT_DEV_ABSOLUTE_TIMEOUT_MS = 45 * MINUTE_MS
export const DEFAULT_TRANSCRIPT_MAX_CHARS = 32_000

export interface ExecutionPolicy {
  idleTimeoutMs: number
  absoluteTimeoutMs: number
  transcriptMaxChars: number
}

export interface ExecutionDeadlineState {
  startedAtMs: number
  lastActivityAtMs: number
}

export function resolveDevExecutionPolicy(
  config: Pick<ProjectConfig, 'execution'>,
): ExecutionPolicy {
  const execution = config.execution
  return {
    idleTimeoutMs:
      (execution?.devIdleTimeoutMinutes ?? DEFAULT_DEV_IDLE_TIMEOUT_MS / MINUTE_MS)
      * MINUTE_MS,
    absoluteTimeoutMs:
      (execution?.devAbsoluteTimeoutMinutes ?? DEFAULT_DEV_ABSOLUTE_TIMEOUT_MS / MINUTE_MS)
      * MINUTE_MS,
    transcriptMaxChars:
      execution?.transcriptMaxChars ?? DEFAULT_TRANSCRIPT_MAX_CHARS,
  }
}

export function resolveAdapterExecutionPolicy(
  options: ExecuteOptions,
): ExecutionPolicy {
  const compatibilityTimeout = options.timeoutMs
  const idleTimeoutMs =
    options.idleTimeoutMs
    ?? compatibilityTimeout
    ?? DEFAULT_DEV_IDLE_TIMEOUT_MS
  const absoluteTimeoutMs =
    options.absoluteTimeoutMs
    ?? compatibilityTimeout
    ?? DEFAULT_DEV_ABSOLUTE_TIMEOUT_MS
  if (idleTimeoutMs <= 0 || absoluteTimeoutMs <= 0) {
    throw new Error('Execution timeouts must be positive.')
  }
  if (absoluteTimeoutMs < idleTimeoutMs) {
    throw new Error('Absolute timeout must be greater than or equal to idle timeout.')
  }
  return {
    idleTimeoutMs,
    absoluteTimeoutMs,
    transcriptMaxChars: options.transcriptMaxChars ?? DEFAULT_TRANSCRIPT_MAX_CHARS,
  }
}

export function deadlineReason(
  state: ExecutionDeadlineState,
  policy: Pick<ExecutionPolicy, 'idleTimeoutMs' | 'absoluteTimeoutMs'>,
  nowMs: number,
): Extract<AgentTerminationReason, 'idle-timeout' | 'absolute-timeout'> | null {
  if (nowMs - state.startedAtMs >= policy.absoluteTimeoutMs) {
    return 'absolute-timeout'
  }
  if (nowMs - state.lastActivityAtMs >= policy.idleTimeoutMs) {
    return 'idle-timeout'
  }
  return null
}

export function nextDeadlineDelay(
  state: ExecutionDeadlineState,
  policy: Pick<ExecutionPolicy, 'idleTimeoutMs' | 'absoluteTimeoutMs'>,
  nowMs: number,
): number {
  const idleRemaining = state.lastActivityAtMs + policy.idleTimeoutMs - nowMs
  const absoluteRemaining = state.startedAtMs + policy.absoluteTimeoutMs - nowMs
  return Math.max(1, Math.min(idleRemaining, absoluteRemaining))
}

export function boundTranscriptResponse(
  value: string,
  maxChars = DEFAULT_TRANSCRIPT_MAX_CHARS,
): string {
  if (value.length <= maxChars) return value
  const marker = `\n\n[MAH bounded transcript: omitted ${value.length - maxChars} characters; full raw activity is stored separately]\n\n`
  const available = Math.max(0, maxChars - marker.length)
  const headChars = Math.ceil(available / 3)
  const tailChars = available - headChars
  return `${value.slice(0, headChars)}${marker}${value.slice(value.length - tailChars)}`
}

export function devExecuteOptions(
  config: Pick<ProjectConfig, 'execution'>,
  options: Omit<ExecuteOptions, 'timeoutMs' | 'idleTimeoutMs' | 'absoluteTimeoutMs' | 'transcriptMaxChars'>,
): ExecuteOptions {
  const policy = resolveDevExecutionPolicy(config)
  return {
    ...options,
    idleTimeoutMs: policy.idleTimeoutMs,
    absoluteTimeoutMs: policy.absoluteTimeoutMs,
    transcriptMaxChars: policy.transcriptMaxChars,
  }
}
