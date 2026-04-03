# MAH Enhancement Plan: Agent Skills + Output Chaining

*Draft for G's review — April 2, 2026*

---

## Summary

Three connected upgrades to the MAH pipeline:

1. **Agent Skills** — behavioral, capability, and workflow skills that shape how agents operate per sprint
2. **Skill Selection in Planning** — planner proposes agent+skill combos, user approves/modifies
3. **Output Chaining** — auto-detected pipeline where sprint outputs feed downstream sprints

These build on the existing sprint contract protocol. No architectural rewrites needed — they extend what's already there.

---

## 1. Agent Skills

### What Changes

Right now agents are broad roles (Frankie = frontend, Devin = backend, Quinn = QA). Skills make them composable — an agent is a base role + a set of skills activated for a given sprint.

### Three Skill Types

**Capability** — technical uplift the model doesn't have natively:
```yaml
# .mah/skills/react-forms.yaml
name: react-forms
type: capability
description: "React form patterns — validation, controlled inputs, error states, accessibility"
agent_types: [generator]
context_files:
  - references/react-form-patterns.md
  - references/validation-rules.md
gotchas:
  - "Always use controlled components, never uncontrolled refs"
  - "Error messages must be ARIA-linked to their input"
constraints:
  - "All forms must work with keyboard-only navigation"
tags: [frontend, forms, accessibility]
```

**Behavioral** — persona or approach modifier (like the podcast's devil's advocate):
```yaml
# .mah/skills/devils-advocate.yaml
name: devils-advocate
type: behavioral
description: "Challenge every assumption. Push back on easy answers. Find the holes."
agent_types: [evaluator, researcher]
persona: |
  You are a devil's advocate. Your job is NOT to agree.
  For every proposal, find 3 reasons it could fail.
  For every architecture choice, name the tradeoff nobody mentioned.
  Be constructive but relentless. "Yes, but..." is your catchphrase.
gotchas:
  - "Don't be contrarian for its own sake — always tie pushback to real risk"
  - "End with a ranked list: what's actually dangerous vs. nitpicking"
tags: [review, strategy, quality]
```

**Workflow** — multi-step process that chains agents internally:
```yaml
# .mah/skills/research-to-publish.yaml
name: research-to-publish
type: workflow
description: "Full pipeline: research topic → draft content → publish to site"
agent_types: [researcher, generator]
steps:
  - agent: researcher
    action: "Deep research on topic, produce structured findings"
    output: research-findings
  - agent: generator
    action: "Draft blog post from research findings"
    input: research-findings
    output: blog-draft
  - agent: generator
    action: "Create PR or deploy to target site"
    input: blog-draft
tags: [content, publishing, multi-agent]
```

### Where Skills Live

```
.mah/
├── skills/                    # project-level skills
│   ├── react-forms.yaml
│   ├── devils-advocate.yaml
│   ├── supabase-rls.yaml
│   └── playwright-mobile.yaml
├── global-skills/             # shared across projects
│   ├── code-review-security.yaml
│   └── seo-meta-tags.yaml
├── imported/                  # skills pulled from external sources
│   ├── claude-code-best-practices.yaml
│   └── source-manifest.json   # tracks where each was imported from
└── mah.yaml
```

### Skill Import

Skills can come from anywhere:

```bash
# Import from URL (raw YAML, GitHub, blog post, etc.)
mah skill import https://example.com/skills/react-testing.yaml

# Import from Claude Code CLAUDE.md / skills directory
mah skill import ~/some-project/CLAUDE.md          # parses and converts
mah skill import ~/some-project/.claude/skills/     # imports all

# Import from OpenClaw skill
mah skill import ~/.openclaw/skills/humanizer/SKILL.md

# Paste raw content interactively
mah skill create --paste
```

**Format auto-detection:** The importer reads the source and converts to MAH skill YAML regardless of input format. Claude Code CLAUDE.md, OpenClaw SKILL.md, raw markdown instructions, or even a blog post with skill patterns — it extracts the structure and creates a proper skill file.

