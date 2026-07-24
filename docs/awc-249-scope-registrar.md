# AWC-249 — Scope-aware findings registrar (shadow rollout)

The registrar sits *after* grader aggregation and *before* delivery. It
consumes grader findings, classifies each one by scope, and produces a
structured report plus deduped ticket actions. The delivery verdict is
unaffected during the shadow rollout — the registrar is advisory only.

## Modes

| Knob                    | Values                     | Default (this delivery, canary, tests) |
| ----------------------- | -------------------------- | -------------------------------------- |
| `scopeGate`             | `advisory` \| `enforced`   | `advisory`                             |
| `findingsMode`          | `off` \| `report` \| `ticket` | `report`                            |
| `ticketDispatchEnabled` | `false` \| `true`          | `false`                                |
| `ticketTeamId`          | Linear team UUID           | unset                                  |

`ticketDispatchEnabled` is an **independent** switch. Setting
`findingsMode: 'ticket'` alone still marks every action as
`shadow-only`. Sprint and chain finding rounds forcibly disable dispatch even
when project configuration requests ticket mode and enables the dispatch gate.
They can emit sanitized, fingerprinted ticket actions for later review, but
cannot query or mutate Linear. Promotion is a separate human-reviewed action
outside sprint/chain execution. That action requires one external approval
artifact per finding, bound by digest to the exact candidate SHA, team, packet,
fingerprint, title, and body. It additionally requires `ticketTeamId`; it uses
the AWC API-key file, queries Linear by registrar fingerprint **within that
team** before mutation, creates in Todo, and persists the issue identity in a
team-scoped receipt under one canonical per-user MAH state directory,
independent of the caller's working directory. Configuration flags and
automated `reviewComplete` state are not promotion authorization.

## Classifications

| Classification        | Meaning                                                                 | Repair-loop? |
| --------------------- | ----------------------------------------------------------------------- | ------------ |
| `current-pr-blocker`  | Introduced/worsened/activated by the candidate, required for release safety, or unknown relationship on a PR-touched path | Yes |
| `follow-up`           | Provisionally adjacent or explicitly pre-existing product work         | Only leaves the enforced loop with complete metadata |
| `spike-candidate`     | Plausible/insufficient evidence requiring bounded investigation         | Only leaves the enforced loop with complete metadata |
| `harness-defect`      | Category ∈ {harness, infrastructure, infra, ci, tooling, environment, credentials, preflight, evaluation, grader} | Enforced mode fails closed |
| `false-positive`      | Deterministic explicit allowlist                                        | Suppressed   |

Classification is a **pure function** of `(finding, config)`; same input
always yields the same packet id and ticket fingerprint.

Reports expose `currentBlockers`, `adjacent`, `harnessDefects`, and
`suppressed` as separate routes. `reviewComplete` is true only when every
packet was classified successfully and every finding routed out of the repair
loop explicitly says `scopeRelationship: pre-existing` and
`releaseImpact: not-release-blocking`. Missing or unknown relationship/release
metadata can still produce a provisional adjacent classification for advisory
reporting, but enforced mode treats that review as incomplete, returns `FAIL`,
and keeps the original unfiltered repair evidence intact. Severity never makes
incomplete scope provenance safe to discard.

## Packet shape

```jsonc
{
  "packetId":        "pkt-<sha256[:16]>",
  "candidateSha":    "<exact HEAD SHA>",
  "classification":  "current-pr-blocker",
  "severity":        "major",
  "scopeProvenance": {
    "reason":          "Finding was introduced by the candidate change.",
    "inRepairScope":   true,
    "matchedPath":     "src/x.ts",
    "sourceGraderId":  "code"
  },
  "sanitizedEvidence":   "…",   // scrubbed of tokens/PHI/emails/cookies
  "risk":                "Blocks current PR…",
  "reproduction":        "See src/x.ts:42. Re-run…",
  "proposedDisposition": "Return to dev repair loop.",
  "acceptanceCriteria":  ["…"],
  "dependencies":        ["…"],
  "testExpectations":    ["…"],
  "rolloutOrCleanup":    "…",
  "originFindingId":     "CR-01",
  "createdAt":           "awc249-<sha256[:12]>"
}
```

## Safety / state invariant matrix

