# Sprint Contract: B — Skill Injection into Pipeline

## Task
Wire the skill system into the actual pipeline execution so that when `mah run` executes, skills are loaded from `.mah/skills/` and injected into agent prompts.

## Dev Brief
- **Repo:** ~/clawd/projects/mah
- **Files involved:**
  - `src/pipeline.ts` — load skills, resolve per-agent, pass to contract prompt builders
  - `src/config.ts` — extend agent config to support `defaultSkills` array
  - `src/contract.ts` — already accepts `ResolvedSkill[]`, no changes needed
  - `mah.yaml` — add `defaultSkills` per agent (extended format)
- **Constraints:**
  - Backward compatible — existing mah.yaml without skills must still work
  - Skills are optional — if no skills configured, pipeline runs exactly as before
  - Agent assignments on the contract take precedence over config defaults
- **Definition of Done:**
  - `mah run "task"` loads skills from config and injects them into agent prompts
  - `mah run --dry-run "task"` shows which skills would be active
  - Config supports both old format (generator/evaluator flat) and new format (named agents with skills)
  - TypeScript compiles clean

## QA Brief
- **QA Level:** smoke
- **Test:** Run `mah status` and `mah run --dry-run "test task"` with skills configured
- **Pass criteria:** No regressions, skills appear in dry-run output
