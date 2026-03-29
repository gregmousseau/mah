# Phase 2 — MAH Product Build

*March 28 (night session) — Building the real product*

## What We're Building

The MAH goes from "proof of concept that runs in terminal" to "product you can demo." Key additions:

1. **Sprint Builder** — UI-driven sprint creation from a single prompt. Auto-generates contracts, suggests agents, estimates costs, presents QA matrix. User approves, modifies, or schedules.
2. **Code Review Grader** — Second evaluator alongside Quinn. Code-level analysis (Codex or Claude).
3. **Full Transcripts** — Capture complete agent conversations, not just events. Every prompt sent, every response received.
4. **Project/Epic Grouping** — Sprints belong to projects. Sprint 001 (W Construction dark mode) is a different project from 002-006 (MAH build). Dashboard lets you filter and manage by project.
5. **Dashboard Sprint Management** — Build, approve, run, and schedule sprints from the UI.

## Sprint Plan

### Sprint 007: Project/Epic Data Model + Dashboard Grouping
**What:** Add project concept to the data model. Sprints belong to projects. Dashboard shows project filter/tabs.
**Changes:**
- New type: `Project { id, name, repo, config, sprints[] }`
- Update mah.yaml to support multiple projects
- Retroactively tag Sprint 001 as project "w-construction", 002-006 as project "mah-build"
- Dashboard: project selector/filter, project overview page
- API: `/api/projects`, update `/api/sprints?project=<id>`
**QA:** Smoke — data displays, filter works

### Sprint 008: Full Transcript Capture
**What:** Capture complete agent prompts and responses as transcript files alongside sprint artifacts.
**Changes:**
- New type: `Transcript { phases: TranscriptPhase[] }` where each phase has `promptSent`, `responseReceived`, `model`, `tokens`
- Pipeline executor saves transcripts to `.mah/sprints/<id>/transcript.json`
- Event logger captures full prompt/response content (not just summaries)
- Dashboard: transcript viewer on sprint detail page (collapsible, syntax-highlighted)
- Backfill Sprint 001 transcripts from the conversation G pasted earlier
**QA:** Smoke — transcripts save and display

### Sprint 009: Sprint Builder UI
**What:** The crown jewel. A form/wizard in the dashboard where you:
1. Enter a prompt (free text — could be from an email, client message, feature request)
2. System auto-generates: sprint contract, suggested agent team, definition of done, QA tier recommendation, cost estimate, priority trilemma defaults
3. User reviews and can modify any field
4. Actions: Approve → Run Now, Approve → Schedule, Save as Draft, Reject
**Changes:**
- New page: `/builder` with multi-step wizard
- API route: `/api/builder/generate` — takes prompt + project config, returns draft contract
- Contract generation uses LLM (Claude) to parse the prompt and produce structured contract
- Cost estimator shows expected cost per tier
- Human-in-the-loop checkpoints configurable in the UI
- Schedule option writes a cron-compatible config
**QA:** Targeted — test the full flow from prompt to generated contract

### Sprint 010: Code Review Grader
**What:** Second evaluator type. Runs alongside Quinn (UX) for code-level analysis.
**Changes:**
- New grader type in the adapter system: `code-review`
- Reviews: code quality, potential bugs, security issues, test coverage gaps, style consistency
- Uses Codex (OpenAI) or Claude — configurable per project
- Sprint contract gets a `graders` field: `[{ type: 'ux', agent: 'quinn' }, { type: 'code-review', agent: 'reviewer' }]`
- Pipeline executor runs graders in parallel (or sequential based on priority config)
- Dashboard: grader results side by side on sprint detail
- Aggregate verdict: ALL graders must pass for sprint to pass
**QA:** Targeted — run a real code review on Sprint 001's dark mode changes

### Sprint 011: Dashboard Sprint Management (Run/Schedule/Monitor)
**What:** Wire the dashboard to actually trigger and monitor sprints.
**Changes:**
- "Run" button on approved sprint contracts → triggers pipeline via API
- Real-time progress updates via polling (already built in Sprint 005)
- Schedule for later: date/time picker, creates a cron job or queued task
- Sprint status management: draft → approved → running → passed/failed
- Cancel/pause running sprints
- Notification preferences per sprint (Telegram, email, none)
**QA:** Targeted — trigger a real sprint from the UI, watch it run

## Execution Order

Sequential, each builds on the last:
```
007 (projects)  → needed for everything else
008 (transcripts) → needed for builder preview
009 (builder UI) → the main feature
010 (code review) → parallel grader
011 (management) → wires it all together
```

## Estimated Cost
- 5 sprints × ~$0.50 avg = ~$2.50 dev cost
- QA runs: ~$1.50
- Builder sprint uses LLM for contract generation: ~$1-2
- **Total estimate: $5-8**

Well under the $40 budget. Leaves room for iterations.
