# MAH — Multi-Agent Harness | Interview Cheat Sheet

## What It Is
A TypeScript CLI + Next.js dashboard that orchestrates multi-agent development sprints. Describe a task → generates a sprint contract → assigns to specialized agents → runs dev→QA feedback loop → grades output. **Not another agent framework — a harness for agent frameworks.**

## Architecture
```
Human Intent → Planner (Opus) → Sprint Contract
                                      ↓
                          Generator (Dev Agent / Sonnet)
                                      ↓
                          Evaluator (QA Agent / Sonnet)
                                      ↓
                          Pass? → Ship    Fail? → Loop back
```

## Key Numbers
- **39 sprints** run total
- **~$0.03/sprint** average cost
- Self-building: sprints 016–019 built parts of the dashboard itself
- Transcript resume on crash (recovers mid-sprint, skips completed phases)
- Watchdog auto-recovery: stale heartbeat >10min or dead PID → resume

## The 5 Agents
| Agent | Name | Role |
|-------|------|------|
| frontend-dev | Frankie 🎨 | Frontend development |
| dev | Devin ⚙️ | Backend development |
| qa | Quinn 🧪 | QA / evaluation |
| research | Reese 🔬 | Research |
| content | Connie ✍️ | Content writing |

Each agent has its own workspace + SOUL.md (personality, skills, constraints). The pipeline prepends the agent's soul to every prompt automatically.

## Sprint Contract (Core Artifact)
Central coordination document with:
- **Dev Brief:** repo path, constraints, definition of done
- **QA Brief:** tier (smoke/targeted/full), test URL, pass criteria
- **Graders:** pluggable evaluation — UX, Code Review, Accessibility, Performance, Custom

## Grader System
Multiple graders run per sprint independently:
- **UX grader (Quinn)** — Playwright black-box testing, P0–P3 severity
- **Code review grader** — LLM-based static analysis (style, bugs, complexity)
- Aggregate verdict: any fail → fail, conditional → conditional, all pass → pass

## Priority Trilemma
Projects configure speed/quality/cost as 1/2/3. This drives:
- Model selection (Opus for quality-first, Haiku for cost-first)
- QA tier defaults (full matrix vs smoke)
- Human involvement level

## Design Tier System (Frontend)
Frankie gets different design briefs based on task signals:
- **Quick** — fast, functional
- **Polished** — high quality UI
- **Impeccable** — pixel-perfect, animations

## How It Runs
```bash
mah run "Add dark mode to the dashboard"
```
Under the hood: `claude --print --model sonnet --permission-mode bypassPermissions` with enriched prompt on stdin. Detached Node.js process, heartbeat.json polling for live dashboard, JSONL event stream.

## Dashboard (Next.js)
- Project management + priority configuration
- Sprint builder with AI-assisted contract generation (negotiate/refine)
- Live sprint execution with real-time phase tracking
- Sprint history + transcript viewer
- Agent configuration panel

## Tech Stack
- **CLI:** TypeScript, Commander, tsx
- **Dashboard:** Next.js (App Router), Tailwind
- **Execution:** Claude Code CLI (`claude --print`)
- **QA:** Playwright (Chromium/Firefox/WebKit)
- **Config:** YAML (mah.yaml per project)
- **Events:** JSONL stream for replay/monitoring

## Talking Points for Lindy
1. **Sprint contracts as coordination protocol** — makes multi-agent predictable
2. **Separation of builder and judge** — fixes self-evaluation blindness
3. **Pluggable graders** — same pattern for workflow step evaluation
4. **$0.03/sprint via model tiering** — Opus plans, Sonnet executes
5. **Self-building** — the harness built parts of its own dashboard

## Mock Interview Problem
Files in `~/clawd/interview-prep/lindy/`:
- `MOCK-BACKEND-PROBLEM.md` — Agent Workflow API (CRUD Agents/Steps/Runs, SQLite, 90 min)
- `THOUGHT-PROCESS-TEMPLATE.md` — 7-phase log
- `GRADING-RUBRIC.md` — 50% thought process, 30% code, 20% completeness

## AI Usage Tips (for the real interview)
- Tab-complete boilerplate, talk while accepting suggestions
- Think out loud on hard decisions (async runs, reordering logic)
- Don't let AI build everything silently — the silence is the tell
- Reference Lindy's product: "This is basically a simplified version of your workflow engine"
- Debug narration > clean first pass
