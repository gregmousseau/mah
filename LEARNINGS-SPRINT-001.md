# Sprint 001 Learnings — Dark Mode Switcher

*2026-03-28 | W Construction | 2 iterations to PASS*

## Timeline & Metrics

| Phase | Duration | Token Cost (est) | Notes |
|-------|----------|-----------------|-------|
| Contract writing (Moe) | 5 min | ~$0.02 | Manual, part of main session |
| Dev R1 | 14 min | ~$0.25 | 13 files changed, all pages updated |
| Quinn R1 | 20 min | ~$0.35 | 100 Playwright tests, 5 devices, ❌ FAIL |
| Dev R2 | 5 min | ~$0.15 | Root cause fix + all P1/P2s |
| Quinn R2 | 10 min | ~$0.30 | Full re-verification, ✅ PASS |
| **Total** | **~52 min** | **~$1.07** | **2 iterations** |

Human wait time: 0 (fully async, G was notified at each stage)

## What the Harness Caught

### The Root Cause (most interesting finding)
**Duplicate Tailwind config files** — `tailwind.config.js` and `tailwind.config.ts` both existed. Tailwind resolves `.js` over `.ts`. The dev agent correctly added `darkMode: 'class'` to the `.ts` file in R1, but Tailwind was loading the `.js` file (which had no `darkMode` setting). Result: all `dark:` utility classes compiled under `@media (prefers-color-scheme: dark)` instead of `.dark` class selectors. The toggle had zero effect on Tailwind classes.

**Why this matters for MAH design:** This is a systemic config-level bug. The code was correct. The config was the problem. No amount of code review catches this — you have to actually render the page and check computed styles.

### Individual P1 Defects (4 total)
1. Services dropdown — white background in dark mode
2. Contact form inputs — white background, typed text invisible (~1.3:1 contrast)
3. Logo swap — `dark:hidden`/`dark:block` not applying (consequence of root cause)
4. Service card headings — near-invisible text on dark backgrounds

### P2 Defects (3 total)
5. Contact form labels — low contrast
6. Contact info card — light background in dark mode
7. Mobile theme switcher — cut off on iPhone SE below social icons

## Shift-Left Analysis

**Could the dev agent have caught these in R1?**

| Defect | Could Dev Catch? | Cost to Shift Left | Verdict |
|--------|-----------------|-------------------|---------|
| Root cause (dual config) | Maybe — if instructed to verify compiled CSS output | High — requires running build + inspecting output, not just writing code | Keep in QA |
| Dropdown bg | Yes — obvious if you think about it | Low — add "check all containers for dark: bg" to dev checklist | Shift left |
| Form inputs | Yes — same pattern | Low — same checklist | Shift left |
| Logo swap | No — consequence of root cause | N/A | QA territory |
| Card headings | Yes — missed dark: override | Low — checklist | Shift left |
| Form labels | Yes — contrast check | Low | Shift left |
| Mobile positioning | Maybe — layout awareness | Medium — requires viewport thinking | Either |

**Conclusion:** 4 of 7 defects were "missed dark: class on an element" — a pattern. A dev checklist item ("verify every hardcoded color has a dark: counterpart") would catch these. The root cause (dual config) and the logo swap (consequence) are genuine QA territory — you need to render and verify.

**Shift-left recommendation for future dark mode sprints:**
Add to dev contract: "After implementation, grep for any remaining hardcoded `bg-white`, `bg-gray-*`, `text-gray-*` without corresponding `dark:` variants in modified files. Verify the Tailwind config that's actually being loaded (check for multiple config files)."

This would likely reduce R1 defects from 7 → 2, saving one full QA cycle (~$0.35 + 10 min).

## Design Implications for MAH Product

### 1. Priority Trilemma: Speed / Quality / Cost
G's insight: every project has different priorities. The orchestrator needs a project-level config:

```
priorities:
  speed: 1      # 1 = highest priority
  quality: 2
  cost: 3
```

**How this changes behavior:**
- **Speed #1:** Dev does a self-review pass before handoff (shift left). Use faster models. Run smoke QA, escalate only on failure. Parallelize where possible.
- **Quality #1:** Full matrix QA. Multiple evaluator types (UX + code review + accessibility). No shortcuts on iterations.
- **Cost #1:** Human stays in the loop for judgment calls. Use haiku for everything possible. Smoke QA only, targeted on failure. Dev does more upfront work.

### 2. Metrics Pipeline
Every sprint should automatically capture:
- **Time per phase** (dev, QA, wait, human)
- **Token/cost per phase**
- **Defect count by severity**
- **Defect origin** (code, config, design, requirements)
- **Shift-left opportunities** (could this have been caught earlier?)
- **Iteration count** (how many loops before PASS)

Over time, these metrics feed the autoresearch loop: "Dev agents miss dark: classes 60% of the time → add to standard checklist" or "Quinn spends 40% of time on screenshots that never show issues → reduce screenshot scope."

### 3. The Mollick Insight: Decision Latency as Bottleneck
"The primary bottleneck in enterprises has shifted from technical capacity to decision latency and the judgment layer."

In Sprint 001, the human had zero wait time and zero decisions to make — the harness ran autonomously. The decisions were:
- What QA level? (Contract defined it)
- Pass or fail? (Quinn decided based on rubric)
- Send back to dev or escalate? (Protocol defined it)

The only decision G made was "build dark mode" — the judgment layer was embedded in the sprint contract and Quinn's grading rubric. This is the harness reducing decision latency to near-zero for routine work.

**Where human judgment still matters:**
- Setting project priorities (speed/quality/cost)
- Approving the sprint contract scope
- Overriding QA verdicts ("ship it with known P2s")
- Strategic decisions ("is dark mode even worth building?")

### 4. Autoresearch for Continuous Improvement
After N sprints, the system has enough data to identify patterns:
- "Dev agents consistently miss X" → update dev contract template
- "Quinn flags Y as P1 but it's always accepted as P2" → adjust rubric
- "Targeted QA catches 95% of what full matrix catches on CSS-only changes" → adjust tier recommendations
- "This dev model produces fewer defects on React tasks" → model routing

This is Karpathy's autoresearch applied to the pipeline itself. Budget-dependent: run the analysis nightly, weekly, or on-demand.

## Open Questions Answered

From PROTOCOL.md:
- ✅ **Should dev see Quinn's rubric?** No for now. R1 dev didn't game anything — it just missed things. The checklist approach (shift-left) is better than showing the full rubric.
- ✅ **Quinn black-box or source access?** Black-box for UX. The root cause would have been found faster with source access, but Quinn's strength is "does this look right to a user?" Keep her UX-focused. Add a separate code review agent for source-level checks.
- 🔲 **Sprint contracts spanning multiple repos?** Not tested yet.
- 🔲 **Content capture automation?** Not tested yet — Sprint 001 was manual logging.
