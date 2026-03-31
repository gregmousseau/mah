# Case Study: Multi-Agent Harness (MAH)

## Project Overview

| | |
|---|---|
| **Client** | Internal (GTA Labs) |
| **Duration** | 1 weekend (proof of concept) |
| **Stack** | TypeScript, Next.js, Claude Code agents |
| **Result** | 19 automated dev sprints, 94% pass rate, <$1 total cost |

## Challenge

Building software with AI agents works well for isolated tasks. But real projects require coordination: frontend changes that depend on backend APIs, QA that catches what the developer missed, recovery when things crash mid-execution.

Single-agent workflows can't handle this. You end up babysitting each step, copy-pasting output between tools, and manually restarting when something breaks.

## Solution

We built the Multi-Agent Harness (MAH) — a pipeline that orchestrates specialized AI agents through a structured development cycle:

**Planning:** An Opus-class planner decomposes requests into focused sprints and assigns the right agent to each task.

**Specialization:** Five agents with distinct roles — frontend dev (with design standards), backend dev, QA evaluator, research analyst, and content writer. Each has a "soul file" defining their expertise and standards.

**Quality Gates:** Every sprint goes through dev → QA → fix cycles. The QA agent grades against negotiated pass criteria. Failed sprints get findings routed back to the dev agent automatically.

**Self-Healing:** Crashed sprints resume from transcript. The executor auto-retries on transient failures (broken pipes, timeouts). A watchdog detects stuck processes and recovers the queue.

**Live Dashboard:** Real-time monitoring of sprint execution, cost tracking, kanban board, sprint builder, and agent configuration.

## Results

- **19 sprints** executed over one weekend
- **18 passed** QA (94% success rate)
- **$0.03 average cost** per sprint (~$0.50 total)
- **4 self-built sprints** — the system extended its own dashboard
- **Zero human intervention** during execution (human reviews contracts before launch)
- **Transcript resume** saved ~50% cost on one re-run by skipping completed phases

## Key Takeaway

The value isn't in the AI models — it's in the orchestration layer. Specialized agents with clear contracts, automated QA, and self-healing infrastructure turn unreliable AI code generation into a repeatable development process.

## Service Availability

MAH is available as a service through GTA Labs:

- **MAH Starter ($1,500):** Pre-configured 5-agent setup, dashboard, and pipeline
- **MAH Custom ($4,000):** Custom agents, skills, and evaluation criteria for your workflow
- Compatible with Claude Code, OpenClaw, NemoClaw, Codex, or custom agent platforms

[Contact GTA Labs →](https://gtalabs.com)
