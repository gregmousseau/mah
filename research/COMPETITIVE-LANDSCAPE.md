# MAH Competitive Landscape — March 28, 2026

## The Field (active in the last month)

### 1. GitHub Copilot Squad (github.com/bradygaster/squad)
**What:** Repository-native multi-agent orchestration via GitHub Copilot
**Released:** March 19, 2026 (10 days ago)
**Setup:** `npm install -g @bradygaster/squad-cli` → `squad init`
**Architecture:**
- Drops a pre-configured team into your repo: lead, frontend dev, backend dev, tester
- Coordinator agent routes tasks to specialists
- **"Drop-box" pattern** — shared memory via `decisions.md` file in the repo (not vector DB)
- **Context replication** — each specialist gets its own full context window, not a shared split
- **Reviewer protocol** — prevents original author from revising rejected work; a different agent must fix it
- Tester runs tests against dev output; if tests fail, tester rejects and a different agent fixes
- Everything lives in `.squad/` — history, decisions, logs. Git-versioned memory.

**Key differentiator:** "Repository-native" — no external infrastructure, no vector DB, no API orchestration server. Everything is markdown files in your repo.

**Overlap with MAH:** Very high. Same pattern: coordinator → specialist → tester → feedback loop. Their "reviewer protocol" (different agent fixes rejected work) is something we should consider.

### 2. Claude Flow / RuFlow (github.com/ruvnet/claude-flow)
**What:** Multi-agent Claude orchestration framework
**Stars:** Growing fast (featured on HN)
**Architecture:**
- Multi-provider LLM support (Claude, GPT, Gemini, Grok, Mistral, Ollama)
- 170+ MCP tools
- Cost-based routing (claims 75-85% API cost reduction)
- Shared memory system
- Self-learning capabilities

**Key differentiator:** Multi-provider with automatic failover and cost-based routing.

**Overlap with MAH:** The cost-based routing is exactly our Priority Trilemma in action. They're optimizing for cost; we're making it configurable (speed/quality/cost ordering).

### 3. LangChain Open SWE (github.com/langchain-ai/open-swe)
**What:** Open-source framework for building internal coding agents
**Released:** March 17, 2026
**Stars:** 6,200+ in two weeks
**Architecture:**
- Built on LangGraph + "Deep Agents"
- Isolated sandboxes per agent
- ~15 curated tools
- Slack, GitHub, Linear integration
- Inspired by Stripe, Ramp, Coinbase internal agent systems

**Key differentiator:** Enterprise-focused. Designed for teams that already have coding agents but need the orchestration layer. Meets engineers "where they work" (Slack threads, Linear issues, GitHub PRs).

**Overlap with MAH:** Their Slack/GitHub/Linear integration is what our "notification channel" config aims to do. They're more enterprise, we're more developer/creator focused.

### 4. Intent by Augment Code
**What:** Multi-agent coding workspace with "living specs"
**Released:** Public beta, February 2026
**Architecture:**
- **Living specs** — bidirectional documents that update in both directions. When requirements change, specs propagate to agents. When agents complete work, specs update to reflect what was built.
- Coordinator / specialist / verifier role architecture
- Isolated git worktrees per agent
- Built-in quality gates
- Sequential merge strategy

**Key differentiator:** The "living spec" concept. Our sprint contract is a one-directional spec (planner → agents). Their specs are bidirectional — they evolve as work happens. That's powerful.

**Overlap with MAH:** High. Their coordinator/specialist/verifier = our planner/generator/evaluator. Their "living specs" are an evolution of our sprint contracts.

### 5. OpenAI Symphony
**What:** Elixir-based framework for autonomous coding agents
**Released:** Early March 2026
**Architecture:** Elixir-native, focused on coding agent orchestration

### 6. Everything-Claude-Code
**What:** Production agent framework on top of Claude Code
**Stats:** 28 specialized agents, 116 skills, 59 commands, 1,282 tests
**Key differentiator:** Massive scale — dozens of pre-built agents with specific roles

## Anthropic's Guidance (the "Claude article" G referenced)

Two key articles:

### "Building Effective Agents" (Dec 2024, still canonical)
Five composable patterns:
1. **Prompt chaining** — sequential decomposition
2. **Routing** — dispatch to specialized handlers
3. **Parallelization** — concurrent independent subtasks
4. **Orchestrator-workers** — central agent coordinates specialists
5. **Evaluator-optimizer** — iterative refinement through generation + critique loops

