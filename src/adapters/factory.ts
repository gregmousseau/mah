import type { AgentAdapter, AgentConfig, AgentResult, ExecuteOptions } from '../types.js'
import { buildAgentContext, OpenClawAdapter } from './openclaw.js'
import { CodexAdapter } from './codex.js'
import { KiloAdapter } from './kilo.js'

class ContextualAdapter implements AgentAdapter {
  constructor(
    private readonly delegate: AgentAdapter,
    readonly provider: AgentConfig['type'],
  ) {}

  preflight(options: ExecuteOptions): Promise<void> {
    return this.delegate.preflight?.(options) ?? Promise.resolve()
  }

  execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.delegate.execute(task, options)
  }

  executeWithAgent(
    task: string,
    agentId: string,
    options: ExecuteOptions & { designTier?: 'quick' | 'polished' | 'impeccable' },
  ): Promise<AgentResult> {
    return this.delegate.execute(buildAgentContext(agentId, task, options.designTier), options)
  }
}

export function createAgentAdapter(config: AgentConfig): ContextualAdapter {
  if (config.type === 'codex') return new ContextualAdapter(new CodexAdapter(), 'codex')
  if (config.type === 'kilo') return new ContextualAdapter(new KiloAdapter(), 'kilo')
  if (config.type === 'openclaw' || config.type === 'claude-cli') {
    return new ContextualAdapter(new OpenClawAdapter(), config.type)
  }
  throw new Error(`No execution adapter is configured for provider "${config.type}"`)
}

export async function preflightAdapter(adapter: AgentAdapter, config: AgentConfig): Promise<void> {
  if (!adapter.preflight) throw new Error(`Provider "${config.type}" has no fail-closed preflight`)
  await adapter.preflight({
    model: config.model,
    cwd: config.cwd,
    workspace: config.workspace,
    timeoutMs: 60_000,
  })
}
