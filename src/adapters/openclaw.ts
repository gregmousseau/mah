import { spawn } from 'node:child_process'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'
import { getAgentWorkspace, getAgentName } from '../lib/agentRegistry.js'
import { AdapterPreflightError } from './errors.js'

// Frontend design tiers — like QA tiers but for UI quality
export type DesignTier = 'quick' | 'polished' | 'impeccable'

const DESIGN_BRIEF_DIR = join(__dirname, '..', 'design-briefs')
const IMPECCABLE_SKILLS_DIR = '/home/greg/.openclaw/skills/impeccable'

const DESIGN_TIER_PATHS: Record<DesignTier, string[]> = {
  quick: [join(DESIGN_BRIEF_DIR, 'quick.md')],
  polished: [join(IMPECCABLE_SKILLS_DIR, 'frontend-design', 'SKILL.md')],
  impeccable: [
    join(IMPECCABLE_SKILLS_DIR, 'frontend-design', 'SKILL.md'),
    join(IMPECCABLE_SKILLS_DIR, 'polish', 'SKILL.md'),
    join(IMPECCABLE_SKILLS_DIR, 'animate', 'SKILL.md'),
  ],
}

function readFileSafe(path: string): string | null {
  try {
    if (existsSync(path)) return readFileSync(path, 'utf-8')
  } catch { /* ignore */ }
  return null
}

function inferDesignTier(task: string): DesignTier {
  const lower = task.toLowerCase()
  const impeccableSignals = ['pixel perfect', 'production-ready', 'flagship', 'impeccable', 'world-class']
  const polishedSignals = ['make it nice', 'take your time', 'polished', 'high quality', 'beautiful', 'prioritize quality']
  if (impeccableSignals.some(s => lower.includes(s))) return 'impeccable'
  if (polishedSignals.some(s => lower.includes(s))) return 'polished'
  return 'quick'
}

export function buildAgentContext(agentId: string, task: string, designTier?: DesignTier): string {
  const workspace = getAgentWorkspace(agentId)
  const agentName = getAgentName(agentId) || agentId

  if (!workspace || !existsSync(workspace)) {
    return task
  }

  const soul = readFileSafe(join(workspace, 'SOUL.md'))
  if (!soul) return task

  let context = `You are ${agentName}. ${soul}\n\n---\n\nTask:\n${task}`

  // For Frankie: load design brief based on tier
  if (agentId === 'frontend-dev') {
    const tier = designTier || inferDesignTier(task)
    const paths = DESIGN_TIER_PATHS[tier]
    const briefs = paths.map(p => readFileSafe(p)).filter(Boolean)
    if (briefs.length > 0) {
      const tierLabel = tier === 'quick' ? 'Quick' : tier === 'polished' ? 'Polished' : 'Impeccable'
      context = `You are ${agentName}. ${soul}\n\n---\n\n## Design Brief (${tierLabel} tier)\n\n${briefs.join('\n\n---\n\n')}\n\n---\n\nTask:\n${task}`
    }
  }

  return context
}

// Per MTok pricing (rough estimates for cost tracking)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  haiku:  { input: 0.25, output: 1.25 },
  sonnet: { input: 3,    output: 15   },
  opus:   { input: 15,   output: 75   },
}

function getPricing(model: string): { input: number; output: number } {
  const key = Object.keys(MODEL_PRICING).find(k => model.toLowerCase().includes(k))
  return key ? MODEL_PRICING[key] : MODEL_PRICING['sonnet']
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model)
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