**MAH maps to patterns 4+5:** Orchestrator-workers (Moe → Dev/Quinn) + Evaluator-optimizer (Quinn's feedback loop).

We're NOT yet using: Parallelization (could run dev + tests in parallel for speed-priority projects), Routing (could auto-route tasks to specialized dev agents based on the task type).

### "Demystifying Evals for AI Agents" (March 2026)
Key concepts:
- **Evaluation harness** — infrastructure that runs evals end-to-end, provides tools, runs tasks, records steps, grades outputs, aggregates results
- **Agent harness (scaffold)** — the system that enables a model to act as an agent
- **Transcripts/traces** — complete record of a trial (all tool calls, reasoning, intermediate results)
- **Graders** — logic that scores aspects of performance. Multiple graders per task. Types: static analysis, LLM judges, browser agents, human calibration.
- **Trials** — multiple runs per task because model outputs vary
- **Evaluation suites** — collections of tasks for specific capabilities

**What we should incorporate:**
- **Multiple graders per sprint** — Quinn is one grader (UX). Add code review grader, accessibility grader, performance grader
- **Transcripts** — we have events JSONL but not full agent transcripts. Should capture full messages arrays.
- **Multiple trials** — for critical sprints, run the same task 2-3 times and compare
- **Evaluation suites** — define reusable test suites per project type (web app, API, mobile)

## Where MAH is Different

| Feature | Squad | Claude Flow | Open SWE | Intent | MAH |
|---------|-------|-------------|----------|--------|-----|
| Sprint contracts | ❌ | ❌ | ❌ | Living specs (bidirectional) | ✅ One-directional (evolving to bidirectional) |
| Priority trilemma | ❌ | Cost routing only | ❌ | ❌ | ✅ Speed/Quality/Cost configurable |
| QA tiers | ❌ | ❌ | ❌ | Quality gates | ✅ Smoke/Targeted/Full Matrix |
| Visual dashboard | ❌ | ❌ | ❌ | Built-in | ✅ Sprint timeline + metrics |
| Platform agnostic | GitHub only | Claude + multi-LLM | LangChain stack | Standalone | ✅ Adapter interface |
| Metrics/learning | Decision logs | Self-learning | ❌ | Spec updates | ✅ Per-sprint metrics + autoresearch |
| Cost tracking | ❌ | ✅ | ❌ | ❌ | ✅ Per-phase cost estimates |
| Feedback loop | Reviewer rejects | ❌ | ❌ | ❌ | ✅ QA → Dev → QA loop with max iterations |

## What We Should Steal

1. **From Squad:** The "different agent fixes rejected work" rule. Our feedback loop sends work back to the same dev agent. Squad forces a different agent to fix it (fresh perspective, avoids self-review blindness).

2. **From Intent:** Bidirectional specs. Our sprint contracts are write-once. What if the contract updated itself as the dev works? "Task: add dark mode → Dev discovered dual config issue → Contract updated: also resolve duplicate tailwind configs"

3. **From Anthropic Evals:** Multiple graders, transcripts, evaluation suites. Quinn is great but she's one grader. Add a code review grader, a performance grader, an accessibility grader. Make them composable.

4. **From Claude Flow:** Multi-provider failover with cost-based routing. We have the adapter interface — adding model routing based on the Priority Trilemma config would be a natural extension.

5. **From Open SWE:** Slack/GitHub/Linear integration as first-class. Our Telegram notification is one channel. Being where the team already works is how you get adoption.

## What Nobody Has (Our Opportunity)

1. **The Priority Trilemma as a first-class concept.** Everyone optimizes for one thing. Nobody lets you configure the tradeoff per project.

2. **Tiered QA with cost transparency.** Everyone has testing. Nobody lets you choose your testing budget based on what you're changing, with visible cost per tier.

3. **The Inception angle.** Building the tool that builds itself, with metrics proving it works. This is our demo.

4. **The Mixture of Expert Systems branding.** Moe's AI as the orchestration layer above any agent framework. Not another framework — the harness for frameworks.

5. **Sprint contracts as the coordination artifact.** Squad uses markdown decisions. Intent uses living specs. We have sprint contracts. The contract is more structured than decisions, more actionable than specs. It defines "done" before work starts.
