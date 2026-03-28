# Sprint 001: Dark Mode Switcher

**Status:** PASSED (2 iterations)  
**Duration:** ~52 minutes  
**Cost:** ~$1.07  
**Human wait time:** 0

## What Happened

Round 1: Dev agent implemented dark mode across 13 files. QA agent (Quinn) ran 100 Playwright tests across 5 device viewports and found 7 defects (4 P1, 3 P2).

**Root cause discovery:** Duplicate Tailwind config files. `tailwind.config.js` and `tailwind.config.ts` both existed. Tailwind resolves `.js` over `.ts`, so the dev agent's correct `darkMode: 'class'` setting in `.ts` was being ignored.

Round 2: Dev agent fixed the root cause (removed duplicate config) and all individual defects. Quinn re-ran full verification. All tests passed. No new defects.

## Key Takeaway

The most interesting finding was systemic: the code was correct but the build config was wrong. No amount of code review catches this. You need to render the page and verify computed styles. This validates the black-box QA approach.

## Shift-Left Opportunity

4 of 7 defects were "missed dark: class on an element." A dev checklist item ("verify every hardcoded color has a dark: counterpart") would reduce R1 defects from 7 to ~2, saving one QA cycle (~$0.35 + 10 min).
