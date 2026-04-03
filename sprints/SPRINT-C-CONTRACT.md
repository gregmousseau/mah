# Sprint Contract: C — Skill Selection in Planner

## Task
Add a planner phase that analyzes the task and proposes which agents + skills to use. CLI shows the proposal, user approves/modifies/rejects.

## Dev Brief
- **Repo:** ~/clawd/projects/mah
- **Files involved:**
  - `src/planner.ts` (new) — analyze task, propose agent+skill combos
  - `src/pipeline.ts` — insert planner phase before dev execution
  - `src/cli.ts` — approval flow for interactive mode
  - `src/types.ts` — SprintPlan, PlannedSprint types (already partially defined)
- **Constraints:**
  - Planner uses an LLM call to analyze the task against available skills
  - Proposal includes: agents, skills per agent, reasoning, cost estimate
  - Auto-mode (non-interactive) proceeds with planner's proposal
  - Interactive mode shows proposal and waits for approve/modify/reject
- **Definition of Done:**
  - `mah run "task"` shows a skill proposal before execution
  - `mah run --auto "task"` skips approval
  - Proposal includes agent names, skill names, and reasoning
  - TypeScript compiles clean

## QA Brief
- **QA Level:** targeted
- **Test:** Run `mah run --dry-run "build a form"` and verify proposal includes react-forms skill
- **Pass criteria:** Proposal is sensible for the task, includes reasoning
