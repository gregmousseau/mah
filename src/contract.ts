import { randomUUID } from 'node:crypto'
import type { SprintContract, ProjectConfig, Grader, Skill } from './types.js'
import type { ResolvedSkill } from './skills.js'
import { budgetForContract } from './lib/qaTier.js'

const REPAIR_CONTEXT_MAX_CHARS = 64_000

export function generateContract(
  task: string,
  config: ProjectConfig,
  sprintId: string
): SprintContract {
  // Extract a name: first sentence or first 60 chars
  const firstSentence = task.split(/[.!?\n]/)[0].trim()
  const name = firstSentence.length > 60
    ? firstSentence.slice(0, 57) + '...'
    : firstSentence

  const defaultGraders: Grader[] = [
    {
      id: 'ux-quinn',
      type: 'ux',
      name: 'Quinn (UX)',
      agent: config.agents.evaluator,
      enabled: true,
    },
    {
      id: 'code-review',
      type: 'code-review',
      name: 'Code Reviewer',
      agent: { ...config.agents.evaluator },
      enabled: true,
    },
  ]

  return {
    id: sprintId,
    name,
    task,
    status: 'planned',
    graders: defaultGraders,
    devBrief: {
      repo: config.project.repo,
      constraints: [
        'Maintain backward compatibility',
        'Follow existing code style and conventions',
        'Keep changes minimal and focused on the task',
      ],
      definitionOfDone: [
        'Feature is implemented and working',
        'Existing tests still pass',
        'Code is clean and readable',
        'Changes are committed to the repo',
      ],
    },
    qaBrief: {
      tier: config.qa.defaultTier,
      testUrl: config.agents.evaluator.testUrl ?? '',
      testFocus: [
        'Core functionality works as specified',
        'No regressions in existing behavior',
        'Edge cases are handled',
      ],
      passCriteria: [
        'No P0 or P1 defects',
        'Application runs without errors',
        'Task requirements are met',
      ],
      knownLimitations: [],
    },
    iterations: [],
    createdAt: new Date().toISOString(),
  }
}

export function contractToDevPrompt(contract: SprintContract, resolvedSkills?: ResolvedSkill[]): string {
  const { devBrief } = contract

  // Inject skill context at the top of the prompt
  const skillBlocks = resolvedSkills && resolvedSkills.length > 0
    ? `\n# Agent Skills\n\n${resolvedSkills.map(s => s.promptBlock).join('\n\n---\n\n')}\n\n---\n\n`
    : ''

  return `${skillBlocks}You are a software developer working on: ${contract.task}

## Repository
${devBrief.repo}

## Constraints
${devBrief.constraints.map(c => `- ${c}`).join('\n')}

## Definition of Done
${devBrief.definitionOfDone.map(d => `- ${d}`).join('\n')}

## Your Task
Implement the following:

${contract.task}

When done, provide a completion report in this format:

# Dev Completion Report

## What Was Done
[Brief description of changes made]

## Files Changed
[List of files added/modified with a brief description of each]

## Testing
[How you verified the implementation works]

## Notes
[Any caveats, assumptions, or things QA should know about]

## QA Escalation
[OPTIONAL — only include if you discovered risk during the work that warrants more QA than the current tier provides.]
[Format:]
[tier: smoke | targeted | full]
[reason: short justification (e.g. "touched auth flow, needs login regression")]
[Omit this section entirely if no escalation is needed.]
`
}

