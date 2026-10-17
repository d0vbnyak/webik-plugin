---
name: webik:design-deslop
description: Strip the signatures that make a UI look AI-generated — flat hierarchy, no focal point, monotone layout, timid palettes, generic tokens, defaulted type, missing states. The design counterpart to a code-deslop pass.
---

# Remove design slop

**Language: always write to the user in Russian** — findings, tables, verdicts, questions and summaries. Keep code, file names, CSS/Tailwind identifiers and commands as they are.

Every generated interface carries tells — the specific signatures that make someone glance at it and think *an AI made this*. This pass finds those tells and removes them. Fast, surgical, behavior-preserving. Not a full design review (that's `/webik:design-review`, which judges craft against an approval bar and can block). Here you have one job: **make it stop looking generated.**

The tell is rarely a single wrong value. It's the *sum* — every number the same size, every card identical, one accent color smeared everywhere, structure built from borders instead of space. Slop is compositional. So you can't catch it by reading CSS line by line; you have to **look at the rendered thing first**, then go fix the lines.

**Context7 gate.** This pass edits site code. Before the first edit, load the `webik` skill and run the check in `SKILL.md` → «Context7 — обязательное условие для кода». If Context7 is unavailable, stop and tell the user how to connect it — do not edit any code. Verify any Astro/Tailwind API you touch against Context7 docs.

## How to run it

Two passes, in this order. The first catches the slop that does the most damage and is invisible in a diff. The second catches the concrete line-level tells.

### Pass 1 — Squint (the rendered output)

Look at the actual UI. If a render tool (`show_widget`/`visualize`) or a screenshot is available, use it. Blur your eyes, or step back. Generated UI fails the squint test in specific ways — this is where the real slop lives, ranked by how much it gives the game away:

1. **No focal point.** Nothing leads. Every element competes equally, so the eye has nowhere to land. → Find the one thing the user came for and make it dominate (size, weight, contrast, or isolation); demote the rest.
2. **Flat hierarchy.** You can't tell primary from secondary from metadata without reading the words — everything is one size, one weight, one color. → Build tiers from weight + a four-step color ramp, not size alone.
3. **Monotone layout.** Same card size, same gap, same density edge to edge — the unmistakable grid-of-identical-boxes. → Vary density by zone, group by proximity, differentiate cards by their actual content and role.
4. **Timid color.** A palette spread evenly across five low-commitment tints, or one accent applied to everything until nothing is emphasized. → One intentional accent at ~10%, the rest structural neutrals.
5. **Borders doing the work of space.** Structure drawn with lines everywhere instead of whitespace and tonal shift. → Replace dividers with spacing and surface steps; keep borders for where separation genuinely needs a line.

If the screen survives the squint — one thing leads, tiers are legible, it breathes unevenly, color is restrained — the worst slop is already gone. Then scan.

### Pass 2 — Scan (the diff)

Now read what the branch changed and fix the concrete tells. Stay in the diff; these are the line-level signatures, grouped so you can move fast:

**Website template tells** (full list with replacements: `references/anti-ai.md` in the `webik` skill — apply all of it; also run `bash "<skill dir>/scripts/check-ai-tells.sh" src` and fix every hit) — decorative gradient/glass hero → the client's real photo or a brand-driven composition; three identical icon cards as the answer to every section → vary the composition per content; generic "why choose us" with abstract virtues → concrete facts from the old site; invented numbers, reviews, partner logos → remove or replace with a visible `[НУЖНО ОТ КЛИЕНТА: …]` placeholder; every section on the same background with the same padding → section rhythm from the spacing scale; two equally loud CTAs → one primary per screen; middot/bullet/pipe separators between words in copy ("Ремонт · Отделка · Дизайн") → a comma-separated phrase, a real list, or a CSS-drawn divider; staccato period fragments ("Быстро. Надёжно. Честно.") → one full sentence. Rules: `references/seo.md` → «Пунктуация и разделители».

**Tokens & color** — generic names (`--gray-700`, `--surface-2`, inline hex) → semantic names mapped to primitives; competing accents → one; decorative gradients/tints → remove or make them mean status/action; different hues per surface → one hue, shift lightness.

**Typography** — system/Inter default where a direction exists → the chosen face; a monospace face (JetBrains Mono, Space Mono, IBM Plex Mono, Fira Code…) on headings, body, nav or buttons of a site that isn't about code → a face that fits the client's world, per `references/design-craft.md` → «Выбор шрифта»; size-only hierarchy → add weight + color; slack tracking on large headings → tighten; updating numbers proportional → `tabular-nums`.

**Surfaces & depth** — harsh 1px solid borders → low-opacity rgba or a shadow; dramatic elevation jumps → a few percent lightness per step; sidebar a different color → same canvas + subtle border; mixed depth strategies → pick one; same radius on nested parent/child → concentric (`outer = inner + padding`).

**States & motion** — missing interaction states (hover/focus/active/disabled) → add them, the fastest tell of unfinished UI; `transition: all` → exact properties; `ease-in`/default easing → custom ease-out under 300ms; no press feedback → `scale(0.97)` on `:active`; animation on a keyboard-repeated action → remove; hit areas under 44×44px (40 min) → extend. *(A wholly-absent empty/loading/error state is build work, not a surgical cleanup — note it and leave it to `/webik:design-review`.)*

**Spacing & structure** — off-grid values (17px, 23px on a 4/8 base) → snap to grid; unmotivated asymmetric padding → symmetrical; structural hacks (negative margins undoing parent padding, escape-hatch `calc()`, absolute positioning to dodge flow) → the clean layout that doesn't need them.

**Reinvention — hand-rolled instead of reused** (a high-value tell). A `<div onClick>` acting as a button/link → real `<button>`/`<a>`. A from-scratch dropdown/select/modal/tooltip with no keyboard nav, focus management, or ARIA → a headless accessible primitive (Radix/React Aria/etc.), or the project's existing component. A one-off Tailwind/CSS string duplicating a component the project already ships → use `<Button variant>` / the existing component. The same long className sprayed across many elements → extract a component or variant. Hardcoded literals (`bg-white`, `border-gray-200`, `#fff`) where the system has tokens → semantic tokens (`bg-card`, `border-border`). An inaccessible hand-rolled control is both slop *and* a real bug — flag it even if it looks fine.

## What is NOT slop (don't touch it)

The point is to remove the generic, not to flatten every choice into a default. A cleanup that strips intent is worse than the slop. Leave these alone — and if you're unsure whether something is a tell or a decision, treat it as a decision:

- **A bold or unusual choice that's clearly motivated** — a saturated palette, a dramatic type scale, an asymmetric layout. Distinctive is the *goal*; only flag it if it's incoherent with the stated intent, not merely uncommon.
- **An intentional deviation that has a reason** — a one-off radius, a deliberately heavier border on a focal card, asymmetric padding where content demands it.
- **Anything outside the diff.** Pre-existing slop in untouched code is out of scope unless the user asks. Stay in the lines that moved.
- **Anything a linter or formatter owns** — quote style, import order, trailing commas. Not your job here.
- **Choices the project's `.webik/design.md` already ratifies.** If it's in the system, it's a decision, not slop.

This filter is half the skill. Generated UI looks generated because it defaulted; it does *not* become good by defaulting harder. When in doubt, leave it and note it rather than churn it.

## Guardrails

- Behavior unchanged unless you're fixing a clear visual bug.
- Minimal, focused edits — this is deslop, not redesign. If a fix turns into a rebuild, that's a `design-review` job; flag it, don't do it here.
- Match the surrounding code's conventions (Tailwind vs CSS vars, naming). Slop is partly *inconsistency with what's already there* — fix toward the local style, not your own.

## Output

Present changes as a markdown table grouped by category, **Before** and **After** columns, one row per fix, cite file + property when it isn't obvious. Put the compositional fixes (Pass 1) first — they matter most. Omit categories where nothing changed. Close with a 1–2 sentence summary, and if Pass 1 surfaced something too structural to fix surgically, say so and point to `/webik:design-review`.
