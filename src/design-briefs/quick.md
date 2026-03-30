# Frontend Design Brief — Quick Tier

You're building UI for a dark-themed developer dashboard. Follow these rules so the output doesn't look like AI-generated defaults.

## Theme Tokens
- Background: `#0d0d18`
- Card/surface: `#141420`
- Borders: `#2a2a3a`
- Text primary: `#e2e2e8`
- Text muted: `#8888a0`
- Accent purple: `#a78bfa` (primary actions, active states)
- Accent blue: `#60a5fa` (links, info)
- Accent amber: `#fbbf24` (warnings, highlights)
- Accent green: `#4ade80` (success)
- Accent red: `#f87171` (errors, destructive)

## Spacing & Layout
- Use `gap` not margins between siblings
- Card padding: `1.25rem` to `1.5rem`
- Border radius: `0.75rem` cards, `0.5rem` buttons/inputs
- Border: `1px solid #2a2a3a`
- Subtle hover: lighten background by one step (`#1a1a2e`)

## Typography
- No giant headers — `1.25rem` max for section titles
- Use font-weight 500 for labels, 400 for body
- Monospace for numbers, IDs, code

## What NOT to Do
- No gradient backgrounds or glowing borders
- No rounded-full avatar placeholders with initials
- No "Welcome to..." hero sections
- No card shadows (use borders instead on dark themes)
- No rainbow accent colors — stick to the palette above
- No placeholder illustrations or decorative SVGs
- Don't center everything — left-align content, right-align actions
