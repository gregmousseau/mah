# MAH Go-to-Market Strategy
**Multi-Agent Harness — April 2026**

Researched and compiled for Greg / Moe. Not theory. Tactics.

---

## Context Snapshot

- TypeScript CLI + Next.js dashboard for orchestrating multi-agent dev sprints
- Named agents (Frankie, Devin, Quinn, Reese, Connie) with specialized roles
- Sprint contracts define "done" before work starts — this is the differentiator
- Agent Skills system: behavioral, capability, workflow
- Output chaining: sprint N feeds sprint N+1 automatically
- **22 sprints run through itself. 91% pass rate. $3.77 total cost.**
- Solo dev (Greg) + AI assistant (Moe). Built in public, dogfoods itself.

The $3.77 number is the hook. Lead with it everywhere.

---

## 1. Free Tier / Playground Strategy

### What Other Dev Tools Do

**Cursor:** Free tier with 2,000 completions/month, then $20/month Pro. No BYOK — they want you on their managed LLM layer. Credit-based since mid-2025. Free tier converts ~12-15% to paid within 30 days (industry estimate for strong dev tools with network effects).

**Windsurf (Codeium):** Free tier with 2,000 completions/month, $15/month credit-based Pro. Relies heavily on frictionless free entry to build habit, then upsells.

**Aider:** Fully open source, BYOK only — you pay just API costs (~$30-60/mo to your LLM provider). Zero hosted cost for them. Community grows via GitHub stars, Reddit, HN. Monetization = none yet (Paul Gauthier is indie; donations + sponsorships).

**CrewAI:** OSS framework (unlimited self-hosted) + paid managed cloud from $99/month Basic up to $120k/year Ultra. The OSS framework built their community; the paid cloud is for enterprise. Classic open core.

### What Converts Best (Research-Backed)

The pattern across dev tools:
1. **Free tier with real value** converts better than time-limited trials. Developers hate countdowns.
2. **BYOK** is the easiest early path — no fraud risk, no cost exposure, developers trust it because they control their keys.
3. **Mock mode** is good for demos and docs but doesn't convert to paid — people who only use mocks never see real value.
4. **Credit systems** (X free runs, then pay) work IF the free credits are enough to complete one meaningful task end-to-end.

### Recommendation for MAH

**Phase 1 (Now — first 10 users):** BYOK + mock mode combo.
- Mock mode: pre-recorded sprint results for the demo/docs flow. Shows the UX without burning tokens.
- BYOK: user brings their Anthropic/OpenAI key. MAH platform is free. They pay only API costs.
- This means zero financial risk for you, zero barrier for them.
- Implement a `--mock` CLI flag that uses canned agent responses. Use this for your own demo videos.

**Phase 2 (10-100 users):** Add a credit system.
- 3 free sprint runs on house credits when they sign up (no BYOK required).
- After that: BYOK or $15/month managed tier.
- 3 runs is enough to complete one real feature. That's the "aha moment."
- Don't give 30 minutes of vague compute time — give 3 named sprints. Tangible units.

**Phase 3 (100+ users):** Hosted SaaS tier.
- Full managed (no BYOK required), usage-based pricing, team collaboration features.
- This is when dashboard value kicks in.

**What NOT to do:**
- Don't gate the CLI behind signup. Let people `npm install mah-cli` and try mock mode cold.
- Don't make credit limits opaque. Show remaining credits in the CLI output and dashboard.
- Don't offer "30 days free" — devs forget to cancel, resent the charge, churn angry.

---

## 2. Founding User Strategy

### How Others Did It

**Cursor:** Early adoption was completely word-of-mouth within YC/OpenAI circles. First users were people Anysphere founders knew personally — zero public launch initially. Key insight: they gave high-trust early users the ability to break things and give feedback, not polished demos.

**Replit:** Amjad Masad spent two years writing technical posts on HN about engineering challenges. Didn't ask for sign-ups — just built a reputation as someone who understood the problem deeply. Paul Graham noticed organically. First users came from HN comments and replies.

