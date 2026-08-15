import { randomUUID } from 'node:crypto'
import type { SprintContract, ProjectConfig, Grader, ReviewProfile, Skill } from './types.js'
import type { ResolvedSkill } from './skills.js'
import { budgetForContract } from './lib/qaTier.js'

const REPAIR_CONTEXT_MAX_CHARS = 64_000

const STRICT_REVIEW_SIGNALS = [
  /\b(?:auth\w*|log[ -]?in|session|credential\w*|secret\w*|token\w*|api[ -]?key\w*|permission|privacy|security)\b/i,
  /\b(?:migration|data loss|data integrity|destructive|irreversible)\b/i,
  /\b(?:concurren|idempoten|race condition|kill switch)\w*\b/i,
  /\b(?:payment|billing|production|external send|client notification)\b/i,
]

const USER_VISIBLE_SIGNALS = [
  /\b(?:ui|ux|page|route|form|modal|dialog|button|component|layout)\b/i,
  /\b(?:browser|playwright|responsive|accessibility|visual|frontend)\b/i,
  /\b(?:dark mode|theme|toast|navigation|navbar|header|footer|sidebar|menu|dropdown|tooltip|tab|banner)\b/i,
  /\b(?:screen|view|card|table|icon|animation|loading|empty state|error message|styling|colour|color)\b/i,
]