| ID  | Invariant                                                                 | Enforced by                                    |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| I1  | Registrar failure never hides a genuine current-PR blocker.              | Per-finding try/catch → fallback packet; `reviewComplete: false` preserves the unfiltered repair brief. Tests: *crash/recovery*, *enforced scope preserves non-pass*. |
| I2  | `findingsMode: off` yields an empty report — no packets, no actions.     | Early-return branch. Test: *findingsMode="off"*. |
| I3  | `scopeGate: advisory` never emits `registrarBlockers`.                   | `registrarBlockers()` short-circuits unless `enforced`. Test: *advisory scopeGate*. |
| I4  | Sprint and chain rounds always force `ticketDispatchEnabled: false`, including when project configuration requests ticket dispatch. | `processScopeAwareFindingRound()` report-only boundary. Test: *scope-aware sprint rounds force configured ticket dispatch into shadow output*. |
| I5  | Ticket actions dedupe by normalized root-cause path and evidence, regardless of finding ID or later reclassification, but only within the configured Linear team. | Report-bound team identity, team-bound exported identities, search filters, in-memory keys, and durable receipt paths. Tests: *deduplication*, *team isolation*, *fingerprints merge equivalent root causes*. |
| I6  | Shadow/report modes never call Linear; a promotion requires a distinct exact-action human-review artifact and uses only search and issue-create APIs. | Promotion boundary, digest-binding test, runtime canary, and mocked dispatcher tests. |
| I7  | Sanitization strips bearer tokens, AWS keys, JWTs, cookies, auth headers, emails, phone numbers, DOB/MRN markers, and raw Gmail/Jane content even without synthetic tags. | Provider-context redaction plus provider-key redaction at the final persistence boundary. Tests: *privacy*. |
| I8  | Packet ids and ticket fingerprints are stable across runs given identical inputs. | Deterministic SHA-256 over ordered fields. Test: *packet id … deterministic*. |
| I9  | Ticket target state is always `Todo`; no sprint auto-dispatch.           | Hard-coded `targetState: 'Todo'` in `ticket.ts`. Doc: *no auto-sprint*. |
| I10 | Stale candidate SHAs produce distinct packet ids so replays cannot alias. | SHA in packet id derivation. Test: *stale candidate*. |
| I11 | A finding with no `file` path is treated as **in-scope** by default, so a real blocker without file context cannot be silently classified as adjacent. | `isInCurrentPrScope` fallback. |
| I12 | A definitely pre-mutation issue-create failure is retryable; any failure after the mutation boundary leaves a pending receipt for manual reconciliation. | Typed pre-mutation error plus team-scoped durable reservation. Tests: *safe retry*, *ambiguous failure*. |

## Rollout plan (shadow)

1. **Ship advisory + report-only (this delivery).** No verdict change,
   no Linear I/O, no tickets. New, resumed, and preplanned chain sprints
   persist a registrar report for each exact-SHA QA round.
2. **Observe.** Run the three historical shadow canaries plus the unit
   suite in CI. Snapshot registrar reports from a chosen subset of live
   sprints (opt-in, off by default).
3. **Enable scope enforcement.** Set `scopeGate: enforced`; only
   findings proven pre-existing and non-release-blocking may leave the repair
   brief. Missing provenance, unexplained grader failures, harness failures,
   and registrar failures remain fail-closed.
4. **Enable ticket mode (still no dispatch).** Turn on
   `findingsMode: 'ticket'` for a canary project; verify dedupe and
   fingerprint stability against a Linear export.
5. **Enable reviewed promotion (last).** Configure `ticketTeamId` and
   `ticketDispatchEnabled`, then use the separate human-review workflow to
   authorize one exact finding action at a time. Created issues land in `Todo`.
   The promotion boundary exposes no sprint-start operation.

## Rollback plan

Every stage is a one-line revert:

| From                                       | Rollback                                    |
| ------------------------------------------ | ------------------------------------------- |
| Ticket dispatch on                         | `ticketDispatchEnabled: false`              |
| Ticket mode                                | `findingsMode: 'report'`                    |
| Enforced scope gate                        | `scopeGate: 'advisory'`                     |
| Registrar reports being persisted anywhere | `findingsMode: 'off'`                       |
| Registrar entirely                         | Remove the caller — module has no side-effects at import time. |

Because the module has no runtime side-effects at import time and every
stage is a switch, rollback never requires touching graders,
`reliability.ts`, pipelines, or Linear.

## What this delivery does NOT do

- Advisory mode does not change delivery verdicts; enforced mode applies
  the classified repair boundary.
- No Linear network call while the default report/shadow configuration is active.
- No sprint dispatch, no automation switch flipped.
- No changes to `fail-closed` verdict semantics from AWC-248.
