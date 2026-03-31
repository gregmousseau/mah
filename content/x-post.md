# X Post — MAH / Harness Engineering

## Option A: The Hook (thread starter)

As a top 100 contributor to OpenClaw, I still wouldn't recommend it to 95% of my friends.

Peter invented a jet engine. But you should probably wait until someone builds the plane and trains the pilots before trusting it with your life.

That's what has me focused on harness engineering.

The harness is the plane. The agents are the pilots. You can tell them where to go — but don't take the controls unless you know what you're doing.

Last weekend I built a multi-agent harness where 5 AI agents build software, QA each other, and fix their own bugs.

19 sprints. 18 passed. Total cost: 97 cents.

🧵👇

## Option A: Thread continues

2/ Here's how it works:

You describe what you want. An Opus-class planner breaks it into sprints and picks the right agent for each one.

Frontend work → Frankie (with design standards)
Backend → Devin
QA → Quinn
Research → Reese

No human touches the code until the final review.

3/ The best part? The system built itself.

Sprint 016: "Add a cost chart to the dashboard"
Sprint 018: "Build an agent registry API"
Sprint 019: "Build the agent config UI"

All planned, executed, and QA'd by the harness. I just reviewed the contracts and hit run.

4/ The agents negotiate before writing any code.

Dev proposes a definition of done. QA tightens the pass criteria. If QA fails the build, findings go back to dev automatically.

3 rounds max. If it can't pass after 3 tries, it escalates to a human.

5/ If a sprint crashes mid-run (broken pipe, timeout, OOM), it reads the transcript and resumes from where it left off.

No wasted work. No wasted money.

One sprint saved 50% of its cost by resuming instead of restarting.

6/ This works with Claude Code, Codex, OpenClaw, NemoClaw, or your own agents.

The harness doesn't care what's inside the agents. It handles the orchestration: planning, routing, execution, QA, retry.

The hard part isn't AI writing code. It's getting agents to work together reliably.

7/ We're setting this up for teams through @gaborlabs [GTA Labs handle]:

→ $1,500 for our proven 5-agent setup, ready in a week
→ $4,000 for a custom harness built for your codebase

No recurring fees. You own everything.

DMs open if you want to see a demo.

---

## Option B: Shorter standalone (if thread feels too long)

As a top 100 contributor to OpenClaw, I still wouldn't recommend it to 95% of my friends.

Peter invented a jet engine. But you should wait until someone builds the plane and trains the pilots.

So I built the plane.

5 AI agents. 19 sprints. 18 passed QA. Under a dollar.

The harness handles planning, agent routing, QA, auto-retry, and crash recovery. The agents just do their jobs.

The system built parts of its own dashboard. I just reviewed the contracts and hit run.

This is what harness engineering looks like.

[attach: 60s screen recording or 4-panel screenshot]

---

*Notes for G:*
- Option A is better for engagement (threads get more reach on X)
- Option B if you want to test the water first
- The "jet engine / plane / pilot" metaphor works for both LinkedIn and X
- Consider posting X first (faster audience), LinkedIn 2-3 hours later
- Screenshots/video are essential — text-only posts about AI get ignored
- Don't @ OpenClaw's account unless you want that conversation (you probably do)
