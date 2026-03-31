# MAH Dashboard

Next.js web UI for managing multi-agent sprint pipelines.

## Getting Started

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Features

### Projects
- Create and manage projects with priority configuration (speed/quality/cost)
- Per-project agent and QA settings

### Sprint Builder
- AI-assisted sprint contract generation
- Negotiate and refine contracts before execution
- Configure graders (UX, code review) per sprint
- Assign specific agents (Frankie, Devin, Quinn)

### Sprint Execution
- One-click sprint execution from the UI
- Real-time phase tracking (dev → QA → verdict)
- Live heartbeat monitoring
- Cancel running sprints

### Sprint History
- Browse all sprints with status, cost, and duration
- Full transcript viewer (prompts sent, responses received)
- Metrics breakdown per phase

### Agent Config
- View registered agents with names, workspaces, and colors
- Agent registry at `src/lib/agents.ts`

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/projects` | GET/POST | List/create projects |
| `/api/projects/[id]` | GET/PATCH/DELETE | Project CRUD |
| `/api/sprints` | GET | List sprints |
| `/api/sprints/execute` | POST | Execute a sprint contract |
| `/api/sprints/run` | POST | Quick-run a task |
| `/api/sprints/cancel` | POST | Cancel running sprint |
| `/api/sprints/queue` | GET | View sprint queue |
| `/api/sprints/[id]` | GET | Sprint details |
| `/api/sprints/[id]/status` | GET | Sprint status (heartbeat) |
| `/api/sprints/[id]/transcript` | GET | Full transcript |
| `/api/agents` | GET | List registered agents |
| `/api/config` | GET | Project configuration |
| `/api/stats` | GET | Aggregate statistics |
| `/api/events` | GET | Event stream |
| `/api/builder/plan` | POST | Generate sprint contract |
| `/api/builder/negotiate` | POST | Refine contract via AI |
| `/api/builder/generate` | POST | Generate from template |
| `/api/builder/save` | POST | Save draft sprint |
| `/api/builder/drafts` | GET | List draft sprints |

## Tech Stack
- Next.js 15 (App Router)
- Tailwind CSS
- TypeScript
- Playwright (QA test execution)
