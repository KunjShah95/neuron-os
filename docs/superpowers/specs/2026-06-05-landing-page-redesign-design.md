# Neuron OS Landing Page Redesign — Design Spec

**Date:** 2026-06-05
**Status:** Draft (pending user approval)
**Scope:** Full visual redesign of `website/` — all 7 existing sections + hero + nav
**Direction:** "Manu Arora take" — premium dark, mesh gradient bg, gradient text, glassmorphic cards, glow, parallax orbs

---

## 1. Goals & Non-Goals

### Goals
- Elevate the landing page from "developer project" to "premium dev-tool brand" (Linear / Vercel / Resend tier)
- Make the brand recognizable from a thumbnail / OG image / Twitter card
- Increase trust for first-time visitors: real terminal output under the headline, real dashboard mockup in the second section
- Keep the "OS for autonomous agents" positioning but communicate it with a sharper voice: "Ship agents, not wrappers."
- Preserve all 7 existing sections, restyled in the new visual language
- No new sections, no copy rewrite of the body — only the hero headline changes

### Non-Goals
- No new pages, no router changes, no CMS integration
- No copy rewrite of Features, Architecture, Tech Stack, or footer copy
- No new dependencies beyond what `website/package.json` already has (Framer Motion 12, Tailwind 3, React 19)
- No dashboard/feature changes — only the marketing site at `website/`
- No backend changes, no API changes

---

## 2. Visual System

### 2.1 Color Palette

Defined as Tailwind theme extensions in `tailwind.config.js` (which already exists). Extend the existing `ink-*` palette with the brand accents below — don't replace it.

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0a0a0f` | Page background (replaces current `#000000`) |
| `bg-elevated` | `#09090b` | Cards, terminal blocks |
| `bg-glass` | `rgba(255,255,255,0.04)` | Glassmorphic surfaces (already used by existing `.liquid-glass`) |
| `border-glass` | `rgba(255,255,255,0.08)` | Glass card borders |
| `border-strong` | `rgba(255,255,255,0.12)` | Hover borders |
| `ink-50` … `ink-800` | existing `ink-*` palette | Reuse — already covers text hierarchy (`ink-50` = brightest, `ink-800` = dimmest) |
| `text-primary` | `#ffffff` / `ink-50` | Headings, primary text |
| `text-secondary` | `ink-100` / `#d4d4d8` | Body text |
| `text-tertiary` | `ink-300` / `#a3a3a3` | Captions, secondary labels |
| `text-muted` | `ink-500` / `#71717a` | Meta, monospace micro-labels |
| `brand-purple` | `#8b5cf6` | Primary brand accent (new Tailwind token) |
| `brand-pink` | `#ec4899` | Secondary brand accent (new) |
| `brand-cyan` | `#06b6d4` | Tertiary accent, terminal syntax (new) |
| `state-busy` | `#fbbf24` | "busy" / pending state (new) |
| `state-ready` | `#22c55e` | "ready" / success state (new) |
| `gradient-brand` | `linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #06b6d4 100%)` | Headline words, CTAs, logo |
| `gradient-mesh` | multi-layer radial gradients | Hero background |

### 2.2 Typography

The site already loads Inter, Barlow, Instrument Serif, and DM Mono. Use them as follows.

| Element | Font | Weight | Size (clamp) | Tracking |
|---|---|---|---|---|
| Hero display | Instrument Serif (italic) | 400 | `clamp(56px, 9vw, 110px)` | `-0.03em` |
| Section h2 | Instrument Serif (italic) | 400 | `clamp(40px, 5vw, 64px)` | `-0.02em` |
| Section h3 | Inter | 600 | `clamp(20px, 2.4vw, 28px)` | `-0.01em` |
| Card title | Inter | 500 | 16–18px | `-0.005em` |
| Body | **Barlow** (existing) | 400 | 15–17px | normal |
| Caption | Inter | 400 | 13–14px | normal |
| Micro label | DM Mono | 400 | 9–11px | `0.18em` (uppercase) |
| Code/terminal | DM Mono | 400 | 12–14px | normal |
| Button | Inter | 500 | 13–15px | `-0.005em` |
| Stat number | Instrument Serif (italic) | 400 | `clamp(36px, 5vw, 64px)` | `-0.02em` |
| Logo | Inter | 600 | 15px | normal |

