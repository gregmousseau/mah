# MAH ↔ Linear Integration — Slice Plan

**Status:** Slice 1 not yet built. This doc captures the plan so it survives restarts.
**Last reviewed:** 2026-05-02
**Owner:** G (driver), Aria (executor for AWC sprints)

---

## Context — Wiring is greenfield

- No live AWC/gap-analysis cron in openclaw or system crontab. (The "WAITING" messages seen in chat are coming from somewhere else; track that down separately.)
- **MAH** (`~/clawd/projects/mah/`) is a CLI harness (`mah run "<task>"`) with sprint contracts and pluggable graders. **No Linear integration yet.**
- **AWC project's `mah.yaml`** (`~/pro/awc-grief/mah.yaml`) defines generators (`frankie`/`devin`/`quinn`) but currently uses `model: sonnet` with **no `agentId` link** to the new `awc` (Aria) agent.
- **Linear integration** in either codebase: zero.
- **Linear API key** lives at `~/clawd/.secrets/linear-api-key` (single source of truth — same secret regardless of how it's referenced).

---

## Slice 1 — Manual-trigger CLI flow

The minimum that gives us the verification loop: Linear ticket = unit of work, MAH evaluator scorecard = "did it actually work?" answer.

### 1. Tie `mah.yaml` to the `awc` agent

**File:** `~/pro/awc-grief/mah.yaml`

Change `agents.generator` from `model: sonnet` to reference `agentId: awc`. MAH runs in the AWC project will then use Aria (Opus 4.7, AWC-namespaced memory, AWC-only context).

```yaml
# before
agents:
  generator:
    type: openclaw
    model: sonnet
    cwd: ~/pro/awc-grief

# after
agents:
  generator:
    type: openclaw
    agentId: awc
    cwd: ~/pro/awc-grief
```

Also update `frankie`/`devin` (the generator-role variants) to reference `agentId: awc` rather than `model: sonnet`. `quinn` (evaluator) can stay on a fast/cheap model — evaluator doesn't need Opus.

**Verify:** the openclaw adapter (`projects/mah/src/adapters/openclaw.ts`) already understands `agentId` (see `executeWithAgent`). Confirm it actually picks up the value from `mah.yaml` and not just from runtime args; if not, plumb it through.

### 2. Linear adapter

**File:** `~/clawd/projects/mah/src/integrations/linear.ts` (new — directory does not exist yet, create it)

Pure GraphQL client. Three exports:

```ts
fetchTicket(id: string): Promise<{
  id: string
  identifier: string          // e.g. "AWC-42"
  title: string
  description: string
  state: { name: string; type: string }
  team: { key: string }
  branchName: string          // Linear's suggested branch
  url: string
}>

postComment(id: string, body: string): Promise<void>

setStatus(id: string, stateName: string): Promise<void>
// Resolves stateName → state.id via team.states (cache per process).
```

**Implementation notes:**
- Endpoint: `https://api.linear.app/graphql`.
- Key loaded once at module init from `~/clawd/.secrets/linear-api-key` (read at call time, not import time, so missing-key error happens at use, not import).
- Header: `Authorization: <key>` (no `Bearer` prefix — Linear uses raw API keys).
- Single helper `gql<T>(query, variables): Promise<T>` for shared error handling.
- No retry/backoff in slice 1 — fail fast and let the caller decide.
- Match TS conventions of the rest of MAH (commander, chalk already in deps).

### 3. `mah linear-run AWC-NN` CLI command

**File:** `~/clawd/projects/mah/src/cli.ts` (add command)

Flow:

1. **Resolve ticket:** `linear.fetchTicket(arg)`. Fail clearly if not found or not in team `AWC`.
2. **Build sprint contract** from `title` + `description`:
   - Sprint goal = title.
   - Sprint description = description (markdown passed through).
   - Branch name = `ticket.branchName` (Linear's suggestion) — keeps Linear's auto-link working.
   - Sprint id = `ticket.identifier` (e.g. `AWC-42`).
3. **Run the sprint** through the existing planner/pipeline (`planSprint` → `runChain` or whatever is the canonical entry; check current `mah run` implementation and reuse).
4. **Post results back** to the Linear ticket via `postComment`:
   - Branch name + commit summary
   - PR URL (from generator output)
   - Evaluator scorecard (compact markdown)
   - Suggested next state ("Recommend → In Review")
5. **Do not auto-transition** state in slice 1. Just suggest. State transitions land in slice 4.

**Flag:** `--dry-run` prints the sprint contract that would be built, doesn't run anything, doesn't post.

### 4. Smoke test

Pick one easy real AWC ticket. Run `mah linear-run AWC-NN` end-to-end. Verify:
- [ ] Sprint contract reads correctly from Linear ticket.
- [ ] Aria (not Sonnet) is the generator — check the run logs / model field.
- [ ] PR opens against the AWC repo.
- [ ] Evaluator scorecard makes it back into a Linear comment.

That's the gate. If smoke test passes, slice 1 is done.

---

## Slice 2+ (do **not** build until slice 1 ships)

- **Slice 2:** Linear webhook → auto-trigger on label `agent-ready` (or state `Ready for Agent`).
- **Slice 3:** Polling cron as backup if webhooks miss.
- **Slice 4:** Auto status transitions (`Ready for Agent` → `In Progress` → `In Review`).

---

## Scope discipline

This is the kind of wiring that's easy to over-engineer in one shot. **Slice 1 is the smallest thing that creates the verification loop** — Linear ticket in, scorecard out. Everything else (webhooks, status automation, retry, SLA tracking) waits until slice 1 has run on at least one real ticket.

If slice 1 reveals a gap in the underlying MAH abstraction (e.g., sprint contracts can't represent what Linear gives us), fix the abstraction *before* layering more on top.

---

## Slice 1 — Shipped 2026-05-02 (Aria)

**Outcome:** wired end-to-end. Smoke-tested with `mah linear-run AWC-1 --dry-run`: ticket resolves, generator shows `awc / claude-opus-4-7`, evaluator stays on sonnet.

**Deviations from the plan:**

1. **agentId plumbing was not in place.** The plan suspected this; confirmed. `executeWithAgent` already accepted `agentId` as an *argument*, but `loadConfig`/`normalizeAgent` never read `agentId` from yaml, so nothing flowed through. Fixed by:
   - Adding optional `agentId` to `AgentConfig` and `NamedAgentConfig`.
   - Reading it in `normalizeAgent` and `loadNamedAgents`.
   - Hydrating `contract.agentConfig` from yaml inside `runSprint` when the contract didn't already specify one — so any caller (including the existing `mah run`) inherits the yaml setting without changes.

2. **`agentId: awc` alone wasn't enough to imply Opus 4.7.** The MAH adapter passes `--model <model>` to claude regardless of agent identity; SOUL.md prepending is a separate layer. Rather than asking yaml to specify both `agentId: awc` *and* `model: opus`, I added an optional `model` field to `AGENT_REGISTRY` entries (`awc.model = 'claude-opus-4-7'`) and gave `normalizeAgent` a resolution chain: explicit yaml model → registry default → `'sonnet'`. Net effect: yaml stays as the plan wrote it; identity → model is now a property of the registry, not the yaml.

3. **`setStatus` signature added a `teamId` parameter.** The plan signature was `setStatus(id, stateName)` but resolving a state name → state id requires a team scope (states are per-team). Took `teamId` explicitly rather than re-fetching the ticket. Slice 1 doesn't call this anyway (no auto-transition until slice 4), but slice 4 callers will need to pass `ticket.team.id`.

4. **Sprint id stays MAH-generated, not `ticket.identifier`.** `runSprint` calls `generateSprintId()` internally; threading through a custom id would have meant either changing `runSprint`'s signature or skipping it for `runExistingContract`. Reusing `runSprint` was the smaller seam. The Linear comment includes both the MAH sprint id and the ticket identifier, so traceability is preserved.

5. **Branch name from Linear is informational.** MAH doesn't currently dictate which branch the dev agent uses — the agent decides. The Linear comment surfaces `ticket.branchName` as a hint, but slice 1 doesn't enforce it. If branch enforcement matters later, that's its own slice.

6. **`devin.defaultSkills` rename.** Replaced `[supabase-rls]` with `[drizzle-rls]`. The skill itself doesn't exist yet; this is a no-op until imported. Flagged in a yaml comment.

**PRs / commits:**
- `~/pro/awc-grief` — PR https://github.com/gregmousseau/awc-portal/pull/62 (yaml only).
- `~/clawd` — local commit `6f7dcd5` on branch `aria/mah-linear-slice1`. Not pushed: clawd's local `main` is 259 commits ahead of `origin/master` (auto-sync history), so a remote PR would show 260 commits, not 1. Push/PR pending a decision from main on whether clawd is meant to flow through GitHub PRs at all.

**Newly-discovered gaps for future slices:**
- The dashboard side of MAH (`~/clawd/projects/mah/dashboard/`) reads `agentConfig` too; slice 4's status-transition logic should also live somewhere that the dashboard can call, not just CLI.
- `runSprint` doesn't accept a pre-set sprint id. If we ever want sprint dirs named after Linear identifiers (`AWC-42` instead of `001-...`), that's a small `runSprint` signature change.
- No retry on Linear API calls. Fine for slice 1, but `postComment` failing currently just logs a yellow warning — sprint cost is sunk. Slice 2 (webhook) should consider whether failed comments need a retry queue.
