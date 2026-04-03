# MAH — Multi-Agent Harness

**Orchestrate multi-agent development sprints with sprint contracts, pluggable graders, and automated dev→QA feedback loops.**

MAH sits above agent frameworks — OpenClaw, Claude Code, Codex, or any CLI-based agent — and coordinates them through structured sprint contracts. It's not another agent framework. It's a harness for agent frameworks.

## How It Works

```
Human Intent → Planner → Sprint Contract
                              ↓
                  Generator (Dev Agent)
                              ↓
                  Evaluator (QA Agent)
                              ↓
                  Pass? → Ship    Fail? → Loop back
```

1. **You describe a task** — "Add dark mode to the site" or "Fix the broken checkout flow"
2. **MAH generates a sprint contract** — defines what "done" means for both dev and QA
3. **A dev agent executes** — works in the repo, makes changes, reports what it did
4. **QA agents grade the output** — multiple pluggable graders (UX, code review, accessibility)
5. **Loop or ship** — fail → findings go back to dev. Pass → done. Escalate → human review.

## Quick Start

```bash
# Initialize a project
mah init

# Run a sprint
mah run "Add a responsive navigation menu"

# Plan a sprint (see what agents + skills would be used)
mah plan "Add a booking form with date picker"

# Run a chained multi-sprint pipeline
mah chain "Research competitor pricing, write a blog post, and publish to the site"

# Dry run (generate contract without executing)
mah run --dry-run "Refactor the auth module"

# Check status
mah status

# List sprints
mah sprints --limit 10

# Manage skills
mah skill list
mah skill show devils-advocate
mah skill import ~/some-project/CLAUDE.md
mah skill create

# Manage projects
mah project list
mah project create

# Start the dashboard
mah dashboard

# View event log
mah events
```

## Architecture

### Sprint Contracts

The contract is the central artifact. It defines "done" before work starts, so every agent knows what to build and how to grade it.

```yaml
Sprint Contract:
  Dev Brief:
    - repo, constraints, definition of done
  QA Brief:
    - tier (smoke/targeted/full), test focus, pass criteria
  Graders:
    - UX (Playwright black-box testing)
    - Code Review (LLM static analysis)
    - Custom (bring your own)
```

### Agent Roster

Each agent has its own workspace and personality (SOUL.md), automatically prepended to every prompt.

| Agent | Name | Role | Model |
|-------|------|------|-------|
| `frontend-dev` | Frankie 🎨 | Frontend development | Sonnet |
| `dev` | Devin ⚙️ | Backend development | Sonnet |
| `qa` | Quinn 🧪 | QA / evaluation | Sonnet |
| `research` | Reese 🔬 | Research tasks | Sonnet |
| `content` | Connie ✍️ | Content writing | Sonnet |

### Priority Trilemma

Projects configure three priorities (1 = highest) that change pipeline behavior:

```yaml
priorities:
  speed: 1      # Fast models, smoke QA, ship quick
  quality: 2    # Thorough QA, multiple graders
  cost: 3       # Haiku where possible, minimal iterations
```

This drives model selection, QA tier defaults, shift-left aggressiveness, and human involvement.

### Pluggable Graders

Multiple graders can evaluate each sprint independently:

- **UX Grader** — Playwright-based testing across device matrix, P0–P3 severity classification
- **Code Review** — LLM-powered static analysis for bugs, style, complexity, security
- **Custom** — Bring your own evaluation logic

Aggregate verdict: any grader fails → sprint fails. All pass → ship.

### Agent Skills

Skills are reusable capability modules that shape how agents operate per sprint. Three types:

- **Capability** (🔧) — technical uplift: `react-forms`, `supabase-rls`, `playwright-mobile`
- **Behavioral** (🎭) — persona/approach modifier: `devils-advocate`
- **Workflow** (🔗) — multi-step process: `research-to-publish`

Skills are YAML files in `.mah/skills/`:

```yaml
name: devils-advocate
type: behavioral
description: "Challenge every assumption. Push back on easy answers."
agent_types: [evaluator, researcher]
persona: |
  You are a devil's advocate. Your job is NOT to agree.
  For every proposal, find 3 reasons it could fail.
gotchas:
  - "Don't be contrarian for its own sake"
tags: [review, strategy, quality]
```

Import skills from Claude Code, OpenClaw, or any URL:

```bash
mah skill import ~/project/CLAUDE.md
mah skill import ~/.openclaw/skills/humanizer/SKILL.md
```

### Output Chaining

