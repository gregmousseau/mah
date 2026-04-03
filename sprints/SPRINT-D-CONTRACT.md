# Sprint Contract: D — Sprint Artifacts + Auto-Detection

## Task
Add output artifact extraction from sprint completion reports, and auto-detect input dependencies when the planner sees a multi-step task.

## Dev Brief
- **Repo:** ~/clawd/projects/mah
- **Files involved:**
  - `src/artifacts.ts` (new) — extract artifacts from dev output, save/load artifacts
  - `src/pipeline.ts` — call artifact extraction after dev phase completes
  - `src/planner.ts` — detect chains in task description, propose multi-sprint plans
  - `src/types.ts` — SprintArtifact, SprintInput already defined
- **Constraints:**
  - Artifacts extracted from dev completion report's "Files Changed" section
  - Artifacts saved as `{sprintDir}/artifacts.json`
  - Planner auto-detects when a task needs multiple phases (research → write → deploy)
  - Planner proposes single sprint vs chain based on complexity heuristics
- **Definition of Done:**
  - After a sprint completes, artifacts.json is saved with file paths and descriptions
  - `mah artifacts <sprint-id>` CLI command lists artifacts
  - Planner proposes chains for multi-phase tasks
  - TypeScript compiles clean

## QA Brief
- **QA Level:** smoke
- **Test:** Run a sprint, verify artifacts.json is created
- **Pass criteria:** Artifacts extracted, chain proposal works for "research and write about X"
