# MAH Hosting Architecture — Technical Report
**Multi-Agent Harness — Hosted Product Viability Analysis**
*April 2026 | Compiled by Moe (research subagent)*

---

## Executive Summary

MAH is a viable candidate for a hosted product. The core architecture — TypeScript CLI orchestrating Claude Code agents with JSON file state — is solid for single-user use but needs targeted changes before hosting. The good news: you don't need to rewrite everything. The path is additive.

**Recommended stack:** Supabase (auth + DB + Vault) + E2B (agent sandbox execution) + Next.js on Vercel (dashboard) + a lightweight Node worker service (Fly.io or Railway) to bridge CLI → API.

**Effort estimate (solo dev):** 6-10 weeks to a working "try it" hosted MVP. 3-4 months to a stable paid tier.

---

## 1. Multi-Tenancy Path

### Current Problem
Everything lives in `.mah/` flat files tied to the local filesystem. One user, one machine. No concept of identity.

### Minimum Viable Multi-Tenancy

**Option A: Per-tenant workspace directories (simplest)**
- Each user gets an isolated directory: `/workspaces/{user-id}/`
- Sprint JSON, skills YAML, and config all live there
- No schema migration, no ORM, minimal code change
- Downside: doesn't scale past ~100 users on a single machine; no cross-user analytics

**Option B: Supabase backend (recommended)**
- Replace JSON file reads/writes with Supabase queries
- Sprint data → `sprints` table with `user_id` foreign key
- Skills → `skills` table (or keep as YAML but store in object storage)
- Config → `projects` table
- Dashboard polls Supabase instead of filesystem
- Row-Level Security (RLS) handles tenant isolation automatically — Supabase's native auth tokens get passed through, data is scoped per user at the DB level

**What changes in code:**
- `SprintStore` class: swap `fs.readFile` calls for `supabase.from('sprints').select()` 
- Dashboard: replace file polling with Supabase realtime subscriptions (no more polling at all)
- Sprint execution: write results back via Supabase client instead of JSON files

**Effort:** 1-2 weeks to extract the file I/O layer and swap backends.

### Auth: What to Choose

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **Clerk** | Best DX, pre-built React components, fast | $25/mo after 10k MAUs, overkill for early | $25/mo |
| **Supabase Auth** | Free to 50k MAUs, already in stack if using Supabase, simple | Less polished UI kit | $0-25/mo |
| **NextAuth.js** | Free, full control, OSS | You own the session management, more bugs surface | $0 |

**Recommendation: Supabase Auth.**

If you're already using Supabase for the DB (which you should be), the auth is free and co-located. GitHub OAuth is one config line. You already use Supabase for the Rise project — same pattern. Save Clerk for when you have 10k+ users and need org/team features.

### API Key Management for BYOK

Users bring their own Anthropic API key. That key needs to:
1. Be stored encrypted at rest
2. Be passed into the agent execution environment
3. Never appear in logs or dashboard

**Solution: Supabase Vault**

Supabase Vault is a Postgres extension using `pgsodium` for encryption at rest. The key stored on disk is always encrypted — it only decrypts at query time via a view, never stored in plaintext in backups or WAL.

```sql
-- Store user's API key
SELECT vault.create_secret(
  'sk-ant-...',
  'anthropic_key_user_123',
  'User API key for sprint execution'
);

-- Retrieve for execution (decrypted only in-process)
SELECT decrypted_secret FROM vault.decrypted_secrets
WHERE name = 'anthropic_key_user_123';
```

**Key principle:** The API key travels from Vault → execution environment via environment variable injection. It never touches the dashboard, the browser, or any logs.

---

## 2. Hosted Execution

### The Core Problem

