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
`shadow-only`. The registrar emits a `ready` action only when the
independent dispatch gate is also enabled. Dispatch additionally requires
`ticketTeamId`; it uses the AWC API-key file, queries Linear by registrar
fingerprint before mutation, creates in Todo, and persists the issue identity.

## Classifications

| Classification        | Meaning                                                                 | Repair-loop? |
| --------------------- | ----------------------------------------------------------------------- | ------------ |
| `current-pr-blocker`  | Material finding on a PR-touched path                                   | Yes          |
| `follow-up`           | Non-material finding on a PR-touched path, or any finding on an adjacent path | No     |
| `spike-candidate`     | Adjacent + exploratory/informational                                     | No           |
| `harness-defect`      | Category ∈ {harness, infrastructure, infra, ci, tooling}                | No (advisory), but registrar bubbles it up |
| `false-positive`      | Deterministic allowlist                                                  | Suppressed   |

Classification is a **pure function** of `(finding, config)`; same input
always yields the same packet id and ticket fingerprint.

## Packet shape

```jsonc
{
  "packetId":        "pkt-<sha256[:16]>",
  "candidateSha":    "<exact HEAD SHA>",
  "classification":  "current-pr-blocker",
  "severity":        "major",
  "scopeProvenance": {
    "reason":          "Material finding on PR-touched path \"src/x.ts\".",
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
| I1  | Registrar failure never hides a genuine current-PR blocker.              | Per-finding try/catch → fallback packet; `safeRegisterFindings` outer catch. Test: *crash/recovery*. |
| I2  | `findingsMode: off` yields an empty report — no packets, no actions.     | Early-return branch. Test: *findingsMode="off"*. |
| I3  | `scopeGate: advisory` never emits `registrarBlockers`.                   | `registrarBlockers()` short-circuits unless `enforced`. Test: *advisory scopeGate*. |
| I4  | Ticket dispatch requires `findingsMode: 'ticket'` **and** `ticketDispatchEnabled: true`. | `pickReason()` in `ticket.ts`. Tests: *ticket mode with dispatch disabled*, *no external mutation*. |
| I5  | Ticket actions dedupe against `existingTicketFingerprints` and against actions built earlier in the same run. | `buildTicketActions` `seenThisRun` + `existing` sets. Test: *deduplication*. |
| I6  | Shadow/report modes never call Linear; approved dispatch uses only search and issue-create APIs. | Dispatch gate plus runtime canary and mocked dispatcher tests. |
| I7  | Sanitization strips bearer tokens, AWS keys, JWTs, cookies, auth headers, emails, phone numbers, DOB/MRN markers, `<jane-raw>`/`<gmail-body>` blobs. | `redact.ts` REDACTION_PATTERNS. Test: *privacy*. |
| I8  | Packet ids and ticket fingerprints are stable across runs given identical inputs. | Deterministic SHA-256 over ordered fields. Test: *packet id … deterministic*. |
| I9  | Ticket target state is always `Todo`; no sprint auto-dispatch.           | Hard-coded `targetState: 'Todo'` in `ticket.ts`. Doc: *no auto-sprint*. |
| I10 | Stale candidate SHAs produce distinct packet ids so replays cannot alias. | SHA in packet id derivation. Test: *stale candidate*. |
| I11 | A finding with no `file` path is treated as **in-scope** by default, so a real blocker without file context cannot be silently classified as adjacent. | `isInCurrentPrScope` fallback. |

## Rollout plan (shadow)

1. **Ship advisory + report-only (this delivery).** No verdict change,
   no Linear I/O, no tickets. Both pipeline entry points persist a
   registrar report for each exact-SHA QA round.
2. **Observe.** Run canary + unit suite in CI. Snapshot registrar
   reports from a chosen subset of sprints (opt-in, off by default).
3. **Enable scope enforcement.** Set `scopeGate: enforced`; only
   current-PR blockers remain in the repair brief. Unexplained grader
   failures and registrar failures remain fail-closed.
4. **Enable ticket mode (still no dispatch).** Turn on
   `findingsMode: 'ticket'` for a canary project; verify dedupe and
   fingerprint stability against a Linear export.
5. **Enable dispatch (last).** Configure `ticketTeamId`, then enable
   `ticketDispatchEnabled`. Created issues land in `Todo`. The dispatcher
   exposes no sprint-start operation.

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