Barlow is already wired up as the body font in `tailwind.config.js` (`font-body`). Keep it loaded in `index.html`.

### 2.3 Spacing & Layout

- Page max-width: `1280px`, content padding: `clamp(24px, 5vw, 64px)` horizontal
- Vertical section padding: `clamp(80px, 12vw, 160px)` top/bottom
- Card padding: `24px–32px`
- Card border-radius: `12–16px` for hero glass, `8–10px` for utility cards
- Terminal border-radius: `14px`
- Grid gap: `1px` (with `bg-glass` showing through as dividers) for metric rows; `16–24px` for feature grids

### 2.4 Effects

- **Mesh gradient background** — multi-layer radial gradients on `bg-base`, see Hero spec
- **Floating orbs** — 3 absolutely-positioned divs, large blur (`filter: blur(80–100px)`), low opacity, slow CSS animation (translate + scale loop, 20–30s)
- **Glassmorphism** — `background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08)`
- **Gradient text** — `background: linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4); background-clip: text; color: transparent`
- **Glow shadows** — `box-shadow: 0 0 60px -20px rgba(139,92,246,.4), 0 0 0 1px rgba(255,255,255,.05)`
- **Hover lift** — `transform: translateY(-2px); box-shadow: ...` with `transition: all 0.2s ease`
- **Noise overlay** — keep the existing `.noise-overlay` div, retune opacity from 0.05 to 0.03

---

## 3. Section Specifications

### 3.1 Navbar (`sections/Navbar.tsx`)

- Glassmorphic pill: `background: rgba(255,255,255,0.04); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px`
- Horizontal padding `clamp(16px, 3vw, 32px)`, vertical `10px`
- Logo: 24px gradient cube (`linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4)`) + "Aegis" wordmark in Inter 600 15px + tiny `v0.1.0` badge in DM Mono
- Nav links: Inter 13px, color `#a3a3a3`, hover to `#fff`, 200ms
- Right side: `⌘K` keyboard hint in DM Mono, then gradient CTA pill (`Install aegis →`)
- On scroll past hero: glass pill sticks to top, gains a subtle bottom border

### 3.2 Hero Section (`sections/HeroSection.tsx`)

Full-viewport. Two visual layers: animated mesh + orbs, content layer on top.

**Layer 1: Background (z-0, fixed)**
- Mesh gradient on `body` or full-page wrapper: 3 radial gradients layered
  - `radial-gradient(ellipse 60% 50% at 20% 10%, rgba(139,92,246,.35), transparent 60%)`
  - `radial-gradient(ellipse 50% 40% at 80% 20%, rgba(236,72,153,.25), transparent 60%)`
  - `radial-gradient(ellipse 50% 40% at 50% 90%, rgba(6,182,212,.20), transparent 60%)`
- 3 floating orbs: 160px, 200px, 180px circles, `filter: blur(80–100px)`, positioned absolute, animated with CSS keyframes (translate + scale, 20–30s loops, `prefers-reduced-motion: reduce` honored)
- Replace existing radial-light + mouse parallax with the new orb parallax (same mouse-move handler concept, but applied to the orbs container)

**Layer 2: Content (z-10, centered)**
- Top: status pill — green dot + "v0.1.0 — TUI Platform · 14 agent types" in DM Mono
- Center: serif italic headline, 2 lines
  - Line 1: "Ship agents,"
  - Line 2: "not **wrappers.**" (gradient text on "wrappers.")
- Subhead: "A full operating system for autonomous AI agents — typed, observable, recoverable, runnable from your terminal." in Inter 16px, color `#d4d4d8`, max-width 540px
- CTAs (row, centered):
  - Primary: gradient pill "Install aegis" with subtle glow shadow
  - Secondary: glassmorphic "View on GitHub ↗"
