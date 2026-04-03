# MAH Commercial Launch — Consolidated Dev Plan

*Synthesized from 4 research reports — April 2, 2026*

---

## The Pitch (one sentence)

"A $3.77 AI dev team that builds itself — sprint contracts, agent skills, QA grading, and a dashboard anyone can use."

---

## Phase 0: Quick Wins (This Week, <1 day)

### Performance fixes — kill the "10x slower" problem
1. **Swap Opus → Sonnet for planning** — 5 min, saves ~40s per run
2. **Parallelize negotiation** — `Promise.all` instead of sequential, saves ~60-90s
3. **Skip negotiation for low-complexity sprints** — 30 min
4. **Merge plan+negotiate into single call** — 1 sprint, eliminates the extra round-trip entirely

### Content prep
- Draft the "$3.77" blog post outline (the lead hook for everything)
- Record one clean demo sprint running end-to-end (screen capture)

---

## Phase 1: Demo Mode + Content (Week 1-2, ~5 days)

**Goal:** Something people can see and share before anything is hosted.

### Demo replay on `/demo` (3-5 days)
- Pre-recorded sprint transcripts with animated playback in the dashboard
- No backend needed, no auth, no LLM calls
- Shows: sprint builder → agent execution → QA grading → results
- Include the self-building angle: "This dashboard was built by the agents you're watching"
- Linear and Vercel both use static demo data — proven pattern

### Blog post: "I Built a Dev Team for $3.77" (1-2 days)
- Walk through the 22 sprints, 91% pass rate, cost breakdown
- Include screenshots of the dashboard, skill cards, chain visualization
- End with "try the demo" CTA
- This is the #1 content piece. Everything else links back to it.

### Social pre-launch (start immediately, 2 posts/week)
- Build-in-public threads on X: "Day 1: I gave 5 AI agents a sprint contract..."
- Don't launch yet. Warm up the audience for 2-3 weeks.
- Avoid: one-shot launch tweet with no prior context

---

## Phase 2: BYOK + Auth (Week 3-4, ~2 weeks)

**Goal:** Let founding users run real sprints with their own API keys.

### Auth (Supabase Auth, 3-4 days)
- Already in Greg's stack (Rise project uses Supabase)
- Free to 50K MAUs
- Email + GitHub OAuth login

### BYOK API key management (2-3 days)
- Supabase Vault for encrypted key storage
- User enters their Anthropic API key once
- Sprints execute using their key — zero token cost for us

### Tenant isolation (2-3 days)
- Per-user workspace directories
- Supabase RLS on sprint data
- User can only see their own sprints, skills, projects

### Free tier: 3 sprints (no time limit)
- Not "30 minutes" — 3 real sprint executions
- Enough for one complete aha moment (plan → execute → see QA results)
- After 3: BYOK for unlimited, or subscribe for managed keys

---

## Phase 3: Founding Users (Week 4-5)

**Goal:** 10 real users giving real feedback.

### Where to find them
- HN threads about LangGraph, CrewAI, agent frameworks
- r/LocalLLaMA, AI Engineer Discord
- Twitter/X followers who engage with AI dev content
- IndieHackers "Show IH" community

### The offer
- DM 20 people, aim for 10 yeses
- "Founding member" — lifetime deal at $99-199 (one-time)
- Gets: unlimited sprints, input on roadmap, featured case study
- Filters for serious users, not freebie collectors

### Feedback loop
- Weekly 15-min call or async Slack channel
- What breaks? What confuses? What's missing?
- This directly shapes Phase 4

---

## Phase 4: Hosted Execution (Week 6-8)

**Goal:** Users don't need to run anything locally.

### E2B sandboxes for agent execution
- Firecracker microVMs, 400ms cold start
- $0.01-0.025 compute per sprint (negligible vs LLM costs)
- Isolated per-user, secure code execution

### Vercel for dashboard + API
- Already Next.js, deploys in minutes
- 14-min Fluid Compute limit covers 95% of sprints
- API routes handle sprint management, user data

