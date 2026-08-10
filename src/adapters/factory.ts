import type { AgentAdapter, AgentConfig, AgentResult, ExecuteOptions } from '../types.js'
import { buildAgentContext, OpenClawAdapter } from './openclaw.js'
import { CodexAdapter } from './codex.js'
import { OpenClawGatewayAdapter } from './gateway.js'
import { KiloAdapter } from './kilo.js'

class ContextualAdapter implements AgentAdapter {
  constructor(
    private readonly delegate: AgentAdapter,
    readonly provider: AgentConfig['type'],
  ) {}

  preflight(options: ExecuteOptions): Promise<void> {
    return this.delegate.preflight?.(options) ?? Promise.resolve()
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.captureEvidence(await this.delegate.execute(withEvidenceRequest(task, options), options), options)
  }

  executeWithAgent(
    task: string,
    agentId: string,
    options: ExecuteOptions & { designTier?: 'quick' | 'polished' | 'impeccable' },
  ): Promise<AgentResult> {
    return this.execute(buildAgentContext(agentId, task, options.designTier), options)
  }

  private captureEvidence(result: AgentResult, options: ExecuteOptions): AgentResult {
    const request = options.evaluationEvidence
    if (!request) return result
    const marker = /(?:^|\n)MAH_EVALUATION_EVIDENCE:\s*(\{[^\n]+\})\s*$/.exec(result.output)
    const reportAvailable = finalReportArtifactAvailable(result.output)
    let reported: Partial<typeof request> & { explicitVerdict?: unknown } = {}
    try { reported = marker ? JSON.parse(marker[1]!) : {} } catch { reported = {} }
    const explicitVerdict = reported.explicitVerdict
    return {
      ...result,
      evaluationEvidence: {
        sprintId: typeof reported.sprintId === 'string' ? reported.sprintId : '',
        graderId: typeof reported.graderId === 'string' ? reported.graderId : '',
        evaluatorId: typeof reported.evaluatorId === 'string' ? reported.evaluatorId : '',
        expectedEvaluatorId: request.evaluatorId,
        candidateSha: typeof reported.candidateSha === 'string' ? reported.candidateSha : '',
        processExit: result.success ? 'completed' : result.termination?.reason === 'idle-timeout'
          || result.termination?.reason === 'absolute-timeout' ? 'timed_out' : 'failed',
        explicitVerdict: explicitVerdict === 'pass' || explicitVerdict === 'conditional' || explicitVerdict === 'fail'
          ? explicitVerdict : null,
        finalArtifact: reportAvailable ? 'available' : 'unavailable',
      },
    }
  }
}

export function finalReportArtifactAvailable(output: string): boolean {
  const marker = /(?:^|\n)MAH_EVALUATION_EVIDENCE:\s*\{[^\n]+\}\s*$/.exec(output)
  return Boolean((marker ? output.slice(0, marker.index) : output).trim())
}

function withEvidenceRequest(task: string, options: ExecuteOptions): string {
  const evidence = options.evaluationEvidence
  if (!evidence) return task
  const envelope = JSON.stringify({ ...evidence, explicitVerdict: 'VERDICT' })
  return `${task}\n\nAfter the report, emit exactly one final single-line execution envelope using the values below. Replace VERDICT with your explicit report verdict (lowercase pass, conditional, or fail):\nMAH_EVALUATION_EVIDENCE: ${envelope}`
}

export function createAgentAdapter(config: AgentConfig): ContextualAdapter {
  if (config.type === 'codex') return new ContextualAdapter(new CodexAdapter(), 'codex')
  if (config.type === 'kilo') return new ContextualAdapter(new KiloAdapter(), 'kilo')
  if (config.type === 'openclaw') return new ContextualAdapter(new OpenClawGatewayAdapter(), 'openclaw')
  if (config.type === 'claude-cli') return new ContextualAdapter(new OpenClawAdapter(), 'claude-cli')
  throw new Error(`No execution adapter is configured for provider "${config.type}"`)
}

export class ProviderPreflightError extends Error {
  constructor(
    config: AgentConfig,
    cause: unknown,
    readonly result: AgentResult,
  ) {
    super(`Provider preflight failed for ${config.type}/${config.model}: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ProviderPreflightError'
  }
}

export async function preflightAdapter(adapter: AgentAdapter, config: AgentConfig): Promise<void> {
  if (!adapter.preflight) throw new Error(`Provider "${config.type}" has no fail-closed preflight`)
  const startMs = Date.now()
  try {
    await adapter.preflight({
      model: config.model,
      cwd: config.cwd,
      workspace: config.workspace,
      timeoutMs: 60_000,
    })
  } catch (cause) {
    const endMs = Date.now()
    const actual = typeof cause === 'object' && cause !== null && 'result' in cause
      ? (cause as { result?: AgentResult }).result
      : undefined
    throw new ProviderPreflightError(config, cause, {
      success: false,
      output: actual?.output ?? (cause instanceof Error ? cause.message : String(cause)),
      provider: actual?.provider ?? config.type,
      model: actual?.model ?? config.model,
      timing: actual?.timing ?? { startMs, endMs, durationMs: endMs - startMs },
      tokenUsage: actual?.tokenUsage,
      costEstimate: actual?.costEstimate,
    })
  }
}
