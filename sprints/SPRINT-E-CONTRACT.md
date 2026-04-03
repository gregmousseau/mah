# Sprint Contract: E — Chain Execution Engine

## Task
Execute chained sprints in sequence, injecting upstream artifacts into downstream sprint prompts. Support human checkpoints between sprints.

## Dev Brief
- **Repo:** ~/clawd/projects/mah
- **Files involved:**
  - `src/chain.ts` (new) — chain execution engine, artifact injection, dependency resolution
  - `src/pipeline.ts` — integrate chain runner for multi-sprint plans
  - `src/cli.ts` — `mah chain run "task"` command, progress display for chained sprints
  - `src/types.ts` — ChainLink type if needed
- **Constraints:**
  - Upstream artifacts injected into downstream prompts based on `injectAs` mode
  - `dependsOn` prevents out-of-order execution
  - Human checkpoints pause between sprints when flagged
  - Single sprint tasks still work exactly as before (no chain overhead)
- **Definition of Done:**
  - `mah run "research X and write a blog post"` executes as a chain
  - Upstream artifacts flow into downstream sprints
  - Human checkpoint pauses execution and waits for approval
  - Chain progress shown in CLI
  - TypeScript compiles clean

## QA Brief
- **QA Level:** targeted
- **Test:** Run a 2-sprint chain, verify artifact injection and sequential execution
- **Pass criteria:** Artifacts from sprint 1 visible in sprint 2's prompt