### Stripe for billing
- $29/mo Pro tier: managed API keys, priority execution, 100 sprints/mo
- BYOK tier: $9/mo platform fee, unlimited sprints with own keys
- Credit packs: $5 for 20 sprints (casual users)

---

## Phase 5: Launch (Week 8-10)

### HN "Show HN" post
- Title: "Show HN: I built a dev team for $3.77 — sprint contracts, agent skills, QA grading"
- Link to demo replay + blog post
- Include the self-building narrative

### Product Hunt launch
- Same week as HN (momentum stacks)
- Demo GIF, 3-line description, link to live product

### Twitter/X launch thread
- "I gave 5 AI agents a sprint contract, a QA evaluator, and $3.77. Here's what happened 🧵"
- Thread format: problem → solution → demo GIF → results → try it
- Pin the blog post

---

## Business Model (Open Core)

| Layer | Free | BYOK ($9/mo) | Pro ($29/mo) |
|-------|------|--------------|--------------|
| CLI | ✅ OSS | ✅ | ✅ |
| Dashboard | 3 sprints | ✅ Unlimited | ✅ Unlimited |
| API keys | Own only | Own only | Managed (we provide) |
| Skills | Community | Community + custom | Community + custom + priority |
| Execution | Local only | E2B sandbox | E2B sandbox + priority |
| Support | GitHub issues | Email | Slack + calls |

**OSS the CLI** — builds trust, GitHub traction, developer distribution.
**Paid dashboard + hosted execution** — the value-add that's hard to self-host.

---

## Positioning vs Competition

| Competitor | What they are | What MAH is |
|---|---|---|
| Cursor/Windsurf | Single-agent IDE | Multi-agent orchestrator with QA |
| Devin | Autonomous single agent | Supervised agent team with contracts |
| CrewAI/LangGraph | Dev framework (code it yourself) | Product (dashboard, builder, skills) |
| MetaGPT | Academic role simulation | Production sprint system with grading |
| GitHub Copilot WS | IDE extension | Standalone platform, bring any agent |

**MAH's moat:** Sprint contracts as protocol + QA-in-the-loop + skills system + non-technical dashboard. Nobody else has all four.

---

## Cost Model (at 100 users)

| Item | Monthly Cost |
|---|---|
| Supabase (Pro) | $25 |
| Vercel (Pro) | $20 |
| E2B (execution) | $20-220 (depends on usage) |
| LLM tokens (Pro users only) | Passed to Anthropic API |
| **Total infra** | **$65-265** |
| **Revenue (50 BYOK + 50 Pro)** | **$1,900/mo** |
| **Gross margin** | **~86-96%** |

---

## Timeline Summary

| Phase | What | When | Effort |
|---|---|---|---|
| 0 | Performance fixes + content prep | This week | 1 day |
| 1 | Demo mode + blog post + social warmup | Week 1-2 | 5 days |
| 2 | Auth + BYOK + tenant isolation | Week 3-4 | 2 weeks |
| 3 | Founding users (10 people) | Week 4-5 | Outreach + feedback |
| 4 | Hosted execution + billing | Week 6-8 | 2-3 weeks |
| 5 | Public launch (HN + PH + Twitter) | Week 8-10 | 1 week |

**Total: ~10 weeks from today to public launch.**

---

## Open Questions for G

1. **Moe's AI or MAH?** — Is MAH the new Moe's AI product, or a separate brand? The research suggests keeping "MAH" (it's memorable, unique, and the "Mixture of Agent Harnesses" backronym works).

2. **OSS timing** — Do we open-source the CLI before or after the hosted version? Before = more GitHub stars for launch credibility. After = less competitive advantage given away.

3. **Pricing validation** — $29/mo Pro feels right based on Cursor's model. But should we test $49 first and come down?

4. **Solo dev timeline** — 10 weeks assumes focused effort. With Greg's 3-4 productive hours/day, more realistically 14-16 weeks. Hire a contractor for the E2B integration?

5. **Demo content** — Which sprint replay is most impressive? The self-building arc (MAH building its own dashboard) or a practical use case (blog post pipeline)?

---

*All 4 research reports in `~/clawd/projects/mah/research/`. This plan is the synthesis.*
