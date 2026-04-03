# MAH Dashboard Performance Analysis
**Date:** April 2026  
**Author:** Moe (subagent: research-performance)

---

## TL;DR

The dashboard is **3–5x slower than CLI before execution even starts**, due to two extra sequential LLM calls (planning + negotiation) that the CLI skips entirely. Once execution begins, the actual sprint pipeline is identical. The "10x slower" feeling is real and explained.

---

## 1. The Execution Path — Full Breakdown

### CLI Path
```
mah run "task"
  → generateContract() (local, no LLM)
  → dev agent (Sonnet, 1 call)
  → qa agent (Sonnet, 1 call)
  → done
```
**LLM calls per round: 2** (dev + QA)  
**Pre-execution overhead: ~0** (contract generated locally from a template)

---

### Dashboard Path (YOLO mode — the fast button)
```
POST /api/builder/plan
  → Claude Opus (1 call, 3-min timeout)          ← ~30–90s typically

for each sprint:
  POST /api/builder/negotiate                      ← sequential, not parallel!
    → Claude Sonnet (generator brief, 1 call)     ← ~15–30s
    → Claude Sonnet (evaluator brief, 1 call)     ← ~15–30s

POST /api/sprints/run (per sprint)
  → spawns executor.mjs (detached)
    → runExistingContract()
      → dev agent (Sonnet, 1 call)
      → qa agent (Sonnet, 1 call)
```

**Pre-execution overhead for 1 sprint: 1 Opus + 2 Sonnet calls = ~60–150s before the sprint even starts**  
**Pre-execution overhead for 3 sprints: 1 Opus + 6 Sonnet calls = ~120–210s**  
**Plus the actual execution: 2 Sonnet calls per sprint**

---

## 2. Root Cause Analysis

### Finding #1: Negotiation is sequential and adds 2 LLM calls per sprint

File: `src/app/builder/page.tsx`, `negotiateAll()` and YOLO flow:

```typescript
// Phase 2: Negotiate all contracts
for (let i = 0; i < draftSprints.length; i++) {
  setYoloPhase(`Negotiating ${i + 1}/${draftSprints.length}…`);
  const negRes = await fetch("/api/builder/negotiate", { ... });
  // ...
}
```

This is **sequential** — each sprint waits for the previous negotiation to complete. For 3 sprints, that's 6 sequential Sonnet calls before any execution begins.

Inside `/api/builder/negotiate/route.ts`:
```typescript
// Step 1: Generator proposes definition of done
generatorResponse = await runClaude(generatorPrompt);  // Sonnet call

// Step 2: Evaluator tightens pass criteria
evaluatorResponse = await runClaude(evaluatorPrompt);  // Sonnet call
```

**These two calls are also sequential within each negotiation**, not parallel.

---

### Finding #2: Planning uses Opus for a task Sonnet/Haiku could handle

File: `src/app/api/builder/plan/route.ts`:

```typescript
async function runClaudeOpus(prompt: string): Promise<string> {
  const child = spawn(claudePath, ["--print", "--model", "opus", ...]);
  // 3-minute timeout
}
```

Opus is ~3x slower and ~15x more expensive than Sonnet. The planning task (decompose prompt → JSON sprints list) is structured and deterministic — it doesn't require Opus-level reasoning. Sonnet would produce equivalent output.

---

### Finding #3: Dashboard polling is 5 seconds — acceptable but improvable

File: `src/app/sprints/[id]/page.tsx`:
```typescript
const { data, loading, error, refetch } = usePolling<SprintData>(`/api/sprints/${id}`, 5000);
const { data: queueState } = usePolling<QueueState>("/api/queue", 5000);
```

File: `src/app/live/page.tsx`:
```typescript
const { data: heartbeat } = usePolling<Heartbeat>("/api/heartbeat", 5000);
```

5-second polling means up to 5s lag before the UI reflects sprint completion. This contributes to the "feels slow" perception even after the sprint is done. Not a major bottleneck for actual execution time, but affects perceived speed.

---

### Finding #4: Executor spawns a separate Node process with module loading overhead

The executor is a detached `executor.mjs` that dynamically imports `dist/pipeline.js`:

```javascript
const { runExistingContract } = await import(pipelinePath);
```

This adds ~2–5s of Node.js startup + module loading overhead per sprint, vs CLI which is already running in-process. Minor but measurable.

---

### Finding #5: No parallelism in the negotiation step

`negotiateAll()` uses `await` in a `for` loop (sequential). For a 3-sprint plan, negotiations run one after another. They could run in parallel with `Promise.all()`.

Similarly, within each negotiation, the generator brief and evaluator brief are sequential calls — they could be parallelized since the evaluator brief only needs the generator output (inherent dependency), but this one has a real dependency so can't be parallelized easily.

---

## 3. Time Cost Estimate

| Step | CLI | Dashboard (1 sprint) | Dashboard (3 sprints) |
|------|-----|---------------------|----------------------|
| Planning | 0s | ~60–90s (Opus) | ~60–90s (once) |
| Negotiation | 0s | ~45–60s (2x Sonnet) | ~135–180s (6x Sonnet, sequential) |
| Execution (dev) | ~30–120s | ~30–120s | ~30–120s each |
| Execution (QA) | ~20–60s | ~20–60s | ~20–60s each |
| **Total overhead** | **~0s** | **~105–150s** | **~195–270s** |

