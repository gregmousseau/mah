# MAH Autonomous Build Session — March 28, 2026

**Window:** ~3:30 PM – 9:30 PM EDT (G away)
**Orchestrator:** Moe (manual sessions_spawn, as proven in Sprint 001)
**Telegram:** Ping G for decisions, 30-min timeout, then use best judgment
**Goal:** Demo-ready MVP by evening

---

## Revised Sprint Plan

### Sprint 002: Foundation + Types (~45 min)
**What:** Project structure, TypeScript types, config schema, Sprint 001 data as seed
- `src/types.ts` — SprintContract, QAReport, Metrics, Defect, ProjectConfig
- `src/config.ts` — mah.yaml loader with defaults
- `package.json` with dependencies
- Seed data: Sprint 001 metrics + contract + QA reports as JSON fixtures
- **No CLI yet** — types and data structures only

**QA:** Smoke — TypeScript compiles, types are coherent, seed data validates

### Sprint 003: Dashboard UI (~90 min)
**What:** Next.js web app that visualizes sprint history
- Sprint timeline view (the visual from Sprint 001: contract → dev → QA → loop → pass)
- Sprint detail view (contract, QA report, defect list)
- Metrics overview (total cost, avg iterations, defect trends)
- Live sprint indicator (which phase is currently running)
- Responsive — looks good on phone (G checks from Telegram link)

**QA:** Targeted — renders on mobile + desktop, data displays correctly, no broken layouts

### Sprint 004: Metrics + Pipeline Engine (~60 min)
**What:** The orchestration logic as a TypeScript module
- Sprint runner that manages the dev → QA → feedback loop
- Auto-capture timing, token stats from sessions_spawn completion events
- Writes metrics JSON + summary markdown after each phase
- Dashboard reads these files for real-time-ish updates

**QA:** Targeted — run a test sprint, verify metrics captured, dashboard updates

### Sprint 005: Real-time Progress + Telegram Integration (~60 min)
**What:** Make the dashboard live and add notifications
- File watcher or polling: dashboard auto-refreshes as sprints progress
- Sprint phases update in real-time (dev started → dev complete → QA started...)
- Telegram notification on sprint completion (cost, verdict, link to dashboard)
- Heartbeat: if an agent hasn't responded in 15 min, flag as potentially stuck

**QA:** Smoke — live updates work, Telegram notification fires

### Sprint 006: Polish + Demo Data (~45 min)
**What:** Make it presentable
- Load Sprint 001 as historical data (the W Construction dark mode story)
- If Sprints 002-005 are captured as metrics, load those too (Inception!)
- Landing state: when no sprint is running, show history + "ready" status
- Clean up any rough edges from previous sprints

**QA:** Smoke — overall feel, no crashes, good first impression

---

## Decision Protocol (while G is away)

| Situation | Action |
|-----------|--------|
| Sprint passes QA | Move to next sprint immediately |
| Sprint fails QA, fixes are obvious | Loop to dev R2, re-test |
| Sprint fails QA after 3 iterations | Ping G on Telegram, wait 30 min, then skip to next sprint and note blocker |
| Architectural decision needed | Use best judgment, document reasoning, note for G's review |
| Cost exceeds ~$15 total | Ping G on Telegram before continuing |
| Agent unresponsive >15 min | Kill and retry once. If still stuck, skip and note. |

## Estimated Total
- **Time:** ~5-6 hours (fits the window)
- **Cost:** ~$5-10 (5 dev runs + 5 QA runs, mostly targeted tier)
- **Output:** Working dashboard showing sprint history, metrics, and live progress

---

## What G Gets When He's Back

1. Dashboard URL (localhost) to see the full build history
2. Sprint 001 (dark mode) loaded as seed data
3. Sprints 002-006 metrics captured (the system built itself — Inception demo)
4. Telegram summary of what happened while he was away
5. Any decisions I made noted for his review

---

## Config: Human-in-the-Loop Settings

Based on G's input, documenting these as future MAH config options:

```yaml
human:
  notification_channel: telegram
  response_timeout_minutes: 30
  on_timeout: proceed_with_best_judgment  # or: pause | skip | escalate
  
  # When to ping the human
  notify_on:
    - sprint_complete          # always
    - qa_fail                  # if fail after max iterations
    - cost_threshold: 15.00    # if cumulative cost exceeds this
    - decision_needed          # architectural or scope questions
    - agent_stuck: 15          # minutes with no response
```

This becomes part of mah.yaml in the config sprint.
