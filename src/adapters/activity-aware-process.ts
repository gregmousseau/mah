import { spawn } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { resolveAdapterExecutionPolicy } from '../execution-policy.js'
import type {
  AgentTerminationReason,
  ExecuteOptions,
} from '../types.js'

export interface ActivityAwareProcessResult {
  stdout: string
  stderr: string
  code: number | null
  error?: Error
  rawActivityPath?: string
  termination: {
    reason: AgentTerminationReason
    lastActivityAt: string
  }
  timing: {
    startMs: number
    endMs: number
    durationMs: number
  }
}

export interface ActivityAwareProcessOptions {
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  stdin?: string
  execution: ExecuteOptions
  terminationGraceMs?: number
}

/**
 * Run a provider CLI under the execution policy shared by every MAH adapter.
 *
 * stdout/stderr activity resets the idle deadline. The absolute deadline never
 * moves. Timeout termination targets the entire process group and does not
 * resolve until the SIGKILL escalation has run, so checkpoint inspection
 * cannot race descendants that outlive the CLI leader.
 */
export function runActivityAwareProcess(
  options: ActivityAwareProcessOptions,
): Promise<ActivityAwareProcessResult> {
  const startMs = Date.now()
  const policy = resolveAdapterExecutionPolicy(options.execution)
  const rawActivityPath = options.execution.rawActivityPath
  const terminationGraceMs = options.terminationGraceMs ?? 5_000
  if (rawActivityPath) {
    mkdirSync(dirname(rawActivityPath), { recursive: true })
    writeFileSync(rawActivityPath, '')
  }

  return new Promise((resolve) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      env: options.env ?? { ...process.env },
      detached: process.platform !== 'win32',
    })
    let stdout = ''
    let stderr = ''
    let code: number | null = null
    let lastActivityAtMs = startMs
    let terminationReason: AgentTerminationReason | null = null
    let settled = false
    let idleTimer: NodeJS.Timeout | undefined
    let absoluteTimer: NodeJS.Timeout | undefined
    let killTimer: NodeJS.Timeout | undefined

    const signalProcess = (signal: NodeJS.Signals): void => {
      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, signal)
        } else {
          child.kill(signal)
        }
      } catch {
        // The process group may already be gone.
      }
    }

    const clearDeadlineTimers = (): void => {
      if (idleTimer) clearTimeout(idleTimer)
      if (absoluteTimer) clearTimeout(absoluteTimer)
    }

    const settle = (
      reason: AgentTerminationReason,
      error?: Error,
    ): void => {
      if (settled) return
      settled = true
      clearDeadlineTimers()
      if (killTimer) clearTimeout(killTimer)
      const endMs = Date.now()
      resolve({
        stdout,
        stderr,
        code,
        error,
        rawActivityPath,
        termination: {
          reason,
          lastActivityAt: new Date(lastActivityAtMs).toISOString(),
        },
        timing: { startMs, endMs, durationMs: endMs - startMs },
      })
    }

    const terminate = (
      reason: Extract<AgentTerminationReason, 'idle-timeout' | 'absolute-timeout'>,
    ): void => {
      if (settled || terminationReason) return
      terminationReason = reason
      clearDeadlineTimers()
      signalProcess('SIGTERM')
      killTimer = setTimeout(() => {
        signalProcess('SIGKILL')
        settle(reason)
      }, terminationGraceMs)
    }

    function scheduleIdleTimer(): void {
      if (settled || terminationReason) return
      if (idleTimer) clearTimeout(idleTimer)
      const delayMs = Math.max(
        1,
        lastActivityAtMs + policy.idleTimeoutMs - Date.now(),
      )
      idleTimer = setTimeout(() => {
        if (Date.now() - lastActivityAtMs >= policy.idleTimeoutMs) {
          terminate('idle-timeout')
        } else {
          scheduleIdleTimer()
        }
      }, delayMs)
    }

    const recordActivity = (
      stream: 'stdout' | 'stderr',
      chunk: Buffer,
    ): void => {
      const value = chunk.toString()
      lastActivityAtMs = Date.now()
      if (stream === 'stdout') stdout += value
      else stderr += value
      if (rawActivityPath) appendFileSync(rawActivityPath, `[${stream}] ${value}`)
      scheduleIdleTimer()
    }

    child.stdout!.on('data', (chunk: Buffer) => recordActivity('stdout', chunk))
    child.stderr!.on('data', (chunk: Buffer) => recordActivity('stderr', chunk))
    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin, 'utf8')
      child.stdin?.end()
    }

    scheduleIdleTimer()
    absoluteTimer = setTimeout(
      () => terminate('absolute-timeout'),
      policy.absoluteTimeoutMs,
    )

    child.on('close', (exitCode) => {
      code = exitCode
      if (terminationReason) {
        // Wait for the scheduled process-group SIGKILL before allowing callers
        // to inspect or commit a dirty checkpoint.
        return
      }
      settle(exitCode === 0 ? 'completed' : 'process-exit')
    })
    child.on('error', (error) => {
      settle('spawn-error', error)
    })
  })
}