**Source tracking:** `imported/source-manifest.json` records where each skill came from + when, so you can refresh from source later.

### Agent Registry Update

The existing `agentRegistry` in `src/lib/agentRegistry.ts` gets a `defaultSkills` field:

```yaml
# mah.yaml (updated)
agents:
  frankie:
    role: generator
    specialty: frontend
    model: sonnet
    defaultSkills: [react-forms, tailwind-dark-mode, accessibility-basics]
  devin:
    role: generator
    specialty: backend
    model: sonnet
    defaultSkills: [supabase-rls, api-design, error-handling]
  quinn:
    role: evaluator
    specialty: ux
    model: sonnet
    defaultSkills: [playwright-mobile, visual-regression, devils-advocate]
  reese:
    role: researcher
    specialty: research
    model: haiku
    defaultSkills: [web-research, competitor-analysis]
  connie:
    role: generator
    specialty: content
    model: sonnet
    defaultSkills: [blog-writing, seo-meta-tags]
```

### How Skills Affect Execution

When a sprint runs, the pipeline:

1. Loads the agent's default skills
2. Adds any sprint-specific skill overrides from the contract
3. Reads each skill's `context_files` and injects them into the agent prompt
4. Appends `gotchas`, `constraints`, and `persona` to the agent's brief

Same pattern as OpenClaw's SKILL.md system — context injection before the task prompt. Skill content gets prepended in `contractToDevPrompt()` and `contractToQAPrompt()`.

---

## 2. Skill Selection in Planning

### The Flow

```
User enters task prompt
       │
       ▼
Planner analyzes the task + available skills catalog
       │
       ▼
Planner proposes:
  - Which agent(s) to assign
  - Which skills each agent should use
  - Whether this is 1 multi-agent sprint or N chained sprints
  - Why (brief reasoning)
       │
       ▼
User reviews the proposal:
  ✅ Approve as-is
  ✏️  Modify (add/remove skills, swap agents, restructure chain)
  ❌ Reject
       │
       ▼
Contract(s) generated with approved skill set
```

### What the Proposal Looks Like

```
═══════════════════════════════════════════════════
Task: "Write a blog post about NemoClaw and publish to GTA Labs"
═══════════════════════════════════════════════════

Proposed Plan: 3 chained sprints (research needs depth, content needs review)

Sprint 1: Research NemoClaw
  🔬 Reese (researcher)
     Skills: web-research, competitor-analysis, devils-advocate
     Output: research-findings → feeds Sprint 2

Sprint 2: Draft Blog Post
  ✍️  Connie (content)
     Skills: blog-writing, seo-meta-tags, humanizer
     Input: research-findings from Sprint 1
     Output: blog-draft → feeds Sprint 3
     ⏸ Human review checkpoint (content approval)

Sprint 3: Publish to GTA Labs
  🎨 Frankie (frontend)
     Skills: contentlayer-mdx, gta-labs-site
     Input: blog-draft from Sprint 2

QA: Quinn on Sprint 3 only (smoke — does the post render?)

Estimated cost: $1.50–3.00
Estimated time: 45–90 min

[Approve] [Modify] [Reject]
```

### How the Planner Decides: 1 Sprint vs. Chain

The planner evaluates:
- **Complexity per phase** — research needing 10+ sources = own sprint. Quick lookup = inline.
- **Human review needed?** — Content usually needs approval before publishing. Insert checkpoint = separate sprint.
- **Independent failure** — If research is solid but writing is bad, you want to re-run only the writing sprint.
- **Cost efficiency** — One big sprint with a huge context window costs more than 3 focused ones.

User can always override: "make this one sprint" or "split this into more steps."

### Implementation

The planner step gets a new phase:

1. **Analyze** — LLM reads the task + available skills catalog + agent roster
2. **Propose** — Returns structured JSON: agents, skills, chain structure, reasoning
3. **Confirm** — Pause for user input (configurable: always, cost-threshold, never)

New types:

