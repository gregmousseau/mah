# Sprint Contract: W Construction Dark Mode Switcher

**Sprint ID:** 001
**Date:** 2026-03-28
**Status:** IN PROGRESS

---

## Task

Add a light/dark/system theme switcher to the W Construction website, similar to the one on gtalabs.com. The switcher should allow users to toggle between light mode, dark mode, and system preference. Dark mode needs proper styling across all pages and components.

## Dev Brief

- **Repo:** ~/pro/w
- **Stack:** Next.js (App Router), Tailwind CSS, TypeScript
- **Live URL:** https://w-rho-three.vercel.app
- **Pages:** Home, About, Services, Projects, Testimonials, Values, Contact (7 total)
- **Components:** Header, Footer, HeroSlider, ImageGrid, Logo, LogoFull, TestimonialSlider

### Current State
- CSS custom properties in globals.css: `--background`, `--foreground`, `--accent` (#660033)
- Basic `prefers-color-scheme: dark` media query exists but barely functional (swaps to nearly same colors)
- Header hardcoded to `#D0CECF` background
- No Tailwind `darkMode` config
- No `dark:` classes used anywhere
- Zero dark mode support in components

### Constraints
- Use `next-themes` for theme management (standard approach for Next.js App Router)
- Tailwind `darkMode: 'class'` strategy
- Switcher UI: small toggle in the header (sun/moon/monitor icons) — clean, not flashy
- Dark mode palette should work with the existing brand (accent #660033 is deep maroon)
- Don't break any existing functionality — the nav fixes from this week must stay intact
- Logo component may need a dark variant or filter adjustment

### Definition of Done
- Three-way toggle (light/dark/system) visible in header on all breakpoints
- All 7 pages render correctly in both light and dark modes
- No text-on-same-color-background readability issues
- Smooth transition between modes (no flash of wrong theme on load)
- System mode respects OS preference
- Theme persists across page navigation and reloads

## QA Brief

- **QA Level:** targeted
- **Test URL:** http://localhost:3000 (dev will confirm port)
- **Test focus:**
  - Toggle works on mobile and desktop
  - All 7 pages readable in light AND dark mode
  - No contrast/readability issues (text on backgrounds)
  - Theme persists on reload
  - System mode follows OS preference
  - Header, footer, cards, forms all styled appropriately
  - Logo visible in both modes
- **Devices:** iPhone SE, iPhone 15, iPad Mini, Desktop 1280 (Chromium + WebKit)
- **Pass criteria:**
  - Zero P0/P1 issues
  - Toggle accessible and functional on all tested devices
  - No page has unreadable text in either mode
- **Known limitations:**
  - Hero slider images are photos — they don't need dark mode treatment
  - Contact form styling may be basic — functional is fine

---

## Artifacts Log

| Time | Event | Notes |
|------|-------|-------|
| 11:50 | Contract written | Sprint 001 started |
| 11:52 | Dev agent spawned | Sonnet, label: dev-001-dark-mode |
| 12:05 | Dev R1 complete | 13 files changed, 14 min runtime. Recommended targeted QA. |
| 12:06 | Quinn spawned | Targeted tier, 5 devices, 7 pages × 2 modes |
| 12:26 | QA report: ❌ FAIL | 4× P1: dropdown bg, form inputs, logo swap, card headings |
| 12:27 | Dev R2 spawned | Fixing all 4 P1s + 3 P2s from Quinn's report |
| 12:31 | Dev R2 complete | Root cause: duplicate tailwind.config.js missing darkMode:'class'. 5 min runtime. |
| 12:32 | Quinn R2 spawned | Re-test targeted tier, same 5 devices |
| 12:42 | QA R2: ✅ PASS | All P1s resolved, zero new issues. WebKit gap noted (low risk). |