// Check if claude CLI is available
function isClaudeAvailable(): boolean {
  try {
    execSync('which claude', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export class OpenClawAdapter implements AgentAdapter {
  private useMock: boolean

  constructor() {
    this.useMock = !isClaudeAvailable()
    if (this.useMock) {
      console.warn('[mah] Warning: claude CLI not found in PATH — using mock adapter')
    }
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    if (this.useMock) {
      return this.executeMock(task, options)
    }
    return this.executeClaude(task, options)
  }

  async preflight(options: ExecuteOptions): Promise<void> {
    if (this.useMock) {
      throw new Error('Claude CLI is unavailable; delivery runs may not use the mock adapter')
    }
    const result = await this.executeClaude('Reply with exactly: MAH_PROVIDER_OK', {
      ...options,
      cwd: options.cwd ?? process.cwd(),
      timeoutMs: Math.min(options.timeoutMs ?? 60_000, 60_000),
    })
    if (
      !result.success ||
      result.provider !== 'claude' ||
      !result.output.includes('MAH_PROVIDER_OK')
    ) {
      throw new AdapterPreflightError(
        `Claude provider/model preflight failed for ${options.model ?? 'sonnet'}`,
        result,
      )
    }
  }

  /**
   * Execute a task with an agent's SOUL.md prepended as context.
   * Falls back to plain execute() if the agent workspace doesn't exist.
   */
  async executeWithAgent(task: string, agentId: string, options: ExecuteOptions & { designTier?: DesignTier } = {}): Promise<AgentResult> {
    const enrichedTask = buildAgentContext(agentId, task, options.designTier)
    return this.execute(enrichedTask, options)
  }

  private async executeClaude(task: string, options: ExecuteOptions): Promise<AgentResult> {
    const startMs = Date.now()
    const model = options.model ?? 'sonnet'
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
    const rawCwd = options.cwd ?? options.workspace ?? process.cwd()
    const cwd = rawCwd.startsWith('~') ? rawCwd.replace('~', process.env.HOME ?? '') : rawCwd

    const args = [
      '--print',
      '--model', model,
      '--permission-mode', 'bypassPermissions',
    ]

    const spawnEnv = { ...process.env }
    delete spawnEnv.CLAUDECODE
    delete spawnEnv.ANTHROPIC_API_KEY  // Force OAuth/Max plan instead of API billing
    const claudePath = process.env.CLAUDE_CMD ?? 'claude'

    return new Promise((resolve, reject) => {
      const child = spawn(claudePath, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: spawnEnv,
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      // Write task to stdin and close
      child.stdin.write(task, 'utf-8')
      child.stdin.end()

      // Timeout handling
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
        const endMs = Date.now()
        resolve({
          success: false,
          output: stdout || `[Timeout after ${timeoutMs / 1000}s]`,
          provider: 'claude',
          model,
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      }, timeoutMs)

      child.on('close', (code) => {
        clearTimeout(timer)
        const endMs = Date.now()
        const durationMs = endMs - startMs
        const success = code === 0

        // Estimate tokens: input from task length, output from response length
        const inputTokens = Math.ceil(task.length / 4)
        const outputTokens = Math.ceil(stdout.length / 4)

        resolve({
          success,
          output: stdout || (success ? '' : `[Process exited with code ${code}]\n${stderr}`),
          provider: 'claude',
          model,
          timing: { startMs, endMs, durationMs },
          tokenUsage: { input: inputTokens, output: outputTokens },
          costEstimate: estimateCost(model, inputTokens, outputTokens),
        })
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        const endMs = Date.now()
        resolve({
          success: false,
          output: `Failed to spawn Claude: ${err.message}`,
          provider: 'claude',
          model,
          timing: { startMs, endMs, durationMs: endMs - startMs },
          costEstimate: 0,
        })
      })
    })
  }

  private async executeMock(task: string, options: ExecuteOptions): Promise<AgentResult> {
    const startMs = Date.now()
    const label = options.label ?? 'unknown'

    // Simulate a brief delay
    await new Promise(r => setTimeout(r, 200))

    const output = generateMockOutput(task, label)

    const endMs = Date.now()
    const inputTokens = Math.ceil(task.length / 4)
    const outputTokens = Math.ceil(output.length / 4)
    const model = options.model ?? 'sonnet'

    return {
      success: true,
      output,
      provider: 'mock',
      timing: { startMs, endMs, durationMs: endMs - startMs },
      tokenUsage: { input: inputTokens, output: outputTokens },
      costEstimate: estimateCost(model, inputTokens, outputTokens),
    }
  }
}

function generateMockDevOutput(task: string): string {
  return `# Dev Completion Report

## Task
${task.slice(0, 200)}

## What Was Done
- Analyzed the codebase and identified relevant files
- Implemented the requested changes
- Added appropriate tests and documentation
- Verified the implementation works as expected

## Files Changed
- \`src/index.ts\` — Added core functionality
- \`src/utils.ts\` — Added helper functions
- \`README.md\` — Updated documentation

## Testing
Ran the test suite manually. All existing tests pass. New functionality
verified through manual testing.

## Notes
This is a mock output — claude CLI was not available at runtime.
`
}

export function generateMockOutput(task: string, label: string): string {
  if (label.startsWith('qa-') || label.startsWith('chain-qa-')) return generateMockQAReport()
  if (label.startsWith('cr-')) return generateMockCodeReviewReport()
  return generateMockDevOutput(task)
}

function generateMockQAReport(): string {
  return `# QA Report

## Verdict: PASS

## Summary
The implementation meets the requirements as specified in the sprint contract.
All critical functionality is working correctly.

## Test Results

### Smoke Tests
- [x] Application starts without errors
- [x] Core functionality works as expected
- [x] No console errors

### Targeted Tests
- [x] Feature A behaves correctly
- [x] Edge cases handled appropriately
- [x] Performance is acceptable

## Defects Found
None.

## Recommendation
PASS — The implementation is solid. No blocking issues found.
Ready for production deployment.

---
*This is a mock QA report — claude CLI was not available at runtime.*
`
}

export function generateMockCodeReviewReport(): string {
  return `## Code Review Report

**Verdict:** PASS

### Summary
The implementation is internally consistent and has no blocking review findings.

### Critical
- None

### Major
- None

### Minor
- None

### Info
- [CR-01] Mock review completed because the claude CLI was unavailable.
`
}