```typescript
interface AgentAssignment {
  agentId: string          // 'frankie', 'devin', etc.
  role: 'generator' | 'evaluator' | 'researcher'
  skills: string[]         // skill IDs activated for this sprint
  skillOverrides?: string  // free-text additions from user
  model?: string           // override default model
  reasoning: string        // why the planner chose this combo
}

interface SprintPlan {
  sprints: PlannedSprint[]
  chain: ChainLink[]       // dependency edges
  totalCostEstimate: { min: number; max: number }
  totalTimeEstimate: { min: number; max: number }
}

interface PlannedSprint {
  name: string
  agents: AgentAssignment[]
  humanCheckpoint: boolean  // pause for review after this sprint?
}

interface ChainLink {
  from: string    // sprint name
  to: string      // sprint name
  artifact: string // what flows between them
}
```

---

## 3. Output Chaining

### Auto-Detection + Explicit Hints

Chaining is auto-detected by default. The planner reads the task and figures out the dependency chain. Users can also hint at chains in their prompt:

> "Write a blog post about NemoClaw and publish it to GTA Labs"

The planner sees: research → content → deploy. It proposes the structure, user approves.

> "Take the output from sprint 7 and use it for sprint 8"

Explicit reference — planner wires the artifacts directly.

### Named Output Artifacts

Each sprint produces named outputs. Downstream sprints reference them.

```yaml
# Sprint 1 outputs (auto-extracted from completion report)
outputs:
  - id: research-findings
    type: summary
    content: "[structured research findings markdown]"
    description: "NemoClaw competitive landscape, key features, market positioning"

# Sprint 2 contract (auto-generated, referencing Sprint 1)
inputs:
  - from: sprint-001.research-findings
    inject_as: context
```

### Injection Modes

- `context` — full content prepended to the task prompt (default for summaries/snippets)
- `reference` — just the file path mentioned, agent reads it themselves (default for large files)
- `cwd` — agent runs in the same repo, files are already there (implicit for code sprints)

### Sprint Dependency Graph

```
Sprint 1: Research ──────────┐
                              ├──▶ Sprint 3: Publish
Sprint 2: Draft Content ─────┘
     ↑                         
     └── input from Sprint 1   
```

Independent sprints can run in parallel. Dependent sprints wait.

### Types

```typescript
interface SprintArtifact {
  id: string
  type: 'file' | 'snippet' | 'summary'
  path?: string
  content?: string
  description: string
}

interface SprintInput {
  from: string            // "sprint-001.research-findings" format
  injectAs: 'context' | 'reference' | 'cwd'
  resolved?: string       // populated at execution time
}

interface SprintContract {
  // ... existing fields ...
  agentAssignments: AgentAssignment[]
  outputs?: SprintArtifact[]
  inputs?: SprintInput[]
  dependsOn?: string[]
  humanCheckpoint?: boolean
}
```

---

## Implementation Plan

### Phase 1: Skills Foundation (2-3 sprints)

**Sprint A: Skill Schema + Loader + Import**
- Define YAML skill schema (3 types: capability, behavioral, workflow)
- Build `src/skills.ts` — load, validate, list, import skills
- Import converts from Claude Code CLAUDE.md, OpenClaw SKILL.md, raw markdown, URL
- Source manifest tracking
- Seed 5-6 starter skills for existing agents
- `mah skill list`, `mah skill import <source>`, `mah skill create --paste`

**Sprint B: Skill Injection into Pipeline**
- Update `contractToDevPrompt()` and `contractToQAPrompt()` to inject skill context
- Update `mah.yaml` schema for `defaultSkills` per agent
- Update agent registry with skill associations
- Test: run a sprint with skills activated, verify prompt includes skill content

**Sprint C: Skill Selection in Planner**
- New planner phase: analyze task → propose agent+skill combo + chain structure
- Planner decides 1 sprint vs. N chained sprints
- CLI: show proposal, accept/modify/reject flow
- Dashboard: proposal card with edit controls

### Phase 2: Output Chaining (2 sprints)

