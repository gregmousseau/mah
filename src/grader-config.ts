import { createAgentAdapter, preflightAdapter } from './adapters/factory.js'
import type { AgentConfig, Grader, ProjectConfig, SprintContract } from './types.js'

export function resolveEnabledGraders(
  contract: SprintContract,
  config: ProjectConfig,
  executionTarget: string,
): Grader[] {
  const rawGraders = contract.graders?.filter((grader) => grader.enabled) ?? [{
    id: 'ux-quinn',
    type: 'ux' as const,
    name: 'Quinn (UX)',
    agent: config.agents.evaluator,
    enabled: true,
  }]
  const runtimeEvaluator = config.runtime?.agentOverrides?.evaluator

  return rawGraders.map((grader) => {
    const configuredAgent = grader.agent ?? config.agents.evaluator
    const evaluatorOverride = grader.id === 'independent-risk-review'
      ? undefined
      : runtimeEvaluator
    const agent: AgentConfig = {
      ...configuredAgent,
      ...(evaluatorOverride ?? {}),
      // Review and QA workers inspect the candidate only. This invariant must
      // not depend on legacy/project configuration or a runtime override.
      readOnly: true,
    }
    if (grader.type === 'code-review' || !agent.workspace) agent.cwd = executionTarget
    return { ...grader, agent }
  })
}

export async function preflightEnabledGraders(graders: Grader[]): Promise<void> {
  if (graders.length === 0) throw new Error('No enabled graders are configured')
  const seen = new Set<string>()
  for (const grader of graders) {
    if (grader.type !== 'ux' && grader.type !== 'code-review') {
      throw new Error(`Grader type "${grader.type}" has no execution adapter`)
    }
    if (grader.agent.type !== 'codex' && grader.agent.type !== 'claude-cli') {
      throw new Error(
        `Grader "${grader.id}" provider "${grader.agent.type}" cannot prove read-only execution; use codex or claude-cli`,
      )
    }
    const key = JSON.stringify({
      type: grader.agent.type,
      model: grader.agent.model,
      reasoningEffort: grader.agent.reasoningEffort,
      fastMode: grader.agent.fastMode,
      readOnly: grader.agent.readOnly,
      cwd: grader.agent.cwd,
      workspace: grader.agent.workspace,
    })
    if (seen.has(key)) continue
    seen.add(key)
    await preflightAdapter(createAgentAdapter(grader.agent), grader.agent)
  }
}