- Trust line below CTAs: "SESSION-FIRST · LOCAL VAULT · ZERO DATA LEAKS" in DM Mono 10px, color `#71717a`
- Terminal block below CTAs (max-width 720px, glassmorphic with purple halo):
  - 9px circles in traffic-light row (purple/pink/green at 0.6 opacity, no red)
  - 4 lines of mock commands with syntax highlighting matching new palette
- Below terminal: 4-cell metric grid (1px dividers, glassmorphic), 40px serif italic numbers + DM Mono micro labels
- Entrance: existing `fade-enter` mechanism expanded to per-element stagger (60–100ms each, max 800ms total)

### 3.3 Features Grid (`sections/FeaturesGrid.tsx`)

- Section header: serif italic h2 "Everything you need. Nothing you don't.", eyebrow "— FEATURES" in DM Mono cyan
- 6–8 feature cards in a 3-col grid (2-col on tablet, 1-col on mobile)
- Card spec:
  - Glassmorphic surface with 1px `border-glass`
  - 48px gradient icon block (rounded 12px, soft gradient fill matching the accent gradient)
  - Card title in Inter 500 17px
  - Body in Inter 14px `#a3a3a3`
  - Hover: translateY(-2px), border becomes `border-strong`, subtle purple glow appears
- Framer Motion: stagger fade-up on scroll into view, 60ms between cards

### 3.4 Architecture Section (`sections/ArchitectureSection.tsx`)

- Section header: serif italic h2 "From spawn to ship.", eyebrow "— ARCHITECTURE"
- Replace any current diagram with a clean horizontal flow:
  - Glassmorphic nodes: `CLI / Mode Launcher` → `Agent Manager` → `Worker Process (×N)` → `Hook Registry` → `Recovery`
  - Connections: 1px gradient lines (use SVG with `linearGradient` def matching the brand gradient)
  - On hover of a node: glow + 1px white border
- Keep existing copy blocks below the diagram, restyle to new type system

### 3.5 Terminal Demo (`sections/TerminalDemo.tsx`)

- Hero-style terminal block (same glassmorphic + purple glow as in Hero)
- Section label: "— LIVE" in DM Mono cyan
- 6–10 lines of mixed commands and outputs that demonstrate spawning/killing agents, viewing logs, switching providers
- Optional: a thin gradient progress bar at the bottom that animates on scroll-into-view
- Keep the same syntax-color tokens from the new palette (`accent-purple` for prompt, `accent-yellow` for `plan`/`busy`, `accent-green` for `ready`/`success`, `accent-cyan` for file paths, `text-muted` for arrows)

### 3.6 Metrics Section (`sections/MetricsSection.tsx`)

- Section header: serif italic h2 "Built for scale. Benchmarked.", eyebrow "— METRICS"
- 3–4 big stat cards in a row, each with:
  - 64–80px Instrument Serif italic number, gradient text
  - DM Mono micro label below
  - 1-line caption in Inter 14px `#a3a3a3`
- On scroll-into-view: number animates from 0 → target over 1.2s with easing (Framer Motion `useMotionValue` + `animate`)

### 3.7 Tech Stack (`sections/TechStack.tsx`)

- Section header: serif italic h2 "Built on shoulders.", eyebrow "— TECH STACK"
- Logo grid (4–6 per row), each logo:
  - Glassmorphic tile 100×100
  - Logo image or simple SVG mark in `#a3a3a3`
  - Hover: tile becomes white-bordered, logo becomes white
- Below grid: 1-line caption "Bun · TypeScript · React 19 · Vite · Framer Motion · Tailwind CSS"

### 3.8 CTA Section (`sections/CTASection.tsx`)