Sprints produce named artifacts that downstream sprints consume automatically:

```
Sprint 1: Research → research-findings
Sprint 2: Draft Content (input: research-findings) → blog-draft
Sprint 3: Publish (input: blog-draft)
```

The planner auto-detects chains from natural language:

```bash
mah chain "Research NemoClaw, write a blog post, publish to GTA Labs"
# → 3 chained sprints with human review checkpoint after content draft
```

### Design Tiers (Frontend)

Frankie receives different design briefs based on task signals:

| Tier | Trigger | Behavior |
|------|---------|----------|
| Quick | Default | Fast, functional, no polish |
| Polished | "make it nice", "high quality" | Careful UI work |
| Impeccable | "pixel perfect", "world-class" | Full design system, animations |

## Dashboard

A Next.js web UI for managing projects and sprints.

```bash
cd dashboard && npm run dev
```

Features:
- **Builder** — AI-assisted sprint planning with skill proposals and Mermaid dependency graphs
- **Projects** — per-project config, stats, sprint history
- **Sprints** — list, detail, transcript viewer, grader results
- **Board** — kanban view of sprint statuses
- **Skills** — browse, search, filter agent skills with expandable detail cards
- **Demo** — animated replay of real sprint transcripts (47 pre-recorded sprints)
- **Live** — real-time sprint execution monitoring
- **Settings** — editable project config, agent roster with skill badges, execution defaults

See [`dashboard/README.md`](dashboard/README.md) for details.

## Project Structure

```
mah/
├── src/                    # CLI + pipeline engine
│   ├── cli.ts              # Commander-based CLI
│   ├── pipeline.ts         # Core sprint execution loop
│   ├── planner.ts          # Task analysis + agent/skill selection
│   ├── chain.ts            # Multi-sprint chain execution engine
│   ├── skills.ts           # Skill loader, resolver, importer
│   ├── artifacts.ts        # Sprint artifact extraction + injection
│   ├── contract.ts         # Sprint contract generation
│   ├── parser.ts           # QA report parsing
│   ├── config.ts           # YAML config loader
│   ├── metrics.ts          # Cost/duration tracking
│   ├── events.ts           # JSONL event stream
│   ├── types.ts            # TypeScript type definitions
│   ├── adapters/
│   │   └── openclaw.ts     # Claude Code CLI adapter
│   ├── graders/
│   │   └── code-review.ts  # Code review grader
│   └── lib/
│       └── agentRegistry.ts # Agent name/workspace mapping
├── .mah/
│   ├── skills/             # Agent skill definitions (YAML)
│   ├── imported/           # Skills imported from external sources
│   ├── projects/           # Project configs (JSON)
│   └── sprints/            # Sprint data (contracts, metrics, transcripts)
├── dashboard/              # Next.js web UI
├── sprints/                # Sprint output directory
├── research/               # Research notes
├── content/                # Generated content assets
├── mah.yaml                # Project configuration
├── DESIGN.md               # Product design document
├── PROTOCOL.md             # Multi-agent orchestration protocol
└── ROADMAP.md              # Feature roadmap
```

## Configuration

`mah.yaml` at project root:

```yaml
project:
  name: "My Project"
  repo: ./

priorities:
  speed: 1
  quality: 2
  cost: 3

agents:
  generator:
    type: openclaw
    model: sonnet
    cwd: ./
  evaluator:
    type: openclaw
    model: sonnet
    workspace: ~/.openclaw/workspace-qa
    testUrl: http://localhost:3000

qa:
  defaultTier: targeted
  maxIterations: 3
```

## Execution Engine

Under the hood, MAH shells out to `claude --print --model <model> --permission-mode bypassPermissions` with the enriched prompt on stdin. This means:

- **Any Claude Code-compatible agent works** — swap models, add MCP servers, use custom system prompts
- **Detached execution** — sprints run as background Node.js processes
- **Heartbeat monitoring** — `heartbeat.json` updated every 30s for dashboard polling
- **Watchdog recovery** — stale heartbeat (>10min) or dead PID triggers automatic resume
- **Transcript resume** — crashed sprints re-run from the last completed phase, not from scratch

## Cost Tracking

Every sprint logs token usage and estimated cost per phase:

```
Sprint PASSED in 1 iteration(s)
  Duration: 3m 42s
  Cost:     $0.0312
  Defects:  0 found
```

Model pricing is tracked per-token with configurable rates for Haiku/Sonnet/Opus.

## License

Private — not yet open source.
