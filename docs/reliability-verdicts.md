# MAH fail-closed verdict rollout

## Contract

`qa.verdictMode: fail-closed` is the default and the canary setting. A sprint can
reach `passed` only when every enabled grader produces a completed `PASS` result
and the candidate commit plus dependency-lock fingerprint are unchanged across
review. Conditional, missing, failed, timed-out, zero-grader, and identity-mismatch
outcomes remain non-passing.

Material findings from every grader are deduplicated into the next developer
repair brief. Harness, preflight, and identity failures are recorded separately
from product findings so an unexecuted product path is never reported as a product
failure.

Normal linked worktrees are supported: `.git` may be either a directory or a gitfile.
`.env.mah.local` may live in the project worktree or the MAH invocation directory;
no symlink to a primary worktree environment is required.

Before any provider probe or agent launch, MAH resolves the configured product target,
requires a clean Git worktree, and records its canonical root, exact HEAD, dependency-lock
fingerprint, generator provider, and generator model in the sprint contract. The same identity
is checked again immediately before every Dev launch, including repair rounds. The canonical
worktree root replaces any stale repository path in the Dev prompt and is passed to provider
preflight and execution. Enabled grader provider/model selections are resolved, persisted, and
preflighted before Dev; runtime evaluator overrides replace stale selections on resumed contracts.

Per-run agent selection can be supplied as runtime state instead of editing the product branch:

```bash
MAH_GENERATOR_CWD=/absolute/path/to/persistent-worktree \
MAH_GENERATOR_TYPE=codex \
MAH_GENERATOR_MODEL=gpt-5.6-sol \
MAH_EVALUATOR_TYPE=codex \
MAH_EVALUATOR_MODEL=gpt-5.6-sol \
npm run mah -- run "task"
```

An override that is present but blank fails closed. Unsupported providers and unavailable
provider/model combinations fail during preflight before an agent runs. Project-level generator
and evaluator provider/model configuration must also be explicit; MAH does not invent one.

## Canary

1. Run unit/replay tests, `npm run build`, and `npm run canary:reliability`.
2. Run one isolated AWC sprint with `qa.verdictMode: fail-closed`.
3. Verify the contract records every grader result, any delivery failures, and the
   candidate identity used for the verdict.
4. Replay the AWC-241 mixed-grader and AWC-194 harness-interruption fixtures.
5. Do not enable automatic ticket creation, dispatch, merge, or deployment in this
   tranche.

## Rollback

Set `MAH_VERDICT_MODE=legacy` for a single invocation or set
`qa.verdictMode: legacy` in `mah.yaml`. The environment variable takes precedence.
Rollback restores historical aggregation only; it does not suppress persisted
grader results or repair evidence. Remove the override after diagnosis.