**Devin (Cognition):** Launched with a 12-minute YouTube demo that went viral before the product was available. Waitlist of 100k+ before anyone could try it. But that required a genuinely jaw-dropping demo clip. The lesson: if the demo is good enough, let the waitlist build demand.

### Founding Member Programs That Worked

**IndieHackers examples:** Products that offered "founding member" status with:
- Lifetime deal at $X (typically 30-50% of eventual pricing)
- Listed by name on the website / changelog
- Direct Slack/Discord access to the founder
- Input on the roadmap (not a vote, a conversation)

The incentive that consistently works: **lifetime deal + direct access**. "Free forever" attracts freeloader risk. Lifetime deal at $99-199 filters for people who have skin in the game and gives you real signal.

### Where to Find 10 Founding Users

**Tier 1 (highest signal, lowest volume):**
- DM 10 devs on Twitter/X who have complained about AI agent coordination, multi-agent bugs, or "LLM orchestration is a mess" in the last 30 days. Search: `from:user lang:en "multi-agent" OR "agent orchestration"` 
- HN comments on LangGraph, CrewAI, AutoGen threads — find people expressing frustration
- r/LocalLLaMA, r/AIAssistants — post a specific "I built X to solve Y problem, looking for 5 people to break it"

**Tier 2 (good signal, medium volume):**
- IndieHackers "What are you building?" threads — find people building AI-assisted coding workflows
- Discord servers: AI Engineer, LangChain, Cursor (yes, their Discord), Together AI
- Buildspace alumni community (high density of people building AI tools)

**Tier 3 (volume, lower signal):**
- Product Hunt "upcoming" page — list early, collect emails
- Twitter/X #buildinpublic hashtag + @replies to people asking about multi-agent tools

### The Ask

Don't say "I'm looking for beta testers." Say:

> "I'm looking for 5 founding engineers who want to run a real sprint through MAH before I open it up. You get lifetime access, you get to break it, and you'll be in the changelog as founding members. DM me."

Limiting to 5 makes it real. Naming the perk makes it concrete.

**Specific tactics:**
1. Post one tweet with the $3.77 angle (see Section 3)
2. Follow up with personal DMs to 10 devs who engage or fit the profile
3. Never post a general "sign up for beta" link without a personal follow-up message
4. Close the founding cohort publicly once you hit 10 — "Founding cohort is full" creates FOMO

---

## 3. Social Media Launch Strategy

### What Dev Tool Launches Got Traction on Twitter

**Formats that work, ranked:**

1. **Demo video (30-90 seconds, no voiceover, just screen + captions)** — highest engagement by far. Cursor's early Twitter growth was clips of Composer doing multi-file edits. No script. Just show it working.

2. **Story thread ("I did X, here's what I learned")** — works when the story has a real hook. "I ran my AI agent team through itself 22 times" is a hook. "Introducing MAH" is not.

3. **Single tweet with a shocking stat** — if the stat is weird and specific. "$3.77 to build a feature with 3 AI agents" is specific and weird. Vague stats die fast.

4. **Blog post launch** — low Twitter engagement directly, but good for Google/SEO downstream. Write it, post a summary thread, pin the blog link.

**What doesn't work:**
- "I'm excited to announce..." — instant scroll-past
- One-shot launch with no prior engagement (the "2nd look" problem: algorithm shows post once, if no engagement, buried forever)
- Threads longer than 7 tweets — engagement drops off at tweet 4
- Screenshot of a README

### Build-in-Public Framing for MAH

The angle that will land: **"I built an AI dev team that builds itself."**

That's the hook. It's counterintuitive. It creates a question: "What does that mean?"

Supporting angles:
- "My AI agents have names, personalities, and specializations. Here's how each one works."
- "Sprint contracts: how I define 'done' before an AI agent starts work."
- "91% pass rate. 22 sprints. $3.77. Here's the full breakdown."
- "Frankie (frontend), Devin (backend), Quinn (QA): meet the team."

These are 5 different tweets. Post one every 3-4 days for 3 weeks before the "launch." By the time you post "MAH is open to founding members," people already know what it is.

