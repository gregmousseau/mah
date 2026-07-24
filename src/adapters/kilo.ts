import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'

const verifiedModels = new Set<string>()

function resolvedCwd(options: ExecuteOptions): string {
  const raw = options.cwd ?? options.workspace ?? process.cwd()
  return raw.startsWith('~') ? raw.replace('~', process.env.HOME ?? '') : raw
}

function normalizedModel(model: string): string {
  return model.startsWith('kilocode/') ? model : `kilocode/${model}`
}

interface OpenClawAgentResponse {
  result?: {
    payloads?: Array<{ text?: string }>
    meta?: {
      agentMeta?: {
        provider?: string
        model?: string
      }
    }
  }
}

export class KiloAdapter implements AgentAdapter {
  async preflight(options: ExecuteOptions): Promise<void> {
    const model = options.model?.trim()
    if (!model) throw new Error('Kilo provider requires an explicit model')
    const key = `${model}:${resolvedCwd(options)}`
    if (verifiedModels.has(key)) return
    const result = await this.run('Reply with exactly: MAH_PROVIDER_OK', options)
    if (!result.success || !result.output.includes('MAH_PROVIDER_OK')) {
      throw new Error(`Kilo provider/model preflight failed for ${model}: ${result.output.slice(0, 300)}`)
    }
    verifiedModels.add(key)
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options)
  }

  private async run(task: string, options: ExecuteOptions): Promise<AgentResult> {
    const startMs = Date.now()
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
    const cwd = resolvedCwd(options)
    const model = options.model?.trim()
    if (!model) throw new Error('Kilo provider requires an explicit model')
    const executable = process.env.OPENCLAW_CMD ?? 'openclaw'
    const agentId = process.env.KILO_AGENT_ID ?? 'awc'
    const sessionId = `mah-kilo-${randomUUID()}`
    const message = [
      `Work only in this directory: ${cwd}`,
      'Do not use prior chat history. Complete the task below and return the result.',
      'You are already executing inside a MAH sprint; do not start or delegate to another MAH sprint.',
      '',
      task,
    ].join('\n')
    const args = [
      'agent',
      '--agent', agentId,
      '--session-id', sessionId,
      '--model', normalizedModel(model),
      '--thinking', 'high',
      '--timeout', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      '--message', message,
      '--json',
    ]

    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { stderr += chunk.toString() })
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
        const endMs = Date.now()
        resolve({
          success: false,
          output: stdout || stderr || `[Timeout after ${timeoutMs / 1000}s]`,
          provider: 'kilo',
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      }, timeoutMs)
      child.on('close', code => {
        clearTimeout(timer)
        const endMs = Date.now()
        let output = stdout
        let provider = 'kilo'
        let parsedSuccessfully = false
        if (code === 0) {
          try {
            const parsed = JSON.parse(stdout) as OpenClawAgentResponse
            output = parsed.result?.payloads
              ?.map(payload => payload.text ?? '')
              .filter(Boolean)
              .join('\n') ?? ''
            provider = parsed.result?.meta?.agentMeta?.provider ?? provider
            parsedSuccessfully = Boolean(output)
          } catch {
            output = stderr || 'Kilo gateway returned invalid JSON'
          }
        }
        resolve({
          success: code === 0 && parsedSuccessfully,
          output: output || stderr || `[Process exited with code ${code}]`,
          provider,
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      })
      child.on('error', err => {
        clearTimeout(timer)
        reject(new Error(`Failed to invoke Kilo through OpenClaw: ${err.message}`))
      })
    })
  }
}
