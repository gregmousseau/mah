import { randomUUID } from 'node:crypto'
import {
  boundTranscriptResponse,
  resolveAdapterExecutionPolicy,
} from '../execution-policy.js'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'
import { runActivityAwareProcess } from './activity-aware-process.js'
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

  private async run(task: string, options: ExecuteOptions): Promise<AgentResult> {
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
    const policy = resolveAdapterExecutionPolicy(options)
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
      '--timeout', String(Math.max(1, Math.ceil(policy.absoluteTimeoutMs / 1000))),
      '--message', message,
      '--json',
    ]

    const execution = await runActivityAwareProcess({
      command: process.env.OPENCLAW_CMD ?? 'openclaw',
      args,
      cwd,
      execution: options,
      terminationGraceMs: options.terminationGraceMs,
    })
    let output = execution.stderr
    let provider = 'openclaw'
    let confirmedModel = model
    let tokenUsage: AgentResult['tokenUsage']
    let parsedSuccessfully = false
    if (execution.termination.reason === 'completed' && execution.code === 0) {
      try {
        const parsed = JSON.parse(execution.stdout) as GatewayResponse
        output = parsed.result?.payloads
          ?.map(item => item.text ?? '')
          .filter(Boolean)
          .join('\n') ?? ''
        const meta = parsed.result?.meta?.agentMeta
        provider = meta?.provider ?? provider
        confirmedModel = meta?.model ?? confirmedModel
        const usage = meta?.usage
        if (usage) tokenUsage = { input: usage.input ?? 0, output: usage.output ?? 0 }
        parsedSuccessfully = Boolean(output)
      } catch {
        output = execution.stderr || 'OpenClaw gateway returned invalid JSON'
      }
    } else if (execution.error) {
      output = `Failed to invoke OpenClaw gateway: ${execution.error.message}`
    } else {
      output = execution.stdout || execution.stderr
        || `[${execution.termination.reason}; last activity ${execution.termination.lastActivityAt}]`
    }
    return {
      success:
        execution.termination.reason === 'completed'
        && execution.code === 0
        && parsedSuccessfully,
      output: boundTranscriptResponse(output, policy.transcriptMaxChars),
      provider,
      model: confirmedModel,
      rawActivityPath: execution.rawActivityPath,
      termination: execution.termination,
      timing: execution.timing,
      tokenUsage,
    }
  }
}
