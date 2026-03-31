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

# Dry run (generate contract without executing)
mah run --dry-run "Refactor the auth module"

# Check status
mah status

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
- Project management with priority configuration
- Sprint builder with AI-assisted contract generation
- Live sprint execution with real-time phase tracking
- Sprint history with full transcript viewer
- Agent configuration panel

See [`dashboard/README.md`](dashboard/README.md) for details.

## Project Structure

```
mah/
├── src/                    # CLI + pipeline engine
│   ├── cli.ts              # Commander-based CLI
│   ├── pipeline.ts         # Core sprint execution loop
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
│   ├── design-briefs/
│   │   └── quick.md        # Quick-tier design brief
│   └── lib/
│       └── agentRegistry.ts # Agent name/workspace mapping
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
