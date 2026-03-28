# Sprint Contract: MAH Project Config & CLI Scaffold

**Sprint ID:** 002
**Date:** 2026-03-28
**Depends on:** None (foundation sprint)

---

## Task

Create the MAH CLI tool scaffold and project configuration system. A user should be able to define a project (repo, priorities, agent roles, QA settings) in a YAML config file, and run `mah init` to set up a new project or `mah status` to see the current state.

## Dev Brief

- **Repo:** ~/clawd/projects/mah
- **Stack:** TypeScript, Node.js (compile with tsx for dev, tsup for build)
- **Output:** `src/` directory with CLI entry point

### What to Build

**1. Project config schema (`src/config.ts`)**

```yaml
# mah.yaml — lives in the target project root
project:
  name: "W Construction"
  repo: ~/pro/w
  
priorities:
  speed: 1
  quality: 2
  cost: 3

agents:
  generator:
    type: openclaw          # adapter type
    model: sonnet
    cwd: ~/pro/w            # working directory for dev agent
  evaluator:
    type: openclaw
    model: sonnet
    workspace: ~/.openclaw/workspace-qa  # Quinn's workspace
    test_url: http://localhost:3099

qa:
  default_tier: targeted    # smoke | targeted | full
  max_iterations: 3         # feedback loop limit before human escalation
  
metrics:
  output: .mah/metrics/     # where sprint metrics are stored
  
sprints:
  directory: .mah/sprints/  # where sprint contracts and reports live
```

**2. Config loader (`src/config.ts`)**
- Load and validate `mah.yaml` from project root (or path flag)
- TypeScript types for all config fields
- Sensible defaults (so a minimal config works)
- Validation: priorities must be 1/2/3 (no duplicates), agent types must be supported

**3. CLI scaffold (`src/cli.ts`)**
- Entry point: `mah <command> [options]`
- Commands for MVP:
  - `mah init` — create `mah.yaml` with interactive prompts or defaults
  - `mah status` — show project config, sprint history summary
  - `mah run <task>` — (placeholder for Sprint 003) accept a task description
- Use `commander` or `yargs` for CLI parsing
- Keep it simple — no fancy UI needed

**4. Directory structure**
```
src/
  cli.ts          # entry point
  config.ts       # config schema, loader, validator
  types.ts        # shared TypeScript types
  adapters/
    openclaw.ts   # OpenClaw adapter (placeholder for Sprint 003)
    types.ts      # adapter interface definition
```

**5. Adapter interface (`src/adapters/types.ts`)**
This is the platform-agnostic boundary. Define the interface, implement OpenClaw only.

```typescript
interface AgentAdapter {
  // Spawn an agent with a task, return the result
  execute(task: string, options: ExecuteOptions): Promise<AgentResult>
}

interface ExecuteOptions {
  model?: string
  cwd?: string
  workspace?: string
  label?: string
  timeout?: number
}

interface AgentResult {
  success: boolean
  output: string          // the agent's response (completion report or QA report)
  timing: {
    startMs: number
    endMs: number
    durationMs: number
  }
  tokenUsage?: {
    input: number
    output: number
  }
  cost?: number
}
```

### Constraints
- No external dependencies beyond commander/yargs + yaml parser + tsx
- The adapter interface is the key design decision — it must be simple enough that adding a "codex" or "claude-cowork" adapter later is trivial
- Config should work with minimal fields (just project name + repo) — everything else has defaults

### Definition of Done
- `mah init` creates a valid mah.yaml in the current directory
- `mah status` reads and displays the config
- TypeScript compiles clean
- Adapter interface defined (OpenClaw implementation is a stub — Sprint 003 fills it in)
- Config loads with defaults for missing fields

## QA Brief

- **QA Level:** smoke
- **Test focus:** `mah init` creates valid YAML, `mah status` reads it back, TypeScript compiles, adapter interface types are coherent
- **Pass criteria:** CLI runs without errors, config round-trips correctly
- **Known limitations:** `mah run` is a placeholder — it just prints "not implemented yet"

---

## Artifacts Log

| Time | Event | Notes |
|------|-------|-------|
| | Contract written | |
| | Dev spawned | |
| | Dev complete | |
| | QA | |
