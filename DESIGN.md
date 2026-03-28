# MAH Product Design Document

*Multi-Agent Harness — "Mixture of Expert Systems"*
*Started: 2026-03-28*

---

## Vision

An orchestration layer that sits above agents — regardless of what they are. OpenClaw, Codex, Claude, UIPath, human reviewers — they're all just "experts" in the mixture. MAH routes the work, enforces sprint contracts, grades the output, and learns from every run.

**Not another agent framework.** A harness for agent frameworks.

## Core Concept

```
Human Intent → Planner → [Generator → Evaluator]* → Deliverable
                  ↑              feedback loop           |
                  └──── metrics + autoresearch ──────────┘
```

The sprint contract is the central artifact. It defines "done" before work starts, so every agent knows what to build and how to grade it.

## Validated in Sprint 001 (2026-03-28)

**Task:** Add dark mode switcher to W Construction website
**Result:** 2 iterations, ~52 min, ~$1.07 total

What we proved:
- Sprint contracts work as the coordination protocol between agents
- The feedback loop catches real bugs (4 P1s in R1, all fixed in R2)
- Black-box UX testing catches things code review can't (dual Tailwind config)
- The system runs autonomously — zero human decisions needed during execution
- Structured reports give clear pass/fail with severity grading

What we learned:
- Some defects should shift left (dev checklist), some belong in QA
- Project priorities (speed/quality/cost) should drive pipeline configuration
- Metrics at every step enable continuous improvement
- Decision latency is the real bottleneck — the harness reduces it to near-zero for routine work

See: `LEARNINGS-SPRINT-001.md` for full analysis.

---

## Architecture

### The Priority Trilemma

Every project configures three priorities that change how the harness behaves:

```yaml
project:
  name: "W Construction"
  priorities:
    speed: 1      # highest
    quality: 2
    cost: 3
```

| Priority Config | Dev Behavior | QA Behavior | Human Role |
|----------------|-------------|-------------|------------|
| Speed > Quality > Cost | Self-review pass, fast models, parallel work | Smoke first, escalate on failure | Notified, rarely blocks |
| Quality > Speed > Cost | Thorough implementation, opus for complex work | Full matrix, multiple evaluator types | Reviews contracts, overrides verdicts |
| Cost > Quality > Speed | Haiku where possible, minimal iterations | Smoke only, human reviews findings | Active participant, decisions in the loop |
| Speed > Cost > Quality | Fastest models, smoke QA, ship fast | Minimal testing, flag only P0 | Async notification only |

The orchestrator adjusts model selection, QA tier defaults, shift-left aggressiveness, and human involvement based on these priorities.

### Pipeline Stages

```
1. INTAKE        Human request or backlog item
2. PLAN          Orchestrator writes sprint contract
3. GENERATE      Dev agent executes (may self-review based on priorities)
4. EVALUATE      QA agent grades (tier based on change scope + priorities)
5. DECIDE        Orchestrator: pass → ship, fail → loop, escalate → human
6. DELIVER       Deploy, notify, log metrics
7. LEARN         Autoresearch: analyze patterns, update templates/checklists
```

### Agent Roles (Extensible)

| Role | Current Agent | Could Also Be |
|------|--------------|---------------|
| Planner | Moe (orchestrator) | Any LLM, project manager, JIRA integration |
| Generator | Claude subagent | Codex, Devin, Cursor, human developer |
| UX Evaluator | Quinn (Playwright) | Browserbase, human QA, crowd testing |
| Code Reviewer | (not built yet) | Codex, Greptile, human reviewer |
| Accessibility Eval | (not built yet) | axe-core agent, WCAG checker |
| Content Evaluator | (not built yet) | Humanizer, proofreader, brand voice checker |

### Metrics Captured Per Sprint

```yaml
metrics:
  timing:
    plan_ms: 300000       # 5 min to write contract
    dev_ms: 840000        # 14 min dev R1
    qa_ms: 1200000        # 20 min QA R1
    dev_r2_ms: 300000     # 5 min dev R2
    qa_r2_ms: 600000      # 10 min QA R2
    human_wait_ms: 0      # human never blocked
    total_ms: 3120000     # 52 min
  cost:
    dev_total: 0.40
    qa_total: 0.65
    orchestrator: 0.02
    total: 1.07
  quality:
    iterations: 2
    defects_r1: { p0: 0, p1: 4, p2: 3, p3: 0 }
    defects_r2: { p0: 0, p1: 0, p2: 0, p3: 0 }
    shift_left_candidates: 4  # defects dev could have caught
  bottleneck: "dev_quality"   # most defects were dev misses
```

