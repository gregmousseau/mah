import { spawn } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  boundTranscriptResponse,
  resolveAdapterExecutionPolicy,
} from '../execution-policy.js'
import type {
  AgentAdapter,
  AgentResult,
  AgentTerminationReason,
  ExecuteOptions,
} from '../types.js'
import { AdapterPreflightError } from './errors.js'

const verifiedModels = new Set<string>()

function resolvedCwd(options: ExecuteOptions): string {
  const raw = options.cwd ?? options.workspace ?? process.cwd()
  return raw.startsWith('~') ? raw.replace('~', process.env.HOME ?? '') : raw
}

export class CodexAdapter implements AgentAdapter {
  async preflight(options: ExecuteOptions): Promise<void> {
    const model = options.model?.trim()
    if (!model) throw new Error('Codex provider requires an explicit model')
    const key = `${model}:${resolvedCwd(options)}`
    if (verifiedModels.has(key)) return
    const result = await this.run('Reply with exactly: MAH_PROVIDER_OK', options, true)
    if (!result.success || !result.output.includes('MAH_PROVIDER_OK')) {
      throw new AdapterPreflightError(
        `Codex provider/model preflight failed for ${model}: ${result.output.slice(0, 300)}`,
        result,
      )
    }
    verifiedModels.add(key)
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options, false)
  }

  private async run(task: string, options: ExecuteOptions, readOnly: boolean): Promise<AgentResult> {
    const startMs = Date.now()
    const model = options.model?.trim()
    if (!model) throw new Error('Codex provider requires an explicit model')
    const policy = resolveAdapterExecutionPolicy(options)
    const cwd = resolvedCwd(options)
    const outputDir = mkdtempSync(join(tmpdir(), 'mah-codex-'))
    const outputPath = join(outputDir, 'last-message.txt')
    const rawActivityPath = options.rawActivityPath
    if (rawActivityPath) {
      mkdirSync(dirname(rawActivityPath), { recursive: true })
      writeFileSync(rawActivityPath, '')
    }
    const args = [
      'exec',
      '--model', model,
      '--cd', cwd,
      '--ephemeral',
      '--color', 'never',
      '--output-last-message', outputPath,
      ...(readOnly
        ? ['--sandbox', 'read-only']
        : ['--dangerously-bypass-approvals-and-sandbox']),
      '-',
    ]

    return new Promise((resolve) => {
      const child = spawn('codex', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        detached: process.platform !== 'win32',
      })
      let stdout = ''
      let stderr = ''
      let lastActivityAtMs = startMs
      let terminationReason: AgentTerminationReason | null = null
      let settled = false
      let idleTimer: NodeJS.Timeout | undefined
      let absoluteTimer: NodeJS.Timeout | undefined
      let killTimer: NodeJS.Timeout | undefined

      const recordActivity = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        const value = chunk.toString()
        lastActivityAtMs = Date.now()
        if (stream === 'stdout') stdout += value
        else stderr += value
        if (rawActivityPath) appendFileSync(rawActivityPath, `[${stream}] ${value}`)
        scheduleIdleTimer()
      }

      child.stdout.on('data', (chunk: Buffer) => recordActivity('stdout', chunk))
      child.stderr.on('data', (chunk: Buffer) => recordActivity('stderr', chunk))
      child.stdin.write(task, 'utf-8')
      child.stdin.end()

      const clearTimers = (): void => {
        if (idleTimer) clearTimeout(idleTimer)
        if (absoluteTimer) clearTimeout(absoluteTimer)
        if (killTimer) clearTimeout(killTimer)
      }

      const finish = (
        success: boolean,
        fallback: string,
        reason: AgentTerminationReason,
      ): AgentResult => {
        const endMs = Date.now()
        let output = fallback
        if (existsSync(outputPath)) output = readFileSync(outputPath, 'utf-8')
        rmSync(outputDir, { recursive: true, force: true })
        return {
          success,
          output: boundTranscriptResponse(output, policy.transcriptMaxChars),
          provider: 'codex',
          model,
          rawActivityPath,
          termination: {
            reason,
            lastActivityAt: new Date(lastActivityAtMs).toISOString(),
          },
          timing: { startMs, endMs, durationMs: endMs - startMs },
          costEstimate: 0,
        }
      }

      const settle = (
        success: boolean,
        fallback: string,
        reason: AgentTerminationReason,
      ): void => {
        if (settled) return
        settled = true
        clearTimers()
        resolve(finish(success, fallback, reason))
      }

      const terminate = (
        reason: Extract<AgentTerminationReason, 'idle-timeout' | 'absolute-timeout'>,
      ): void => {
        if (settled || terminationReason) return
        terminationReason = reason
        signalProcess('SIGTERM')
        killTimer = setTimeout(() => signalProcess('SIGKILL'), 5000)
      }

      const signalProcess = (signal: NodeJS.Signals): void => {
        try {
          if (process.platform !== 'win32' && child.pid) {
            process.kill(-child.pid, signal)
          } else {
            child.kill(signal)
          }
        } catch {
          // The process may have exited between the timeout and signal.
        }
      }

      function scheduleIdleTimer(): void {
        if (settled || terminationReason) return
        if (idleTimer) clearTimeout(idleTimer)
        const nowMs = Date.now()
        const delayMs = Math.max(1, lastActivityAtMs + policy.idleTimeoutMs - nowMs)
        idleTimer = setTimeout(() => {
          if (Date.now() - lastActivityAtMs >= policy.idleTimeoutMs) {
            terminate('idle-timeout')
          } else {
            scheduleIdleTimer()
          }
        }, delayMs)
      }

      scheduleIdleTimer()
      absoluteTimer = setTimeout(
        () => terminate('absolute-timeout'),
        policy.absoluteTimeoutMs,
      )

      child.on('close', code => {
        const reason = terminationReason ?? (code === 0 ? 'completed' : 'process-exit')
        const timeoutFallback = terminationReason
          ? `[${terminationReason}; last activity ${new Date(lastActivityAtMs).toISOString()}]`
          : `[Process exited with code ${code}]`
        settle(
          terminationReason === null && code === 0,
          stdout || stderr || timeoutFallback,
          reason,
        )
      })
      child.on('error', err => {
        settle(false, `Failed to spawn Codex: ${err.message}`, 'spawn-error')
      })
    })
  }
}