Claude Code CLI (`claude --print --permission-mode bypassPermissions`) runs as a local process with filesystem access. In a hosted setting, you need:
- Isolation between users (user A's agent can't touch user B's files)
- Ephemeral environments (clean state per sprint)
- A way to invoke the claude CLI inside that environment

### Option Comparison

| Platform | Cold Start | Isolation | Claude CLI support | Cost/sprint | Verdict |
|----------|-----------|-----------|-------------------|-------------|---------|
| **E2B** | ~400ms | Firecracker microVM | Yes (custom template) | ~$0.001-0.01 compute | Best fit |
| **Modal** | 1-2s | Container | Yes | ~$0.001-0.01 compute | Good, Python-first |
| **Fly.io Machines** | 2-5s | VM | Yes | ~$0.001 compute | Cheap, more setup |
| **Railway** | 5-15s | Container | Yes | ~$0.002+ | Simplest DevEx |
| **Firecracker (self)** | <1s | microVM | Yes | $0 (your infra) | Too much ops |

**Recommendation: E2B for sprint execution.**

E2B is Firecracker under the hood, purpose-built for running untrusted code for AI agents. Key advantages:
- You create a custom template: install Node.js, the `mah` CLI, and the `claude` CLI in the image
- Each sprint starts a fresh sandbox from that template in ~400ms
- Sandbox has network access (to hit Anthropic API) but is fully isolated from other sandboxes
- You can use the E2B TypeScript SDK to spawn the sandbox, inject env vars, run the sprint, stream output back

**Architecture for sprint execution:**

```
User triggers sprint via dashboard
  → API route calls E2B SDK
  → E2B spawns Firecracker sandbox with MAH template
  → Sandbox env gets ANTHROPIC_API_KEY injected (from Vault)
  → `mah run` executes inside sandbox
  → Output streamed back via E2B SDK
  → Results written to Supabase
  → Sandbox destroyed
```

**E2B cost for compute (not LLM):**
- 2 vCPU sandbox: $0.000028/second
- A 5-minute sprint: 300s × $0.000028 = **$0.0084 compute cost**
- A 15-minute sprint: 900s × $0.000028 = **$0.025 compute cost**
- Separate from LLM token costs (which are 10-100x this)

**BYOK removes your LLM cost exposure entirely.** User's key pays their Anthropic bill. You only pay E2B compute. At $0.01-0.025/sprint for compute, your infrastructure cost per sprint is negligible.

### Can Vercel Functions Run Sprints?

Not directly. Vercel's max function duration with Fluid Compute is 14 minutes on paid plans (recently bumped to 300s default). That might work for short sprints, but:
- You can't run the `claude` CLI inside a Vercel function (Node.js environment, not a full container)
- Agent spawning needs a real process environment

**Better pattern:** Vercel hosts the Next.js dashboard + API routes that enqueue jobs. Execution happens in E2B sandboxes. Results stream back via SSE or Supabase realtime.

---

## 3. Token Economics

### Cost Model

Based on MAH's real numbers: 22 sprints, 91% pass rate, $3.77 total = **$0.17 average per sprint** using Sonnet.

| Model | Cost/sprint (est.) | Notes |
|-------|-------------------|-------|
| Haiku | $0.03-0.10 | Fast iteration tasks, research agent |
| Sonnet | $0.10-0.50 | Default workhorse |
| Opus | $0.50-1.50 | Deep reasoning, complex specs |
| Mixed (MAH default) | $0.15-0.30 | Haiku for research, Sonnet for generation |

### Free Trial: 30-Minute Window

30 minutes of trial credit with a house-paid key:

| Model | Sprint duration | Sprints in 30 min |
|-------|----------------|-------------------|
| Haiku only | ~2-5 min | 6-15 sprints |
| Sonnet | ~5-10 min | 3-6 sprints |
| Mixed | ~5-10 min | 3-6 sprints |

**Recommendation: Don't give 30-minute trials.** It's abstract and hard to reason about. Instead:

> "3 free sprints when you sign up. No credit card."

3 sprints is tangible. It's enough to complete one real feature cycle (spec → implement → QA). That's the aha moment. After that, BYOK or subscribe.

### Cost-per-Sprint vs Subscription Modeling

**Scenario: 100 paying users at $20/month**

- Revenue: $2,000/month
- E2B compute (10 sprints/user avg): 100 × 10 × $0.02 = $20/month
- Supabase Pro: $25/month
- Vercel Pro: $20/month
- Infrastructure total: ~$65/month
- **Gross margin: ~97%**

That's assuming BYOK. If you absorb LLM costs at $0.20/sprint avg:
- LLM cost: 100 × 10 × $0.20 = $200/month
- New margin: ~87%

Still very healthy. The math works.

### Credit-Based vs Subscription

| Model | Pros | Cons | Best for |
|-------|------|------|----------|
| **Credits** | Matches usage, easy to gift free credits, no churn anxiety | Mental overhead for users, billing surprises | Power users, bursty usage |
| **Subscription** | Predictable revenue, simpler UX, builds habit | Must define "what's included" | Regular usage, teams |
| **Hybrid** | Best of both | More complex billing logic | Mid-stage product |

**Recommendation for MAH's stage: Subscription with overage.**

- $20/month includes 50 sprints (Sonnet)
- Over 50: $0.30/sprint (or prompt BYOK)
- BYOK tier: $10/month platform fee, no sprint limit

Most dev tools that scale (Cursor, Windsurf, Vercel) use subscription. Credits work well for experiments and free tiers but create friction at renewal. Sprint units are concrete enough to be understandable in a subscription ("50 sprints/month" makes more sense than "100k tokens").

---

## 4. Security Considerations

### Code Execution Isolation

This is the hardest problem. MAH agents currently run with `--permission-mode bypassPermissions`. In a hosted context, that means an agent can:
- Read arbitrary files in the sandbox
- Write or delete files
- Make network requests to any host
- Potentially escape if the container isn't hardened

**Mitigations:**

1. **E2B/Firecracker boundary** is the primary defense. Each user's sprint runs in a separate microVM. Kernel isolation. No shared filesystem. This is sufficient for most threat models.

2. **Network policy:** Restrict egress from the sandbox. Allowlist: Anthropic API endpoint, GitHub (if code pushing is a feature), npm registry. Deny everything else. E2B supports custom network policies.

3. **No user file uploads to shared storage.** Sprint artifacts (code diffs, outputs) go to Supabase, not a shared disk.

4. **Sandbox lifetime:** Kill the sandbox after sprint completion or after a max timeout (20 min). No persistent sandboxes between sprints unless explicitly needed.

5. **Resource limits:** Set CPU/RAM caps per sandbox to prevent denial-of-service scenarios where a runaway agent consumes infinite compute.

### API Key Storage for BYOK

Threat model: a data breach that exposes the database.

**Defense:**
- Supabase Vault (pgsodium) encrypts keys at rest
- Keys are never logged in any output stream
- API routes that read keys use service-role access (never exposed to browser)
- Keys are injected into E2B sandbox via environment variable, then the sandbox is destroyed
- Principle of least privilege: only the execution service can read keys; the dashboard can only tell you "key is set / not set"

**Additional hardening:**
- Rate-limit key writes per user (can't create 1000 keys/second)
- Validate key format before storing (Anthropic keys start with `sk-ant-`)
- Alert on unusual spending patterns (optional: Anthropic usage API polling)

### Rate Limiting and Abuse Prevention

- **Signup abuse:** Require email verification. GitHub OAuth is even better — GitHub's account age is a natural spam filter.
- **Sprint rate limiting:** Max N concurrent sprints per user (start at 1). Max M sprints per hour per user (start at 5).
- **Free tier abuse:** The $0 BYOK tier costs you nothing per sprint but could abuse E2B quota. Cap: 10 sandboxes/day for free users.
- **API abuse:** All API routes behind rate limiting middleware (e.g., `@upstash/ratelimit` + Redis, or Supabase's built-in rate limits).

### Sandboxing Philosophy (NemoClaw/OpenShell comparison)

OpenClaw-style sandboxing uses environment isolation + permission gating. For MAH:
- **Sandbox = E2B microVM** (kernel isolation, not just container namespaces)
- **Permission gate = BYOK only** (user controls what their key can do; MAH just orchestrates)
- **Audit trail = Supabase sprint logs** (every command sent to the agent is logged)

The model: MAH is the orchestrator, not the executor. The agent runs in a box it can't escape, using credentials that only work for Anthropic's API.

---

## 5. MVP Hosted Version

### What Can Stay As-Is

- The `mah` CLI core logic (sprint parsing, agent dispatch, output formatting)
- The Next.js dashboard structure (just swap file reads for Supabase queries)
- The YAML skill definitions (can live in DB or S3)
- The sprint contract format (it's just data)
- The Claude Code invocation pattern (runs inside E2B sandbox)

### What Needs Rewriting / Adding

| Component | Current | Needs to become |
|-----------|---------|----------------|
| Sprint state | `.mah/sprints/*.json` | Supabase `sprints` table |
| Skills | `.mah/skills/*.yaml` | Supabase `skills` table or S3 |
| Config | `mah.yaml` | Per-user DB row |
| Auth | None | Supabase Auth (GitHub OAuth) |
| Agent execution | Local process | E2B sandbox |
| Dashboard state | Filesystem polling | Supabase realtime |
| API key storage | Local env | Supabase Vault |
| Multi-user routing | None | Supabase RLS |

### Could Vercel + Supabase Work?

**Yes, for everything except execution.** Vercel handles:
- Next.js dashboard (SSR + API routes)
- Auth callbacks (Supabase Auth redirects)
- Sprint result display
- API routes for sprint management (CRUD)

E2B handles agent execution. The Vercel API route that triggers a sprint becomes:

```typescript
// POST /api/sprints/[id]/run
export async function POST(req) {
  const { userId } = await getUser(req)
  const apiKey = await getVaultKey(userId) // Supabase Vault lookup
  
  const sandbox = await Sandbox.create('mah-runner') // E2B
  await sandbox.process.start({
    cmd: `mah run --sprint ${sprintId}`,
    env: { ANTHROPIC_API_KEY: apiKey }
  })
  
  // Stream output back, write results to Supabase
}
```

Vercel functions have a 14-minute max (Fluid Compute, paid plan). For 95% of sprints that's fine. For longer sprints, you'd offload to a background job via Supabase Edge Functions or a Fly.io worker.

### Rough Timeline (Solo Dev)

| Phase | Work | Time |
|-------|------|------|
| **Week 1-2** | Supabase schema, auth (GitHub OAuth), move sprint storage to DB | 2 weeks |
| **Week 3** | E2B custom template (install Node + mah CLI + claude CLI), wire sprint execution | 1 week |
| **Week 4** | BYOK: API key input UI, Supabase Vault storage, key injection into E2B | 1 week |
| **Week 5** | Dashboard: realtime sprint updates (replace polling), basic tenant isolation | 1 week |
| **Week 6** | Demo mode / replay feature, basic rate limiting | 1 week |
| **Week 7-8** | Testing, polish, error handling, hardening | 2 weeks |
| **Buffer** | Unexpected issues | 1-2 weeks |

**Total: 8-10 weeks to a shippable "try it" MVP.**

Add 4-6 more weeks for: payment (Stripe), subscription management, admin dashboard, proper error monitoring (Sentry), and the first real public launch.

---

## 6. Replay / Demo Mode

### The Problem

Watching a real sprint run costs $0.15-0.50 and takes 5-15 minutes. That's a terrible first-time user experience. People need to understand what MAH does in under 2 minutes.

### How Others Do It

- **Vercel:** The dashboard has a pre-loaded demo project with real-looking data. You can click around, see deployments, read logs. None of it is live. Static HTML that looks like the real app.
- **Linear:** No public demo mode. They rely on video and screenshots. Their UX is visual enough that a 60-second video converts.
- **Notion:** "Duplicate to your workspace" pattern — you get a real, live copy of a template. Not a demo, a real sandbox.
- **GitHub Codespaces:** "Try in browser" gives you a live VS Code with real compute. No signup. Works because the compute cost is low and conversion is high.

### Recommended Approach for MAH

**Layer 1: Static replay (build first)**

Pre-record 2-3 real sprint runs as JSON transcript files. The dashboard plays them back at 2x speed with animated "typing" effects. This is pure frontend — no backend, no API, no auth.

```typescript
// Demo sprint transcript
[
  { t: 0, agent: "frankie", type: "thinking", text: "Analyzing sprint contract..." },
  { t: 2.3, agent: "frankie", type: "code", text: "// Creating LoginForm component...\n..." },
  { t: 45, agent: "quinn", type: "qa", text: "Running Playwright tests..." },
  { t: 67, agent: "quinn", type: "result", passed: 3, failed: 0 }
]
```

Play this on the landing page or a `/demo` route. No login, no cost, instant wow. This is what converts a visitor to a signup.

**Layer 2: Sandboxed live demo (next)**

Give unauthenticated users a shared demo workspace. They can:
- Browse pre-defined sprint templates
- Click "Run Demo" which plays back a replay (not real execution)
- See the kanban board, agent logs, output files populated with real-looking data

**What NOT to do:** Don't run real agents for unauthenticated users. Free compute for unknown users = abuse vector. The static replay is enough to show value.

**Layer 3: Authenticated live trial (after MVP)**

After signup (GitHub OAuth, email verified), give 3 free sprints with BYOK. This is where the real aha moment happens — they see their own code get written by Frankie.

### Technical Implementation: Sprint Transcript Format

Minimal additions to current MAH code:

1. Add a `--record` flag to the CLI that writes a timestamped transcript to `.mah/replays/`
2. Add a `/demo` route to the dashboard that loads a replay file
3. Build a simple playback engine in React (stream events with setTimeout, simulate typing)

The replay files are just JSON arrays of events with timestamps. The current sprint log output is already close to this format — it's a matter of capturing it.

**Effort: 3-5 days** for basic replay mode. Worth doing before any other hosted work because it's self-contained and immediately useful for demos.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     HOSTED MAH                          │
│                                                         │
│  ┌─────────────┐    ┌──────────────┐                   │
│  │  Next.js    │    │  Supabase    │                   │
│  │  Dashboard  │◄──►│  - Auth      │                   │
│  │  (Vercel)   │    │  - sprints   │                   │
│  │             │    │  - skills    │                   │
│  │  /demo      │    │  - Vault     │                   │
│  │  /dashboard │    │    (API keys)│                   │
│  │  /sprints   │    └──────┬───────┘                   │
│  └──────┬──────┘           │                           │
│         │                  │                           │
│         │ trigger sprint   │ read/write results        │
│         ▼                  ▼                           │
│  ┌─────────────┐    ┌──────────────┐                   │
│  │  Vercel     │    │   E2B        │                   │
│  │  API Route  │───►│  Sandbox     │                   │
│  │  /run       │    │  (Firecracker│                   │
│  └─────────────┘    │   microVM)   │                   │
│                     │              │                   │
│                     │  mah run ... │                   │
│                     │  claude ...  │◄── ANTHROPIC_KEY  │
│                     │  (isolated)  │    (from Vault)   │
│                     └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

---

## Recommended Sequencing

### Phase 0 (Now, 3-5 days): Demo Mode
- Record 2 real sprints as transcript files
- Build `/demo` route with replay playback
- Use on landing page and in social posts
- No backend changes needed

### Phase 1 (Weeks 1-4): BYOK + Auth
- Supabase setup: schema, RLS, GitHub OAuth
- Migrate sprint storage from JSON files to DB
- BYOK: key input UI + Supabase Vault storage
- Vercel deployment of dashboard with auth

### Phase 2 (Weeks 5-7): Hosted Execution
- E2B custom template: build and publish `mah-runner` image
- Wire up sprint execution via E2B SDK
- Stream output back to dashboard via Supabase realtime
- Rate limiting, sandbox timeouts

### Phase 3 (Weeks 8-12): Monetization
- Stripe integration (subscription + credits)
- Free tier: 3 sprints, then BYOK required
- Pro tier: $20/month, hosted execution, no BYOK required
- Usage dashboard: sprint count, costs, remaining credits

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Claude CLI changes break E2B template | Medium | High | Pin claude CLI version; test on updates |
| Anthropic rate limits hit for BYOK users | Low | Medium | Expose rate limit errors clearly in dashboard |
| E2B outage blocks all sprint execution | Low | High | Fallback: queue jobs, retry; add status page |
| Supabase free tier limits hit early | Medium | Low | $25/mo Pro is cheap insurance; upgrade early |
| Sprint cost variance blows free trial budget | Medium | Medium | Cap house-paid credits per user strictly |
| User uploads malicious code via sprint spec | Low | High | Sandbox isolation is primary defense; no user code on host |

---

## Final Recommendation

**Build in this order:**

1. **Demo replay mode** (Phase 0) — immediate marketing value, no backend risk, 3-5 days
2. **BYOK + Supabase auth** (Phase 1) — enables real users, no LLM cost exposure, 4 weeks
3. **E2B execution** (Phase 2) — enables hosted sprints, 3 weeks
4. **Stripe + pricing** (Phase 3) — enables revenue, 4 weeks

Skip: self-managed Firecracker, custom auth, credit-based-only pricing, and any multi-region infra. Those are V2 problems.

**Total cost to run at 100 users:** ~$65-265/month infrastructure (depending on whether you absorb LLM costs). At $20/month/user that's $2,000 MRR with 97% gross margin on infra. The math is genuinely good.

---

*Report compiled April 2, 2026. Research basis: E2B/Modal/Fly.io pricing pages, Supabase Vault docs, Vercel Fluid Compute limits, auth provider comparisons (Clerk/Supabase Auth/NextAuth.js), MAH GTM research, MAH mah.yaml config.*