### Cadence

**Pre-launch (3 weeks out):**
- Tue/Thu rhythm: 2 tweets per week
- Each tweet is one angle from the list above
- Reply to every comment within 2 hours (algorithm rewards this)
- Engage with 5-10 relevant devs per day (the "reply guy" method — reply genuinely to people talking about multi-agent tools)

**Launch week:**
- Monday: demo video (no narration, captions only, screen recording of a sprint running end-to-end)
- Wednesday: "$3.77" tweet with the stat breakdown
- Friday: "Founding cohort open — 5 spots" tweet with DM CTA

**Post-launch:**
- Weekly "sprint report" posts showing what MAH built that week (dogfooding in public)
- Changelog tweets: "MAH v0.X shipped. New this week: ..."

### What NOT to Do

- **Don't do a one-shot launch tweet.** If it doesn't hit in the first 30 minutes, the algorithm kills it. Pre-warm the audience.
- **Don't post at night or weekends.** Dev Twitter is alive 9am-3pm ET on weekdays. Tuesday-Thursday best.
- **Don't ask for RTs.** It signals desperation and gets ignored.
- **Don't post your Product Hunt launch on Twitter without prior context.** PH + Twitter cross-posts die unless you have 5k+ engaged followers.
- **Don't over-explain.** The hook goes in tweet 1. Details go in the thread. Curiosity > completeness.

### LinkedIn Strategy (Different Playbook)

LinkedIn devs are slightly different audience — more senior, more enterprise-minded, less indie.

Angles that work on LinkedIn:
- "How a solo dev outpaced a 5-person team using AI agents" (outcome-focused)
- "The problem with multi-agent AI: nobody defines done first" (thought leadership)
- "$3.77 for a production feature: a cost breakdown" (data-driven)

LinkedIn posts work better as standalone essays (no threads). 150-200 words, 1 strong point, 1 image or screenshot. Post same day/time as Twitter but write it differently.

---

## 4. SaaS vs Open Source vs Hybrid

### What Competitors Are Doing

| Tool | Model | Monetization |
|------|-------|-------------|
| Cursor | Closed SaaS | $20/mo Pro, enterprise contracts |
| Windsurf | Closed SaaS | $15/mo credit-based |
| Aider | Full OSS (BYOK) | Nothing yet; considering cloud tier |
| CrewAI | Open core | OSS framework + $99/mo-$120k/yr managed cloud |
| LangGraph | Open core | OSS + LangSmith SaaS (observability/deployment) |

### Which Model Fits MAH

**Recommendation: Open Core (OSS CLI + paid dashboard/cloud)**

Here's why:

**OSS the CLI.** The TypeScript CLI is the engine. Open sourcing it:
- Creates GitHub traction (stars, forks, contributors)
- Lets devs self-host and prove value before paying
- Positions MAH as infrastructure, not just a product
- Builds trust: "I can see what the agents are actually doing"

**Keep the dashboard paid.** The Next.js dashboard (sprint visualization, output chaining UI, team management, RBAC) is the commercial layer. This is where you charge.

**Pricing structure that makes sense:**
- Free: CLI (OSS) + BYOK + 3 demo sprints
- Pro ($20-29/month): Hosted sprint execution, dashboard, sprint history, output chaining UI
- Team ($X/seat/month): Multi-user, shared sprint library, custom skills, priority support
- Enterprise: SOC2, SSO, on-prem agent deployment

**Why not full SaaS?** Solo dev can't compete with Cursor on UX polish and brand alone. OSS gives you distribution that paid marketing can't buy.

**Why not full OSS?** Dashboard and hosted execution are real value. Don't give it away. CrewAI's open core model works — OSS framework + paid managed cloud is the playbook.

**Source-available is a middle path:** License the CLI as BSL (Business Source License) — free for personal/non-commercial use, requires paid license for commercial production use. Hashicorp did this with Terraform. Controversial, but prevents someone from forking and competing directly.

---

## 5. Content Marketing Angles

