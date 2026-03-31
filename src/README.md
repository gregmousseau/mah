# MAH Core — Pipeline Engine

TypeScript source for the MAH CLI and sprint execution pipeline.

## Modules

### `cli.ts`
Commander-based CLI. Commands: `init`, `status`, `run`, `events`.

### `pipeline.ts`
Core execution loop. Handles:
- Sprint contract → dev agent → QA agent feedback loop
- Multiple grader aggregation (UX + code review)
- Heartbeat writing for dashboard polling
- Transcript persistence for crash recovery
- Notification on completion

Two entry points:
- `runSprint()` — full pipeline from task string (CLI usage)
- `runExistingContract()` — execute a pre-built contract (dashboard usage, supports resume)

### `contract.ts`
Sprint contract generation and prompt building:
- `generateContract()` — creates contract from task + config
- `contractToDevPrompt()` — builds the dev agent's prompt
- `contractToQAPrompt()` — builds the QA agent's prompt
- `contractToDevFixPrompt()` — builds fix prompt with QA findings for retry rounds

### `parser.ts`
Parses QA agent markdown output into structured `QAReport` with verdict and defect list.

### `config.ts`
Loads and validates `mah.yaml` project configuration.

### `metrics.ts`
Computes sprint metrics: duration, cost, defect counts, bottleneck analysis.

### `events.ts`
JSONL event logger. Each event has: timestamp, actor, type, phase, summary.

### `types.ts`
All TypeScript interfaces: `SprintContract`, `ProjectConfig`, `GraderResult`, `SprintMetrics`, etc.

### `adapters/openclaw.ts`
Claude Code CLI adapter. Spawns `claude --print` with model/permission flags. Features:
- Agent context injection (SOUL.md prepended)
- Design tier system for frontend agents (quick/polished/impeccable)
- Token estimation and cost tracking
- Mock fallback when claude CLI isn't available
- Timeout handling with SIGTERM→SIGKILL escalation

### `graders/code-review.ts`
Code review grader. Builds prompts for LLM-based static analysis, parses structured results.

### `lib/agentRegistry.ts`
Maps agent IDs to names, workspaces, colors, and icons. Used by both CLI and dashboard.
