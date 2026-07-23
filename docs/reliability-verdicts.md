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
