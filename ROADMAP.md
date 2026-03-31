# MAH Roadmap

*Last updated: 2026-03-30*

This roadmap tracks the bigger picture. Sprints are the unit of work; Epics group sprints toward a goal. The Planner agent owns decomposition: Roadmap → Epics → Sprints.

---

## Vision

A 24/7 autonomous team of agents that continuously produces usable software (or any knowledge work) — with humans setting direction, not managing tasks. Agents propose work, negotiate sprints, build, QA, and self-assign the next task. The loop keeps running until the human says stop.

---

## Epics

### 🔴 Epic 1: Roadmap & Epic Layer
*Status: Planned*

Add a roadmap/epic layer above the Kanban board. Sprints roll up into Epics; Epics roll up into the roadmap. Orchestrator context is scoped to epic-level summaries, not full sprint transcripts.

**Sprints:**
- [ ] Data model: `epics` table/file, epic ↔ sprint relationship
- [ ] Dashboard: Epic view (top-level) → drill into sprints
- [ ] Orchestrator: inject epic summary into sprint context instead of full history
- [ ] Planner agent: decompose roadmap item → Epic → sprint cards
- [ ] Epic summary compression: auto-summarize completed sprints into rolling epic summary

---

### 🔴 Epic 2: Agent-Generated Follow-Up Tickets
*Status: Planned*

Agents surface follow-up work during a sprint — defects noticed, missing features, tech debt — as structured ticket suggestions in their final output. The orchestrator picks these up and creates backlog items automatically. Nothing falls through the cracks.

**Sprints:**
- [ ] Define structured output format for agent-suggested tickets (JSON in final report)
- [ ] Orchestrator: parse agent output for ticket suggestions, auto-create backlog items
- [ ] Dashboard: "Agent-suggested" tag on auto-created tickets
- [ ] QA agent: flag incomplete acceptance criteria as follow-up tickets, not just failures
- [ ] Dev agent: surface tech debt / missing abstractions as optional follow-up suggestions

---

### 🔴 Epic 3: Autonomous Sprint Loop
*Status: Planned*

After a sprint passes QA, if the user has "keep building" mode on, the orchestrator auto-negotiates the next sprint from the backlog and kicks off the next round. The human approves direction at the Epic level; agents handle the rest.

**Sprints:**
- [ ] "Keep building" toggle on dashboard (opt-in auto-loop)
- [ ] Orchestrator: post-QA pass → pull next sprint card from backlog → auto-start
- [ ] Sprint contract auto-negotiation (planner + executor handshake without human input)
- [ ] Guardrails: max consecutive auto-sprints, cost caps, pause-on-failure
- [ ] Human-in-the-loop checkpoints: configurable "pause every N sprints for review"

---

### 🟡 Epic 4: Live Agent Streaming
*Status: Planned*

Show live agent thinking/output in the dashboard as a sprint runs. SSE (Server-Sent Events) from the executor → dashboard. No websockets needed for v1.

**Sprints:**
- [ ] Executor: stream agent output to SSE endpoint as it arrives
- [ ] Dashboard: live log panel per sprint (collapses when done)
- [ ] Agent identification: color-code by agent role (Frankie=blue, Devin=green, Quinn=orange)
- [ ] "Thinking" vs "output" visual distinction

---

### 🟡 Epic 5: Agent Sub-Specialization
*Status: Planned*

Current agents are broad (Frankie = all frontend). For complex projects, narrow the scope: layout agent, component agent, animation agent. Configured per-project via `mah.yaml`.

**Sprints:**
- [ ] Agent config schema: sub-roles, skill scopes, handoff rules
- [ ] mah.yaml: define agent roster per-project (not global)
- [ ] Planner: route sprint cards to correct sub-specialist based on task type
- [ ] Template library: pre-built rosters for common project types (web app, API, content)

---

### 🟢 Epic 6: Knowledge Work Beyond Code
*Status: Concept*

MAH isn't just for software. The same loop works for marketing campaigns, research reports, content pipelines, legal document drafting. Generalize the agent roles and sprint contracts to support non-code outputs.

**Sprints:**
- [ ] Abstract "output type" from sprint contract (code, document, research, design brief)
- [ ] QA criteria for non-code outputs (rubric-based evaluation, not test pass/fail)
- [ ] Content agent roster template (Reese=research, Connie=writer, Quinn=editor)
- [ ] Case study: run a full blog series end-to-end through MAH

---

## Backlog (Ungroomed)

- SSE streaming for heartbeat.json (simpler pre-cursor to Epic 4)
- Cost tracking per epic (not just per sprint)
- Slack/Discord notifications on sprint complete / epic complete
- Export sprint + epic history as markdown report
- Multi-user support (assign epics to team members)
- GitHub integration: auto-create PRs from sprint output

---

## Notes

- **Planner owns decomposition.** The same planner agent used for sprint planning breaks roadmap goals → epics → sprint cards. No new agent needed.
- **Epic summaries are the context unit.** Full sprint transcripts are overkill for the orchestrator. Once an epic completes, compress to a 1-paragraph summary for future context injection.
- **Agent-suggested tickets are the self-improvement loop.** As agents build, they surface what's missing. The system gets smarter about its own gaps over time.
- **The 24/7 loop is the endgame.** Human sets direction → agents run → human reviews results. Not "human manages agents" but "agents manage themselves toward human goals."