- Full-width gradient panel (use `gradient-brand` as background, with `bg-opacity` overlay so it's not too loud)
- Centered content: serif italic h2 "Stop wrapping. Start shipping.", body line, primary CTA "Install aegis"
- Optional: a row of 3 micro-stats below the CTA ("2-min setup", "Local-first", "MIT licensed") in DM Mono micro labels

### 3.9 Footer (`sections/Footer.tsx`)

- Glassmorphic surface (subtle), border-top `border-glass`
- 4 columns: Product / Resources / Company / Legal (or whatever the current structure is)
- Bottom row: gradient logo + "Aegis · MIT · 2026" in DM Mono
- Links: Inter 13px `#a3a3a3`, hover `#fff`

---

## 4. Motion System

### 4.1 Framer Motion Primitives (new file: `src/lib/motion.ts`)

Export reusable variants:

```ts
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
}

export const stagger = (delay = 0.08) => ({
  show: { transition: { staggerChildren: delay } }
})

export const orbFloat = (i: number) => ({
  animate: {
    x: [0, 30 * (i % 2 ? 1 : -1), 0],
    y: [0, -20 * (i % 2 ? -1 : 1), 0],
    scale: [1, 1.08, 1],
    transition: {
      duration: 18 + i * 4,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
})
```

### 4.2 Page-wide rules

- `prefers-reduced-motion: reduce` — disable orb animations, reduce fade-up to opacity-only
- All transitions: 200ms hover, 600ms entrance, 1200ms number counters
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (Apple's "easeOutExpo"-ish) for entrances; `easeInOut` for ambient loops

### 4.3 Specific motions

- **Hero orbs**: mouse parallax (±14px) + ambient float (see `orbFloat` above)
- **Headline lines**: fade-up stagger, 100ms between lines
- **Terminal block**: each line fades up with 80ms stagger, then a `▌` caret blinks on the last line
- **Metric grid**: fade-up after terminal, 60ms between cells
- **Sections**: fade-up on scroll into view (`whileInView`), 60ms child stagger
- **Cards**: hover lift (-2px translateY) + border color + glow
- **CTAs**: hover scale 1.03 + glow intensify; active scale 0.97
- **Status pill dot**: gentle pulse (opacity 0.5 → 1 → 0.5, 2s loop)

---

## 5. Component Specifications

### 5.1 Reusable components (new)

Create in `src/components/`:

- **`GlassCard.tsx`** — glassmorphic surface, props: `as`, `className`, `glow?: 'purple' | 'pink' | 'cyan' | 'none'`, `interactive?: boolean` (adds hover lift)
- **`GradientText.tsx`** — wraps children in a span with gradient text effect, prop: `gradient?: 'brand' | 'subtle'`
- **`MetricCard.tsx`** — props: `value`, `label`, `caption?`, animates value on mount
- **`TerminalBlock.tsx`** — props: `lines: { prompt?: string; text: string; tone?: 'default' | 'success' | 'warning' | 'info' }[]`, optional `title` (traffic-light row), `glow?: 'purple' | 'none'`
- **`SectionEyebrow.tsx`** — small DM Mono uppercase label, optional `color` prop
- **`SectionHeader.tsx`** — eyebrow + serif italic h2 + optional body, consistent across all sections

### 5.2 Existing components to update

- **`ScrollReveal.tsx`** — keep, but update default y-distance to 24px and use the new easing
- **`GridBackground.tsx`** — repurpose or remove; the new mesh gradient on `body` supersedes it. If kept, dim it further.
- **`GradientText.tsx`** — already exists in `sections/`; move to `components/` and extend with brand palette gradients

---

## 6. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| ≥1280px | Full desktop layout as specified |
| 1024–1279px | Reduce hero font to `clamp(56px, 8vw, 96px)`, content padding to `clamp(24px, 4vw, 48px)` |
| 768–1023px | Feature grid 2-col, terminal demo full-width, nav links collapse to `⌘K` only |
| <768px | Single-column everything, hero font 48–64px, terminal scrolls horizontally if needed, metric grid 2×2 instead of 1×4, navbar logo + CTA only (no nav links) |

---

## 7. Accessibility

- Color contrast: all text on `bg-base` (#0a0a0f) and glassmorphic surfaces must meet WCAG AA (4.5:1 for body, 3:1 for large text). Verified:
  - `#fff` on `#0a0a0f`: 19.5:1 ✓
  - `#d4d4d8` on `#0a0a0f`: 12.9:1 ✓
  - `#a3a3a3` on `#0a0a0f`: 8.2:1 ✓
  - `#71717a` on `#0a0a0f`: 4.7:1 ✓ (DM Mono micro labels meet AA for ≥18px; for 10–11px they fail — restrict to ≥12px or use `#a3a3a3` for small)
- All interactive elements: visible focus ring (2px `accent-purple` outline + 2px offset)
- Gradient text: provide a fallback `color: #fff` for browsers that don't support `background-clip: text` (Safari < 14)
- `prefers-reduced-motion`: disable orb float, reduce fade-up distance to 4px
- All decorative SVGs: `aria-hidden="true"`. All CTAs: descriptive text labels.

---

## 8. SEO

- Update `<title>` and meta description if headline copy changes (it does — see Section 9)
- Add structured data: `SoftwareApplication` JSON-LD with `name: "Neuron OS"`, `applicationCategory: "DeveloperApplication"`, `operatingSystem: "Windows, macOS, Linux"`
- OG image: regenerate to match new hero (or defer — not in scope of this redesign unless explicitly asked)

---

## 9. Copy Changes

| Location | Before | After |
|---|---|---|
| `<title>` | `Neuron OS — The Operating System for Autonomous AI Agents` | Keep (brand SEO) |
| `<meta description>` | (current) | `Ship agents, not wrappers. A full operating system for autonomous AI agents — typed, observable, recoverable.` |
| Hero h1 line 1 | `An operating system` | `Ship agents,` |
| Hero h1 line 2 | `for autonomous agents.` | `not wrappers.` (gradient on "wrappers.") |
| Hero subhead | (current) | `A full operating system for autonomous AI agents — typed, observable, recoverable, runnable from your terminal.` |
| Terminal demo | (whatever's there) | 4 lines: `bun add aegis`, install confirmation, `aegis agent spawn plan --model claude-opus-4`, online + ready 142ms, streaming output |
| Section eyebrows | n/a | New: "— FEATURES", "— ARCHITECTURE", "— LIVE", "— METRICS", "— TECH STACK" (cyan) |
| CTA section h2 | (current) | `Stop wrapping. Start shipping.` |
| Footer year | (current) | `2026` |

All other body copy in FeaturesGrid / ArchitectureSection / TechStack / Footer stays as-is in this pass.

---

## 10. Files to Touch

### Modify
- `website/index.html` — update `<meta description>`; **keep** Barlow in font import (it's the body font)
- `website/src/index.css` — add CSS variables for new brand palette, mesh gradient utility, glass utility, retune noise-overlay to opacity 0.03. **Extend** existing classes (`.liquid-glass`, `.btn-landing-primary`, `.btn-landing-outline`, `.section-label`, `.num-display`, `.serif-italic`, `.terminal-window`) — don't delete them.
- `website/src/App.tsx` — remove `<GridBackground />`, apply mesh gradient background to the root wrapper, keep navbar import
- `website/src/sections/Navbar.tsx` — full rewrite per §3.1
- `website/src/sections/HeroSection.tsx` — full rewrite per §3.2
- `website/src/sections/FeaturesGrid.tsx` — restyle per §3.3
- `website/src/sections/ArchitectureSection.tsx` — restyle per §3.4
- `website/src/sections/TerminalDemo.tsx` — restyle per §3.5
- `website/src/sections/MetricsSection.tsx` — restyle per §3.6
- `website/src/sections/TechStack.tsx` — restyle per §3.7
- `website/src/sections/CTASection.tsx` — restyle per §3.8
- `website/src/sections/Footer.tsx` — restyle per §3.9
- `website/src/sections/GridBackground.tsx` — **delete** — replaced by mesh gradient on body. Only imported from `App.tsx:1,16` (verified by grep).
- `website/src/sections/GradientText.tsx` — **currently unused** (verified by grep — not imported anywhere). Either delete or move to `components/` and extend with brand palette gradients. Recommendation: move + extend.
- `website/tailwind.config.js` — **already exists.** Add new color tokens (`brand-purple`, `brand-pink`, `brand-cyan`, `state-busy`, `state-ready`), new background images (`gradient-brand`, `gradient-mesh`), new animation keyframes (`orb-float`, `gradient-shift`, `caret-blink`)

### Create
- `website/src/lib/motion.ts` — Framer Motion variants (see §4.1)
- `website/src/components/GlassCard.tsx`
- `website/src/components/GradientText.tsx` (moved from sections, extended)
- `website/src/components/MetricCard.tsx`
- `website/src/components/TerminalBlock.tsx`
- `website/src/components/SectionEyebrow.tsx`
- `website/src/components/SectionHeader.tsx`

### No change
- `website/package.json` — all deps already present (Framer Motion 12, Tailwind 3, React 19)
- `website/vite.config.ts`
- `website/src/main.tsx`
- `website/src/components/ScrollReveal.tsx` — keep, but update default y-distance to 24px and easing. Already used by 7 sections (verified by grep) with variants `fade-up`, `scale-up`, `blur-in` — preserve the API.
- Everything in `src/` (the actual Neuron OS app, not the marketing site)
- Everything in `dashboard/`

### Reuse, don't reinvent
- `.liquid-glass` / `.liquid-glass-strong` — extend with new variant, use as base for new glassmorphic surfaces
- `.btn-landing-primary` / `.btn-landing-outline` — restyle to use gradient for primary, keep outline behavior
- `.terminal-window` — extend, use for hero terminal + section terminals
- `.section-label` — repurpose as section eyebrow
- `.serif-italic` — use for serif italic display text
- `.num-display` — extend or replace with serif italic numerals
- Tailwind tokens: `font-serif`, `font-mono`, `font-body`, `ink-*` colors, `float` / `pulse-soft` / `glow-pulse` / `typing-cursor` animations — all already defined

---

## 11. Out of Scope (Future Work)

- New pages (e.g., `/pricing`, `/docs`, `/changelog`)
- Blog / content marketing integration
- Animated demo video on hero
- Localization / i18n
- Dark/light theme toggle (current site is dark-only)
- A/B testing setup
- Analytics / event tracking
- OG image redesign (matches hero; do as a follow-up)
- The dashboard app at `dashboard/` has its own hero at `dashboard/src/site/components/HeroSection.tsx` — out of scope, but the design system here could be ported later

---

## 12. Acceptance Criteria

The redesign is complete when:

1. Hero matches the spec in §3.2 (headline + subhead + CTAs + trust line + terminal + metric grid)
2. All 7 existing sections are restyled in the new visual language (glassmorphic cards, gradient accents, new type system)
3. Mesh gradient background with 3 floating orbs visible on hero
4. Mouse parallax on orbs working
5. `prefers-reduced-motion: reduce` disables orb float and reduces entrance distance
6. All text passes WCAG AA contrast on `bg-base` and glassmorphic surfaces
7. Responsive: layout works at 1440px, 1024px, 768px, 375px
8. `bun run build` (or `npm run build`) completes without errors
9. Visual review against the Manu Arora mockup pushed to the brainstorm companion — production site is at the same level of polish
10. No new dependencies added to `package.json`

---

## 13. Open Questions for the User (resolved during brainstorming)

- ✅ Headline: "Ship agents, not wrappers."
- ✅ Color: purple/pink/cyan gradient
- ✅ Scope: full restyle of all 7 sections
- ✅ Motion: premium (orbs + Framer Motion)
- ✅ Tailwind config: **exists** at `website/tailwind.config.js` (verified) — extend it, don't create new
- ✅ Existing CSS classes: `.liquid-glass`, `.terminal-window`, `.btn-landing-primary`, etc. all exist (verified) — extend, don't replace
- ✅ Existing Tailwind tokens: `ink-*` colors, `font-serif`, `font-mono`, `font-body`, `float` / `pulse-soft` / `glow-pulse` / `typing-cursor` / `counter-up` animations all exist (verified) — reuse
- ✅ `GridBackground.tsx` only imported by `App.tsx:1,16` (verified) — safe to delete
- ✅ `GradientText.tsx` currently unused (verified) — safe to move/extend
- ✅ `ScrollReveal.tsx` used by 7 sections with variants `fade-up`, `scale-up`, `blur-in` (verified) — preserve API
- ✅ Should the dashboard site (`dashboard/src/site/`) get the same treatment? **Out of scope** for this pass per the user's framing ("landing page" = `website/`)
