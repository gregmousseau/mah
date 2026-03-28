# Sprint Contract: MAH Metrics Capture & Sprint Summary

**Sprint ID:** 004
**Date:** 2026-03-28
**Depends on:** Sprint 003 (pipeline executor)

---

## Task

Add automatic metrics capture to every pipeline run and generate sprint summaries. After each sprint, the system should produce a summary showing timing, cost, defect counts, and iteration history — like the timeline I manually wrote for Sprint 001.

## Dev Brief

- **Repo:** ~/clawd/projects/mah
- **Stack:** TypeScript (same as previous sprints)

### What to Build

**1. Metrics collector (`src/metrics.ts`)**

Wraps the pipeline executor to capture timing at each phase:

```typescript
interface SprintMetrics {
  sprintId: string
  projectName: string
  task: string
  startTime: string          // ISO timestamp
  endTime: string
  
  phases: PhaseMetric[]
  
  totals: {
    durationMs: number
    estimatedCost: number    // sum of all phases
    iterations: number
    humanWaitMs: number      // time spent waiting for human input (0 for autonomous)
  }
  
  quality: {
    defectsFound: DefectSummary    // { p0: 0, p1: 4, p2: 3, p3: 0 }
    defectsFixed: DefectSummary
    defectsRemaining: DefectSummary
    shiftLeftCandidates: number    // (manual annotation for now)
  }
  
  verdict: 'pass' | 'conditional' | 'fail' | 'escalated'
  bottleneck: string         // which phase took longest or caused most issues
}

interface PhaseMetric {
  phase: 'plan' | 'dev' | 'qa'
  round: number              // 1, 2, 3...
  durationMs: number
  model: string
  tokenEstimate?: {
    input: number
    output: number
  }
  costEstimate?: number
}
```

**2. Cost estimator (`src/cost.ts`)**
- Rough cost estimation based on model + token count
- Token count from agent output length (rough heuristic: output chars / 4)
- Model pricing table (hardcoded for now):
  - haiku: $0.25/$1.25 per MTok
  - sonnet: $3/$15 per MTok  
  - opus: $15/$75 per MTok
- This is approximate — good enough for trend tracking, not billing

**3. Sprint summary generator (`src/summary.ts`)**
After pipeline completion, generate a markdown summary:

```markdown
# Sprint Summary: [name]
**Date:** 2026-03-28 | **Verdict:** ✅ PASS | **Iterations:** 2

## Timeline
| Phase | Duration | Est. Cost | Notes |
|-------|----------|-----------|-------|
| Contract | 0:05 | $0.02 | Auto-generated |
| Dev R1 | 14:00 | $0.25 | 13 files changed |
| QA R1 | 20:00 | $0.35 | ❌ 4 P1s found |
| Dev R2 | 5:00 | $0.15 | Root cause + fixes |
| QA R2 | 10:00 | $0.30 | ✅ All clear |

## Totals
- **Duration:** 52 min
- **Cost:** ~$1.07
- **Human wait:** 0 min
- **Bottleneck:** Dev quality (4 defects in R1)

## Defects
- R1: 4× P1, 3× P2
- R2: 0 (all resolved)
```

**4. Metrics storage**
- Save to `.mah/metrics/<sprint-id>.json` (machine-readable)
- Save summary to `.mah/sprints/<sprint-id>/SUMMARY.md` (human-readable)
- Aggregate file: `.mah/metrics/aggregate.json` (append per sprint, for trend analysis)

**5. CLI integration**
- `mah status` now shows: last sprint summary, project totals (sprints run, avg cost, avg iterations)
- `mah metrics` — show aggregate metrics across all sprints
- `mah metrics --sprint 001` — show specific sprint metrics

### Constraints
- Cost estimates are rough (clearly labeled as estimates, not actuals)
- Token counting is heuristic (chars/4) — close enough for trends
- Metrics append to aggregate file (no database needed for MVP)
- Summary generation is template-based (no LLM needed)

### Definition of Done
- Every `mah run` automatically saves metrics JSON + summary markdown
- `mah status` shows project health at a glance
- `mah metrics` shows trends across sprints
- Cost estimates are within ~50% of actuals (good enough for comparison)

## QA Brief

- **QA Level:** smoke
- **Test focus:** Run a sprint, verify metrics JSON is valid, summary markdown is readable, aggregate file grows
- **Pass criteria:** Metrics capture doesn't crash the pipeline, numbers are plausible
- **Known limitations:** Cost estimates are rough, token counts are heuristic

---

## Artifacts Log

| Time | Event | Notes |
|------|-------|-------|
| | Contract written | |
| | Dev spawned | |
| | Dev complete | |
| | QA | |