For a simple 1-sprint task, the dashboard adds ~2 minutes of LLM overhead before execution begins. The execution itself is identical.

---

## 4. Optimization Opportunities

### Quick Wins (1 sprint, high impact)

**QW1: Downgrade planner from Opus → Sonnet**
- File: `src/app/api/builder/plan/route.ts`
- Change `--model opus` to `--model sonnet`
- Impact: Planning drops from ~60–90s to ~20–40s. Cost savings ~15x.
- Risk: Marginally less sophisticated decomposition, but structured JSON output is well within Sonnet's capability.

**QW2: Parallelize negotiation calls**
- File: `src/app/builder/page.tsx`, `negotiateAll()` and YOLO flow
- Replace `for...await` with `Promise.all(sprints.map(negotiateSprint))`
- For 3 sprints: drops from ~135s sequential to ~45s parallel (all run concurrently)
- Risk: Slightly higher API rate pressure, but Claude handles concurrent calls fine.

**QW3: Parallelize generator + evaluator briefs within each negotiation**
- Wait... the evaluator prompt includes `generatorResponse` so there IS a dependency. Can't fully parallelize.
- But: consider making the evaluator brief optional or combining both into one call.

**QW4: Add "skip negotiation" option for simple/low-complexity sprints**
- If `estimatedComplexity === "low"`, skip negotiation entirely and use default devBrief/qaBrief
- Already partially handled (negotiate endpoint has fallbacks if it fails)
- Make this explicit: add a `skipNegotiation` flag

**QW5: Reduce polling interval from 5s → 2s for active sprints**
- File: `src/app/sprints/[id]/page.tsx`
- When sprint status is "running", poll at 2s; when idle, poll at 10s
- This reduces "done but UI doesn't know yet" lag

---

### Medium-Term (1-2 sprints, good ROI)

**MT1: Combine plan + negotiate into one Sonnet call**
- Current: 1 Opus call (plan) + 2N Sonnet calls (negotiate each sprint)
- Future: 1 Sonnet call that returns plan + devBrief + qaBrief in one shot
- This eliminates the negotiation step entirely for the happy path
- The planner prompt is already very detailed — it could include the briefs in the output schema

**MT2: Add SSE (Server-Sent Events) for sprint execution updates**
- Replace 5s polling with SSE stream from `/api/sprints/[id]/stream`
- The executor already writes heartbeat.json every 30s — SSE could tail that file
- Would make the live view feel instant instead of laggy
- The live page already has `usePolling<Heartbeat>("/api/heartbeat", 5000)` — this is the highest-value target for SSE

**MT3: Cache the planning step in session storage**
- The plan is already saved to draft state, but planning runs fresh each YOLO
- If the user adjusts the prompt slightly and re-plans, it re-runs Opus
- Add content hash → plan caching (5-10 min TTL)

---

### Longer-Term

**LT1: Replace executor.mjs with in-process execution**
- Spawning a separate Node process adds startup overhead and loses shared module cache
- Could use a worker_threads-based approach or an API route that streams output
- Complex but would eliminate the 2-5s spawn overhead

**LT2: Use Haiku for planning**
- For truly simple tasks ("add a button"), even Sonnet is overkill for planning
- Could add a "lite mode" that uses Haiku for planning and skips negotiation
- Estimated cost: ~$0.001 vs $0.03 for the current Opus planning call

---

## 5. Recommended Priority Order

1. **QW1** — Swap Opus → Sonnet for planning (5-min change, ~30–50s saved, ~15x cost reduction for planning)
2. **QW2** — Parallelize negotiation with `Promise.all` (10-min change, ~60–90s saved for multi-sprint plans)
3. **QW4** — Skip negotiation for `low` complexity sprints (30-min change)
4. **MT1** — Combine plan + negotiate into one call (biggest architectural win, 1 sprint)
5. **MT2** — SSE for live updates (improves perceived speed, 1 sprint)

---

## 6. Files to Change

| File | Change |
|------|--------|
| `src/app/api/builder/plan/route.ts` | `--model opus` → `--model sonnet` |
| `src/app/builder/page.tsx` | Parallelize `negotiateAll()` loop |
| `src/app/builder/page.tsx` | Skip negotiation for `estimatedComplexity === "low"` |
| `src/app/sprints/[id]/page.tsx` | Adaptive polling: 2s when running, 10s when idle |
| `src/app/live/page.tsx` | SSE or adaptive polling (2s while active) |

---

## 7. Summary

The dashboard isn't slow because execution is slow — the pipeline is identical to CLI. It's slow because:

1. **Opus planning adds ~60–90s before any execution**
2. **Sequential negotiation adds ~45s per sprint (2 Sonnet calls each, sequentially)**  
3. **For a 2-sprint plan, that's ~3–4 minutes of overhead before the first executor even spawns**

The CLI skips all of this and goes straight to execution. The "10x slower" perception is accurate for simple single-sprint tasks with quick execution — in that case, 2 minutes of overhead vs 30 seconds of execution = 4–5x overhead ratio alone.

**Biggest single win:** Parallelize negotiations (`Promise.all`) + swap Opus for Sonnet in planning. Combined: ~2–3 minutes saved, implementable in under an hour.