**Sprint D: Sprint Artifacts + Auto-Detection**
- Add `outputs`, `inputs`, `dependsOn` to `SprintContract` type
- Pipeline extracts artifacts from dev completion reports on sprint finish
- Planner auto-detects chains from task description
- Artifacts stored as `{sprintDir}/artifacts.json`

**Sprint E: Chain Execution Engine**
- Pipeline runs chained sprints in sequence, injecting upstream artifacts
- Human checkpoints: pause between sprints when flagged
- `dependsOn` prevents out-of-order execution
- Parallel execution for independent sprints (if dep graph allows)

### Phase 3: Dashboard Integration (1-2 sprints)

**Sprint F: Dashboard Updates**
- Skill browser: list/search/preview/import skills
- Sprint builder: skill selection UI (checkbox + search)
- Chain visualization: dependency graph on multi-sprint plans
- Sprint detail: show skills used, artifacts produced, chain position

---

## Alignment with Existing Roadmap

| Existing Epic | How This Connects |
|---|---|
| Epic 5: Agent Sub-Specialization | Skills ARE the sub-specialization mechanism. Compose skills onto existing agents instead of creating new ones. |
| Epic 1: Roadmap & Epic Layer | Output chaining + dependency graph is the foundation for multi-sprint epic planning. |
| Epic 2: Agent-Generated Follow-Ups | Agents can suggest new skills from patterns ("I keep doing X, this should be a skill"). |
| Epic 3: Autonomous Sprint Loop | Planner auto-selects skills + chains outputs → loop runs without human skill selection after initial approval. |
| Epic 6: Knowledge Work Beyond Code | Workflow skills (research-to-publish) + behavioral skills (devils-advocate) make non-code work first-class. |

---

## Podcast Alignment (AI Daily Brief — Skills Masterclass)

Key concepts from the episode that validate this approach:

- **Capability vs. Preference skills** — MAH has both plus behavioral. "react-forms" is capability, "our-code-style" is preference, "devils-advocate" is behavioral.
- **Gotcha section is the highest-signal content** — Dedicated `gotchas` field in every skill. This is where the real value accumulates.
- **Skills that build skills (meta-skills)** — After enough sprints, auto-generate skills from repeated patterns: "Dev agents keep getting dark mode wrong → auto-create skill from QA findings."
- **Skill importing from external sources** — `mah skill import` handles Claude Code skills, OpenClaw skills, URLs, raw paste. No vendor lock-in.
- **Re-evaluation triggers** — Skills should be reviewed when models upgrade. Capability skills may become obsolete; behavioral and preference skills get more valuable.
- **The litmus test** — "Do I use the output directly or edit it?" If a skill's output keeps getting edited, improve the skill. This is the autoresearch loop.

---

## Decisions Made

1. **Chaining is auto-detected** — Planner figures out the chain from the task description. User can also hint explicitly. Planner proposes structure, user approves.
2. **Skills are behavioral + capability + workflow** — Not just technical. Devil's advocate, research-to-publish, code review persona are all first-class.
3. **Import from anywhere** — URL, Claude Code skills, OpenClaw SKILL.md, paste. Auto-converts to MAH format.
4. **1 sprint vs. many = planner decides** — Based on complexity, review needs, independent failure risk, and cost. User can override.

## Open Questions (Lower Priority)

1. **Skill granularity** — Lean broad, split later? Or start fine-grained?
2. **Parallel execution** — Run independent sprints in parallel when dep graph allows? (nice-to-have, adds complexity)
3. **Skill sharing** — Global registry across MAH projects? (Start project-level, promote later)
4. **Skill versioning** — Track versions? Re-evaluate when models upgrade?

---

## Estimated Effort

- **Phase 1 (Skills):** 3 sprints, ~$2-4, 1-2 hours
- **Phase 2 (Chaining):** 2 sprints, ~$1-3, 1-2 hours
- **Phase 3 (Dashboard):** 2 sprints, ~$1-3, 1-2 hours
- **Total:** ~7 sprints, ~$5-10, half a day of G's review time

---

*Ready for G's review. Mark up, add, cut — then we build.*