### Autoresearch Loop (Karpathy-inspired)

After N sprints (configurable: every sprint, daily, weekly), the system analyzes accumulated metrics:

**Pattern detection:**
- "Dev agents miss dark: classes 60% of the time" → add to dev contract template
- "Quinn catches 95% of defects at targeted tier for CSS changes" → adjust tier recommendations
- "Iteration count averages 1.8 for frontend, 1.2 for backend" → frontend contracts need more upfront spec

**Template evolution:**
- Sprint contract templates get refined based on what causes failures
- QA rubrics adjust based on false positives/negatives
- Model routing optimizes based on defect rates per model

**Budget control:**
- Autoresearch itself has a cost — only runs if user/project budget allows
- Can be turned off entirely for cost-priority projects
- Results are shared across projects (a learning from Project A benefits Project B)

---

## Product Scope — MVP

### What the MVP Does
1. **Define a project** — name, repo, priorities (speed/quality/cost), agent assignments
2. **Create sprint contracts** — from natural language input or backlog items
3. **Execute the pipeline** — spawn dev → spawn QA → handle feedback loop → deliver result
4. **Show results** — sprint timeline, QA reports, defect trends, cost tracking
5. **Learn** — accumulate metrics, surface shift-left opportunities, refine templates

### What the MVP Does NOT Do
- Multi-repo orchestration (single repo per sprint for now)
- Custom evaluator types (Quinn is the only evaluator, UX-focused)
- Parallel sprint execution (sequential for now)
- External agent integration (OpenClaw subagents only for now)
- Dashboard UI (CLI + file-based for MVP)

### MVP Tech Stack
- **Runtime:** OpenClaw (sessions_spawn for agent orchestration)
- **Config:** YAML/JSON project files in workspace
- **Metrics:** JSON log files, queryable via CLI
- **Reports:** Markdown (sprint contracts, QA reports, learnings)
- **Future:** Web dashboard (the Inception build — MAH builds itself)

---

## The Inception Build

The MVP is built using a MAH. Sprint contracts for each feature, Quinn testing the output, metrics tracking the build process itself. This is the demo: the system building itself, tested by itself.

**Why this matters for content:**
- Every sprint contract is a slide in the case study
- Every QA report is evidence the system works
- Every iteration is proof that the feedback loop catches real bugs
- The cost/time metrics are the punchline: "We built this for $X in Y hours"

---

## Nomenclature (Confirmed)

| Term | Meaning |
|------|---------|
| **MAH** | Multi-Agent Harness |
| **Sprint Contract** | The agreement defining scope, QA level, and pass criteria |
| **Priority Trilemma** | Speed / Quality / Cost — pick your order |
| **QA Tiers** | Smoke / Targeted / Full Matrix |
| **Shift Left** | Moving defect detection earlier in the pipeline |
| **Autoresearch** | System analyzing its own metrics to improve future runs |
| **Mixture of Expert Systems** | The Moe's AI brand framing — specialized agents orchestrated into pipelines |

---

## Relationship to Existing Work

| Asset | Role in MAH |
|-------|-------------|
| Quinn's workspace | The Evaluator seed — already has SOUL.md, Playwright, device matrix |
| PROTOCOL.md | The orchestration spec — how agents communicate |
| Sprint 001 | The proof-of-concept — real bugs caught, real feedback loop |
| Case study draft | The content artifact — "15 Pieces of Flair" blog post |
| Marketing pipeline | Distribution for content generated from MAH runs |
| Weekend plan | The execution roadmap |

---

## Weekend Plan Status (updated 2:30 PM Saturday)

| Item | Status | Notes |
|------|--------|-------|
| ✅ Sprint contract protocol | Done | PROTOCOL.md |
| ✅ Live test (Sprint 001) | Done | Dark mode, 2 iterations, PASS |
| ✅ Learnings captured | Done | LEARNINGS-SPRINT-001.md |
| ✅ Product design doc | Done | This file |
| 🔲 Remotion project setup | Not started | Deferred — test run content, not final |
| 🔲 Product sprint (MVP) | Next | Define features, write contracts, build it |
| 🔲 Blog post draft | After MVP | Content is richer with the Inception angle |
| 🔲 LinkedIn carousel | After blog | |
| 🔲 Distribution | After content | |

**Adjusted plan:** Build the MVP first (the Inception build), then create content from the entire arc — Sprint 001 as proof-of-concept, MVP build as the demo, learnings as the insight layer. Stronger narrative than content-first.

---

*This document evolves with every sprint.*