### Ranked by Likely Impact

**#1: "$3.77 to build a production feature — full breakdown"**
- Write this first. It's your best piece.
- Include: sprint log, agent handoffs, which model ran each step, token costs per agent, total wall time
- Publish on personal blog + cross-post to dev.to + HN Show HN submission
- This is the piece that gets linked. It's specific, falsifiable, repeatable.
- Title variants: "How much does it actually cost to run 3 AI agents through a dev sprint?" / "I used AI agents to build a feature. Here's the receipt."

**#2: Demo video: "Watch 3 AI agents build a feature from spec to PR"**
- 90-second screen recording, no voiceover, captions only
- Show: sprint contract → Frankie on frontend → Devin on backend → Quinn QA review → PR diff
- This is the Twitter/LinkedIn anchor clip. Reuse it everywhere.
- Keep it under 90 seconds or you lose 60% of viewers on Twitter.

**#3: "22 sprints, 91% pass rate: how we built MAH using MAH"**
- Blog post / changelog narrative
- This is the self-building angle. It's genuinely unusual. No other tool has done this transparently.
- Include: which sprints failed, what the QA agent caught, how you fixed the sprint contract
- Great for HN "Show HN" — "I built a multi-agent orchestration tool by running it through itself 22 times"

**#4: "Sprint contracts: why you should define done before AI touches your code"**
- Thought leadership piece
- Angle: The problem isn't the LLM. It's that nobody specifies acceptance criteria before the agent runs.
- This targets devs burned by vague AI agent outputs
- Works well on LinkedIn (senior devs, team leads)

**#5: "Agent Skills Masterclass — real implementations, not theory"**
- Video/blog series (3-5 parts)
- Part 1: Behavioral skills (devil's advocate agent, how it works technically)
- Part 2: Capability skills (react-forms agent, real code)
- Part 3: Workflow skills (research-to-publish pipeline walkthrough)
- SEO anchor content — people searching "how to implement AI agent skills" will find this
- Slower burn but durable traffic

### Content Distribution Plan

| Content | Primary Channel | Secondary |
|---------|----------------|-----------|
| $3.77 breakdown | Blog + HN Show HN | Twitter thread, LinkedIn |
| Demo video | Twitter | LinkedIn, YouTube |
| 22 sprints case study | Blog + HN | Twitter |
| Sprint contracts post | LinkedIn | Blog |
| Agent Skills series | YouTube + Blog | Twitter (clips) |

### Cadence

Don't try to publish all of this at once. One piece per week:
- Week 1: Demo video (Twitter)
- Week 2: "$3.77" breakdown (blog + HN)
- Week 3: Founding member announcement (Twitter + email)
- Week 4: "22 sprints" case study (blog + HN)
- Week 5: Sprint contracts thought leadership (LinkedIn)
- Week 6+: Agent Skills series (YouTube/blog, weekly)

---

## Execution Priority (Next 30 Days)

1. **Ship mock mode** (`--mock` CLI flag with pre-recorded sprint outputs). Needed before any public demo.
2. **Record 90-second demo video** showing a real sprint running end-to-end.
3. **Write and publish the "$3.77" post** — this is the best conversion piece you have.
4. **Post demo video to Twitter** with founding member CTA. Limit 5 spots.
5. **DM 10 devs personally** who are in the target audience. Close the founding cohort.
6. **Submit to Show HN** ("I built a multi-agent CLI that orchestrated its own development for $3.77").
7. **Open source the CLI** on GitHub with a clear README and the demo video embedded.

---

## The One-Line Pitch (for Twitter bios, taglines, cold DMs)

> "Sprint contracts for AI agents. Define done first, then let Frankie, Devin, and Quinn ship it."

Or, the hook version:
> "I built a dev team for $3.77. It built itself."

---

*Report compiled April 2, 2026. Research basis: Cursor/Replit/CrewAI/Aider/Windsurf public pricing and launch histories, HN meta-discussions on Show HN strategy, Twitter build-in-public research, open core SaaS model analysis.*
