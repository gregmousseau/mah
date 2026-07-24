import { randomUUID } from 'node:crypto'
import {
  boundTranscriptResponse,
  resolveAdapterExecutionPolicy,
} from '../execution-policy.js'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'
import { runActivityAwareProcess } from './activity-aware-process.js'
import { AdapterPreflightError } from './errors.js'

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
        usage?: { input?: number; output?: number }
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
    const expectedModel = model.replace(/^kilocode\//, '')
    if (
      !result.success ||
      !result.output.includes('MAH_PROVIDER_OK') ||
      result.provider !== 'kilocode' ||
      result.model !== expectedModel
    ) {
      throw new AdapterPreflightError(
        `Kilo provider/model preflight failed for ${model}: ${result.output.slice(0, 300)}`,
        result,
      )
    }
    verifiedModels.add(key)
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options)
  }

  private async run(task: string, options: ExecuteOptions): Promise<AgentResult> {
    const policy = resolveAdapterExecutionPolicy(options)
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
      '--timeout', String(Math.max(1, Math.ceil(policy.absoluteTimeoutMs / 1000))),
      '--message', message,
      '--json',
    ]

    const execution = await runActivityAwareProcess({
      command: executable,
      args,
      cwd,
      execution: options,
      terminationGraceMs: options.terminationGraceMs,
    })
    let output = execution.stdout
    let provider = 'kilo'
    let confirmedModel = model
    let tokenUsage: AgentResult['tokenUsage']
    let parsedSuccessfully = false
    if (execution.termination.reason === 'completed' && execution.code === 0) {
      try {
        const parsed = JSON.parse(execution.stdout) as OpenClawAgentResponse
        output = parsed.result?.payloads
          ?.map(payload => payload.text ?? '')
          .filter(Boolean)
          .join('\n') ?? ''
        provider = parsed.result?.meta?.agentMeta?.provider ?? provider
        confirmedModel = parsed.result?.meta?.agentMeta?.model ?? confirmedModel
        const usage = parsed.result?.meta?.agentMeta?.usage
        if (usage) tokenUsage = { input: usage.input ?? 0, output: usage.output ?? 0 }
        parsedSuccessfully = Boolean(output)
      } catch {
        output = execution.stderr || 'Kilo gateway returned invalid JSON'
      }
    } else if (execution.error) {
      output = `Failed to invoke Kilo through OpenClaw: ${execution.error.message}`
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
      costEstimate: 0,
    }
  }
}