export function contractToQAPrompt(
  contract: SprintContract,
  devOutput: string,
  round: number,
  resolvedSkills?: ResolvedSkill[]
): string {
  const { qaBrief } = contract
  const testUrlLine = qaBrief.testUrl
    ? `\n## Test URL\n${qaBrief.testUrl}\n`
    : ''

  const skillBlocks = resolvedSkills && resolvedSkills.length > 0
    ? `\n# Agent Skills\n\n${resolvedSkills.map(s => s.promptBlock).join('\n\n---\n\n')}\n\n---\n\n`
    : ''

  const budget = budgetForContract(contract)
  const timeBudgetMin = Math.round(budget.timeoutMs / 60_000)

  return `${skillBlocks}You are Quinn, a QA engineer. Evaluate the following development work.

## Sprint
${contract.name}

## Original Task
${contract.task}

## QA Tier: ${qaBrief.tier.toUpperCase()}
**Time budget:** ~${timeBudgetMin} minute(s).
**Scenario budget:** at most ${budget.maxScenarios} scenario(s).
**Scope:** ${budget.scopeHint}
Stay within these limits — return your verdict as soon as you have enough signal. Do not pad with exhaustive flows when the tier is smoke/targeted.
${testUrlLine}
## Test Focus
${qaBrief.testFocus.map(f => `- ${f}`).join('\n')}

## Pass Criteria
${qaBrief.passCriteria.map(c => `- ${c}`).join('\n')}

## Developer's Completion Report (Round ${round})
${devOutput}

---

Review the developer's work against the task requirements and pass criteria.
If you have access to a test URL or repo, verify the implementation directly.

Provide your QA report in this format:

# QA Report

## Verdict: [PASS / CONDITIONAL PASS / FAIL]

## Summary
[One paragraph summary of overall quality]

## Defects Found
[List each defect with severity: P0 (critical), P1 (blocker), P2 (major), P3 (minor)]
Format each defect with all scope fields:
**P1-01:** [description]
  Finding category: [product | harness | infrastructure | credentials | environment | preflight | evaluation | tooling]
  Scope relationship: [introduced | worsened | activated | pre-existing | unknown]
  Release impact: [required-for-release-safety | not-release-blocking | unknown]
  Evidence confidence: [confirmed | plausible | insufficient]
  Investigation question: [required when evidence is plausible/insufficient; otherwise omit]
  Exit criterion: [required when evidence is plausible/insufficient; otherwise omit]

Severity determines urgency. Scope relationship and release impact determine
whether the defect belongs in this sprint. Do not call a pre-existing issue
introduced merely because it is severe or appears in a touched file.

## Recommendation
[PASS/FAIL with brief reasoning]
`
}

export function contractToDevFixPrompt(
  contract: SprintContract,
  devOutput: string,
  qaReport: string,
  round: number
): string {
  const boundedDevOutput = boundRepairContext(
    devOutput,
    REPAIR_CONTEXT_MAX_CHARS,
    'previous implementation',
  )
  const boundedQAReport = boundRepairContext(
    qaReport,
    REPAIR_CONTEXT_MAX_CHARS,
    'QA report',
  )

  return `You are a software developer. Your previous implementation had QA issues.
This is fix round ${round}.

## Original Task
${contract.task}

## Your Previous Implementation (Round ${round - 1})
${boundedDevOutput}

## QA Report — Issues Found
${boundedQAReport}

---

Fix all issues identified by QA. Focus on:
1. Resolving all P0 and P1 defects first (blockers)
2. Addressing P2 defects if time permits
3. Do not break anything that was previously working

When done, provide an updated completion report:

# Dev Completion Report (Round ${round})

## What Was Fixed
[List each QA defect and how it was resolved]

## Files Changed
[List of files modified]

## Testing
[How you verified the fixes]

## Remaining Caveats
[Anything that still needs attention or known limitations]

## QA Escalation
[OPTIONAL — same rules as before. Include only if a fix surfaced new QA risk.]
[Format:]
[tier: smoke | targeted | full]
[reason: short justification]
`
}

function boundRepairContext(
  value: string,
  maxChars: number,
  label: string,
): string {
  if (value.length <= maxChars) return value

  const marker = `\n\n[MAH truncated ${label}: ${value.length - maxChars} characters omitted]\n\n`
  const available = maxChars - marker.length
  const headLength = Math.floor(available / 3)
  const tailLength = available - headLength
  return value.slice(0, headLength) + marker + value.slice(-tailLength)
}

export function generateSprintId(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.toISOString().slice(11, 19).replace(/:/g, '')
  const short = randomUUID().slice(0, 6)
  return `sprint-${date}-${time}-${short}`
}
