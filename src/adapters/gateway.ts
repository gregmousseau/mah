import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'
import { AdapterPreflightError } from './errors.js'

interface GatewayResponse {
  result?: {
    payloads?: Array<{ text?: string }>
    meta?: {
      agentMeta?: {
        provider?: string
        model?: string
        usage?: { input?: number; output?: number }
      }
    }
  }
}

function resolvedCwd(options: ExecuteOptions): string {
  const raw = options.cwd ?? options.workspace ?? process.cwd()
  return raw.startsWith('~') ? raw.replace('~', process.env.HOME ?? '') : raw
}

export class OpenClawGatewayAdapter implements AgentAdapter {
  async preflight(options: ExecuteOptions): Promise<void> {
    const result = await this.run('Reply with exactly: MAH_PROVIDER_OK', options)
    const requested = options.model?.trim() ?? ''
    const separator = requested.indexOf('/')
    if (separator < 1) {
      throw new AdapterPreflightError(
        `OpenClaw gateway requires an explicit provider/model, received "${requested}"`,
        result,
      )
    }
    const expectedProvider = requested.slice(0, separator)
    const expectedModel = requested.slice(separator + 1)
    if (
      !result.success ||
      !result.output.includes('MAH_PROVIDER_OK') ||
      result.provider !== expectedProvider ||
      result.model !== expectedModel
    ) {
      throw new AdapterPreflightError(
        `OpenClaw gateway preflight failed for ${requested}: ${result.output.slice(0, 300)}`,
        result,
      )
    }
  }

  execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options)
  }

  private run(task: string, options: ExecuteOptions): Promise<AgentResult> {
    const startMs = Date.now()
    const model = options.model?.trim()
    if (!model) throw new Error('OpenClaw provider requires an explicit provider/model')
    if (/^(anthropic\/|.*claude)/i.test(model)) {
      const endMs = Date.now()
      return Promise.resolve({
        success: false,
        output: 'Claude models require the explicit claude-cli provider',
        provider: 'openclaw',
        model,
        timing: { startMs, endMs, durationMs: endMs - startMs },
      })
    }
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
    const cwd = resolvedCwd(options)
    const message = [
      `Work only in this directory: ${cwd}`,
      'Do not use prior chat history. You are already inside MAH; do not start another MAH sprint.',
      '',
      task,
    ].join('\n')
    const args = [
      'agent',
      '--agent', process.env.OPENCLAW_AGENT_ID ?? 'awc',
      '--session-id', `mah-gateway-${randomUUID()}`,
      '--model', model,
      '--thinking', 'high',
      '--timeout', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      '--message', message,
      '--json',
    ]

    return new Promise((resolve, reject) => {
      const child = spawn(process.env.OPENCLAW_CMD ?? 'openclaw', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
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
          provider: 'openclaw',
          model,
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      }, timeoutMs)
      child.on('close', code => {
        clearTimeout(timer)
        const endMs = Date.now()
        try {
          const parsed = JSON.parse(stdout) as GatewayResponse
          const output = parsed.result?.payloads?.map(item => item.text ?? '').filter(Boolean).join('\n') ?? ''
          const meta = parsed.result?.meta?.agentMeta
          const usage = meta?.usage
          resolve({
            success: code === 0 && Boolean(output),
            output: output || stderr || 'OpenClaw gateway returned no response',
            provider: meta?.provider ?? 'openclaw',
            model: meta?.model ?? model,
            timing: { startMs, endMs, durationMs: endMs - startMs },
            tokenUsage: usage ? { input: usage.input ?? 0, output: usage.output ?? 0 } : undefined,
          })
        } catch {
          resolve({
            success: false,
            output: stderr || 'OpenClaw gateway returned invalid JSON',
            provider: 'openclaw',
            model,
            timing: { startMs, endMs, durationMs: endMs - startMs },
          })
        }
      })
      child.on('error', error => {
        clearTimeout(timer)
        const endMs = Date.now()
        resolve({
          success: false,
          output: `Failed to invoke OpenClaw gateway: ${error.message}`,
          provider: 'openclaw',
          model,
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      })
    })
  }
}
