# MAH Protocol — Multi-Agent Harness Orchestration

*Version 0.1 — 2026-03-28*

## Overview

Three roles, one loop:

```
Planner (Moe) → Generator (Dev Agent) → Evaluator (Quinn)
     ↑                                        |
     └────────── feedback loop ───────────────┘
```

Moe is the orchestrator. He breaks work into sprint contracts, assigns them to a dev agent, then hands the output to Quinn for grading. If Quinn fails the sprint, Moe sends findings back to the dev agent for another pass.

## The Sprint Contract

The contract is the central artifact. It travels through all three roles.

### Phase 1: Planner creates the contract

Moe writes the contract based on user input, a bug report, a feature request, or a backlog item. The contract has two sections: one for the dev, one for QA.

```markdown
# Sprint Contract: [name]

## Task
[What needs to be done, in plain language]

## Dev Brief
- **Repo:** [path or URL]
- **Files likely involved:** [hints, not prescriptive]
- **Constraints:** [tech stack, don't break X, etc.]
- **Definition of done:** [what the dev should deliver]

## QA Brief
- **QA Level:** smoke | targeted | full
- **Test URL:** [where to point Playwright]
- **Test focus:** [what specifically to verify]
- **Devices:** [subset of matrix, or "per QA level default"]
- **Pass criteria:** [specific conditions]
- **Known limitations:** [things not to flag]
```

### Phase 2: Generator executes

The dev agent receives the contract as its task. It works in the repo, makes changes, and returns a **completion report**:

```markdown
# Sprint Complete: [name]

## What changed
- [file]: [what was modified and why]

## How to verify
[Steps a tester would take to confirm the fix]

## Dev's QA recommendation
[smoke | targeted | full] — [reasoning]

## Known caveats
[Anything the dev knows might look wrong but is intentional]
```

The dev's QA recommendation is advisory. Moe can override it up (never down without explicit user approval).

### Phase 3: Evaluator grades

Quinn receives the original QA Brief + the dev's completion report. She runs Playwright tests and returns a **QA Report** (format already defined in her SOUL.md):

```markdown
# QA Report: [name]
**Verdict:** ✅ PASS | ⚠️ CONDITIONAL PASS | ❌ FAIL

## Issues Found
[By severity: P0 → P3]

## Test Results
[Device × browser matrix]

## Recommendation
[Ship / Fix and re-test / Block]
```

### Phase 4: Planner decides

Moe reads Quinn's report and makes the call:

| Verdict | Action |
|---------|--------|
| ✅ PASS | Merge/deploy. Notify user. |
| ⚠️ CONDITIONAL | Review P2/P3 issues. Ship if acceptable, or send back. |
| ❌ FAIL | Extract P0/P1 findings, append to original contract, re-assign to dev. |

On failure, the dev gets the original contract + Quinn's findings as additional context. This is the feedback loop. Max 3 iterations before Moe escalates to the user.

---

## OpenClaw Implementation

### Spawning the dev agent

```
sessions_spawn(
  runtime: "subagent",
  mode: "run",
  task: <sprint contract markdown>,
  label: "dev-<sprint-name>",
  model: "sonnet"  // or per-task override
)
```

The dev agent works in the target repo directory (passed via `cwd`). It reads files, makes edits, runs local tests, and returns its completion report as the session output.

### Spawning Quinn

```
sessions_spawn(
  runtime: "subagent",
  mode: "run",
  task: <QA brief + dev completion report>,
  label: "qa-<sprint-name>",
  model: "sonnet",
  cwd: "~/.openclaw/workspace-qa"
)
```

Quinn reads her SOUL.md and TOOLS.md from her workspace, runs Playwright against the test URL, and returns the structured QA report.

### Feedback loop

If Quinn returns ❌ FAIL:

```
sessions_spawn(
  runtime: "subagent",
  mode: "run",
  task: <original contract + Quinn's failure report>,
  label: "dev-<sprint-name>-r2",
  model: "sonnet",
  cwd: <same repo>
)
```

Then re-spawn Quinn on the revised output. Retry counter tracked by Moe.

### Session flow diagram

```
User request
    │
    ▼
[Moe] writes sprint contract
    │
    ├──spawn──▶ [Dev Agent] ──returns──▶ completion report
    │                                          │
    │◀─────────────────────────────────────────┘
    │
    ├──spawn──▶ [Quinn] ──returns──▶ QA report
    │                                     │
    │◀────────────────────────────────────┘
    │
    ├── PASS → notify user, done
    ├── CONDITIONAL → review, decide
    └── FAIL → loop back to dev (max 3x)
```

---

## Model Selection

Default assignments (overridable per sprint):

| Role | Default Model | When to Override |
|------|--------------|-----------------|
| Planner (Moe) | sonnet | opus for complex decomposition |
| Generator (Dev) | sonnet | opus for hard debugging, haiku for trivial fixes |
| Evaluator (Quinn) | sonnet | haiku for smoke tests |

---

## Cost Estimation

Per sprint cycle (one pass):

| QA Level | Dev Agent | Quinn | Total |
|----------|-----------|-------|-------|
| Smoke | ~$0.05-0.15 | ~$0.10-0.30 | ~$0.15-0.45 |
| Targeted | ~$0.10-0.30 | ~$0.50-1.50 | ~$0.60-1.80 |
| Full Matrix | ~$0.20-0.50 | ~$2.00-5.00 | ~$2.20-5.50 |

Multiply by iterations if Quinn fails the sprint. Budget ~2x for safety.

---

## What's Next

1. **Test this protocol manually** — Moe writes a real contract, spawns a dev agent, spawns Quinn, handles the loop
2. **Automate the planner layer** — turn user requests into sprint contracts without manual formatting
3. **Build the MAH CLI/dashboard** — mission control for defining and running harnesses
4. **Multi-sprint orchestration** — break large features into sequential sprints with dependency ordering

---

## Open Questions

- [ ] Should the dev agent have access to Quinn's SOUL.md? (Knowing the grading rubric might help it self-check, but could also game the tests)
- [ ] How to handle sprint contracts that span multiple repos?
- [ ] Should Quinn run in the dev's workspace (access to source) or only test via URL (black-box)?
- [ ] Content capture: how to automatically log sprint artifacts for blog/video use?

---

*This is v0.1. We'll iterate as we run real sprints.*
