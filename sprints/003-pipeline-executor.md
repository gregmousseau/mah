# Sprint Contract: MAH Pipeline Executor

**Sprint ID:** 003
**Date:** 2026-03-28
**Depends on:** Sprint 002 (config + adapter interface)

---

## Task

Build the core pipeline executor — the engine that takes a task description, generates a sprint contract, runs the dev → QA → feedback loop, and returns a result. This is the automation of what Moe did manually in Sprint 001.

## Dev Brief

- **Repo:** ~/clawd/projects/mah
- **Stack:** TypeScript (same as Sprint 002)

### What to Build

**1. Contract generator (`src/contract.ts`)**
- Takes a natural language task description + project config
- Produces a structured sprint contract (dev brief + QA brief)
- For MVP: template-based generation (fill in the blanks from config)
- The contract is a TypeScript object that can serialize to markdown

```typescript
interface SprintContract {
  id: string                    // auto-generated: 001, 002, etc.
  name: string                  // derived from task description
  task: string                  // the original request
  devBrief: {
    repo: string
    constraints: string[]
    definitionOfDone: string[]
  }
  qaBrief: {
    tier: 'smoke' | 'targeted' | 'full'
    testUrl: string
    testFocus: string[]
    passCriteria: string[]
    knownLimitations: string[]
  }
  status: 'planned' | 'dev' | 'qa' | 'passed' | 'failed' | 'escalated'
  iterations: SprintIteration[]
}

interface SprintIteration {
  round: number
  dev: AgentResult | null
  qa: AgentResult | null
  defects: Defect[]
}

interface Defect {
  id: string           // P1-01, P2-03, etc.
  severity: 'p0' | 'p1' | 'p2' | 'p3'
  description: string
  fixed: boolean
}
```

**2. Pipeline executor (`src/pipeline.ts`)**
The core loop:

```
async function runSprint(task: string, config: ProjectConfig): Promise<SprintResult> {
  1. Generate sprint contract from task + config
  2. Save contract to .mah/sprints/NNN-<name>.md
  3. Spawn dev agent via adapter.execute(devPrompt, devOptions)
  4. Parse dev's completion report
  5. Spawn QA agent via adapter.execute(qaPrompt, qaOptions)
  6. Parse QA report → extract verdict + defects
  7. If PASS → return success
  8. If FAIL → append defects to dev prompt, loop (up to max_iterations)
  9. If max iterations hit → mark as escalated, return for human review
  10. Save all artifacts to .mah/sprints/
}
```

**Key design decisions:**
- The dev prompt includes: task description + repo context + constraints from config
- The QA prompt includes: QA brief from contract + dev's completion report
- On failure, the dev gets: original task + QA's failure report (defect list)
- Contract, reports, and metrics are saved as files after each phase

**3. OpenClaw adapter (`src/adapters/openclaw.ts`)**
Implement the AgentAdapter interface using OpenClaw's sessions_spawn:

```typescript
class OpenClawAdapter implements AgentAdapter {
  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    // Use child_process to call openclaw CLI, or
    // Use the OpenClaw SDK/API if available, or
    // Shell out to a script that uses sessions_spawn
    
    // For MVP: shell out to a helper script that:
    // 1. Writes the task to a temp file
    // 2. Calls openclaw with the task
    // 3. Captures the output
    // 4. Returns timing + result
  }
}
```

**Implementation note:** The OpenClaw adapter is the trickiest part. Options:
- **Option A:** Shell out to `claude -p --print` with the task as input (simplest, works now)
- **Option B:** Use OpenClaw's REST API if available
- **Option C:** Write a thin wrapper that uses `sessions_spawn` programmatically

Recommend Option A for MVP — `claude -p` is available, works headless, and returns output directly. The adapter interface means we can swap to B or C later without touching the pipeline.

For Quinn specifically: she needs her workspace context (SOUL.md, TOOLS.md, Playwright). The adapter should support a `workspace` option that sets the cwd so Quinn picks up her files.

**4. Wire into CLI (`src/cli.ts`)**
- `mah run "add dark mode switcher"` → runs the full pipeline
- `mah run --dry-run "add dark mode"` → generates contract, prints it, doesn't execute
- Progress output to terminal: "📝 Contract generated → ⚙️ Dev working → 🔍 QA testing → ✅ PASS"

### Constraints
- Keep the pipeline synchronous for MVP (no parallel sprints)
- Dev agent timeout: 30 min max
- QA agent timeout: 30 min max
- All artifacts saved as markdown files in .mah/sprints/
- Don't over-engineer the contract generator — template-based is fine for now

### Definition of Done
- `mah run "task description"` executes the full dev → QA → feedback loop
- Sprint contract saved to .mah/sprints/
- Dev completion report and QA report saved alongside
- Feedback loop works: if QA fails, dev gets the findings and tries again
- Max iterations respected (escalate to human on limit)
- Console output shows progress at each stage

## QA Brief

- **QA Level:** targeted
- **Test focus:**
  - Run `mah run` with a simple task against a test project
  - Verify contract generation produces valid structure
  - Verify dev agent receives the right prompt
  - Verify QA agent receives dev's output
  - Verify feedback loop triggers on failure
  - Verify artifacts are saved to disk
- **Pass criteria:**
  - Full pipeline completes end-to-end
  - Artifacts are readable markdown
  - Feedback loop fires at least once (test with a task that will likely need revision)
- **Known limitations:**
  - Contract generation is template-based (not LLM-powered yet)
  - OpenClaw adapter uses claude -p (not native sessions_spawn)
  - No parallel execution

---

## Artifacts Log

| Time | Event | Notes |
|------|-------|-------|
| | Contract written | |
| | Dev spawned | |
| | Dev complete | |
| | QA | |