export function resolveReviewProfile(
  task: string,
  review: NonNullable<ProjectConfig['review']>,
): ReviewProfile {
  const strictSignal = STRICT_REVIEW_SIGNALS.find((signal) => signal.test(task))
  const userVisibleSignal = USER_VISIBLE_SIGNALS.find((signal) => signal.test(task))
  const risk = review.defaultRisk === 'adaptive'
    ? strictSignal ? 'strict' : 'routine'
    : review.defaultRisk
  const userVisible = Boolean(userVisibleSignal)
  const browserQa = review.browserQa === 'always'
    || (review.browserQa === 'user-visible' && userVisible)

  return {
    risk,
    userVisible,
    browserQa,
    maxMaterialFindings: review.maxMaterialFindings,
    rationale: [
      risk === 'strict'
        ? strictSignal
          ? `Strict-review signal matched: ${strictSignal.source}`
          : 'Strict review is configured as the project default.'
        : 'No strict-review signal matched.',
      browserQa
        ? userVisible
          ? `User-visible signal matched: ${userVisibleSignal?.source ?? 'configured'}`
          : 'Browser QA is configured for every sprint.'
        : 'Browser QA is not required for this non-user-visible sprint.',
    ],
  }
}

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

  const reviewProfile = resolveReviewProfile(task, config.review ?? {
    defaultRisk: 'adaptive',
    browserQa: 'user-visible',
    maxMaterialFindings: 3,
  })
  const defaultGraders: Grader[] = [
    {
      id: 'code-review',
      type: 'code-review',
      name: 'Code Reviewer',
      agent: { ...config.agents.evaluator, readOnly: true },
      enabled: true,
    },
  ]
  if (reviewProfile.browserQa) {
    defaultGraders.unshift({
      id: 'ux-quinn',
      type: 'ux',
      name: 'Quinn (UX)',
      agent: { ...config.agents.evaluator, readOnly: true },
      enabled: true,
    })
  }
  if (reviewProfile.risk === 'strict' && !config.agents.strictEvaluator) {
    throw new Error(
      'Strict-risk work requires agents.strictEvaluator; independent review cannot be skipped.',
    )
  }
  if (reviewProfile.risk === 'strict') {
    defaultGraders.push({
      id: 'independent-risk-review',
      type: 'code-review',
      name: 'Independent Risk Reviewer',
      agent: { ...config.agents.strictEvaluator!, readOnly: true },
      enabled: true,
    })
  }

  return {
    id: sprintId,
    name,
    task,
    reviewProfile,
    status: 'planned',
    graders: defaultGraders,
    devBrief: {
      repo: config.project.repo,
      constraints: [
        'Maintain backward compatibility',
        'Follow existing code style and conventions',
        'Keep changes minimal and focused on the task',
        'Implement only acceptance criteria and currently reachable production cases',
        'Do not add pagination, caching, retries, abstractions, compatibility layers, or generalized scale handling without a requirement, repository convention, test, or observed condition',
        'Use explicit task data bounds; when none are stated, preserve current behavior instead of inventing scale requirements',
      ],
      definitionOfDone: [
        'Feature is implemented and working',
        'Existing tests still pass',
        'Code is clean and readable',
        'Changes are committed to the repo',
      ],
    },
    qaBrief: {
      tier: reviewProfile.risk === 'strict' && reviewProfile.browserQa
        ? 'full'
        : config.qa.defaultTier,
      testUrl: config.agents.evaluator.testUrl ?? '',
      testFocus: [
        'Core functionality works as specified',
        'No regressions in existing behavior',
        'Edge cases are handled',
      ],
      passCriteria: [
        'No blocker for incorrect requested behavior, reachable regression, security/data-loss risk, or failing required test',
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

## MAH Execution Boundary
You are already executing inside a MAH sprint. Implement the assigned work directly.
Do not launch, invoke, queue, or nest MAH or any MAH wrapper from this worker.

## Repository
${devBrief.repo}

## Constraints
${devBrief.constraints.map(c => `- ${c}`).join('\n')}

## Definition of Done
${devBrief.definitionOfDone.map(d => `- ${d}`).join('\n')}

## Your Task
Implement the following:

${contract.task}

## Scope Policy
- Implement only the acceptance criteria and currently reachable production cases.
- Do not add pagination, caching, retries, abstractions, compatibility layers, or generalized scale handling unless the task, an existing repository convention, a failing test, or an observed condition requires it.
- Treat hypothetical concerns as non-blocking notes. Do not implement them in this sprint.
- Keep one write-capable owner for this worktree. Review and QA agents are read-only.

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
  const maxFindings = contract.reviewProfile?.maxMaterialFindings ?? 3

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

Only a concrete execution path or reproduction may block. A finding blocks only for:
- incorrect requested behavior;
- a reachable regression;
- security or data-loss risk; or
- a failing required test.

Report at most ${maxFindings} material findings, choosing the highest-value ones. Classify
each as Blocker (must fix in this sprint), Follow-up (credible but outside this sprint),
or Observation (non-actionable). Only Blockers can fail the sprint. Omit speculative
polish. Browser
verification is required only when this contract includes the UX grader.

Provide your QA report in this format:

# QA Report

## Verdict: [PASS / CONDITIONAL PASS / FAIL]

## Summary
[One paragraph summary of overall quality]

## Defects Found
[List each defect with severity: P0 (critical), P1 (blocker), P2 (major), P3 (minor)]
If there are no defects, write exactly: None.
Do not describe an empty defect list with a P0–P3 severity range.
Format each defect with all scope fields:
**P1-01:** [description]
  Finding category: [product | harness | infrastructure | credentials | environment | preflight | evaluation | evaluation-self-reference | tooling]
  Scope relationship: [introduced | worsened | activated | pre-existing | unknown]
  Release impact: [required-for-release-safety | not-release-blocking | unknown]
  Evidence confidence: [confirmed | plausible | insufficient]
  Investigation question: [required when evidence is plausible/insufficient; otherwise omit]
  Exit criterion: [required when evidence is plausible/insufficient; otherwise omit]

Severity determines urgency. Scope relationship and release impact determine
whether the defect belongs in this sprint. Do not call a pre-existing issue
introduced merely because it is severe or appears in a touched file.
Use the exact category evaluation-self-reference only when claiming that this
outer MAH evaluator execution itself did not occur. Never use it for a product
operation, cleanup, resume action, migration, or test that MAH failed to run.

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

## MAH Execution Boundary
You are already executing inside a MAH sprint. Implement the assigned repairs directly.
Do not launch, invoke, queue, or nest MAH or any MAH wrapper from this worker.

## Original Task
${contract.task}

## Your Previous Implementation (Round ${round - 1})
${boundedDevOutput}

## QA Report — Issues Found
${boundedQAReport}

---

Fix only the current-PR blockers identified by the scoped QA repair brief. Focus on:
1. Resolving each concrete blocker and its reproduction
2. Leaving follow-ups and observations outside this sprint
3. Avoiding unrelated polish, refactors, and speculative scale work
4. Not breaking anything that was previously working

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
