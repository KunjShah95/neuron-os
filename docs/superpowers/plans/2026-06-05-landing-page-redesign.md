# Neuron OS Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full visual redesign of the `website/` marketing site to the "Manu Arora take" — premium dark, mesh gradient, gradient text, glassmorphic cards, glow, parallax orbs.

**Architecture:** Extend the existing `tailwind.config.js` and `index.css` with new brand tokens (no new dependencies). Build 6 reusable components (`GlassCard`, `GradientText`, `MetricCard`, `TerminalBlock`, `SectionEyebrow`, `SectionHeader`) plus 1 motion primitives file. Rewrite hero + navbar from scratch. Restyle the 6 remaining sections in place. Wire up mesh gradient on the App root and delete the obsolete `GridBackground`.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS 3, Framer Motion 12 (all already in `website/package.json`)

**Spec:** `docs/superpowers/specs/2026-06-05-landing-page-redesign-design.md`

**Reference mockups (visual companion):** `http://localhost:64392/03-manu-arora-take.html`

---

## Working Directory

All paths in this plan are relative to `C:\neuron os\website\`. Run all commands from there.

```bash
cd "C:\neuron os\website"
```

---

## Verification Commands (used throughout)

| Command | Purpose |
|---|---|
| `bun run typecheck` | `tsc -b` — must exit 0 |
| `bun run build` | `tsc -b && vite build` — must exit 0 |
| `bun run lint` | `eslint .` — must exit 0 (warnings OK) |
| `bun run dev` | Vite dev server on `:5173` — open in browser for visual review |

---

## Task Index

1. Tailwind config — add brand tokens
2. CSS utilities — mesh gradient, glass variants, retune noise
3. Motion primitives — `src/lib/motion.ts`
4. Component — `GradientText`
5. Component — `SectionEyebrow`
6. Component — `SectionHeader`
7. Component — `GlassCard`
8. Component — `MetricCard`
9. Component — `TerminalBlock`
10. Navbar rewrite
11. Hero rewrite
12. FeaturesGrid restyle
13. ArchitectureSection restyle
14. TerminalDemo restyle
15. MetricsSection restyle
16. TechStack restyle
17. CTASection restyle
18. Footer restyle
19. App.tsx — remove GridBackground, apply mesh gradient
20. Delete `GridBackground.tsx` and `sections/GradientText.tsx` (unused, moved)
21. `index.html` SEO update (meta description + JSON-LD)
22. Final verification — typecheck, build, dev-server visual review

---

## Task 1: Tailwind config — add brand tokens

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Open `tailwind.config.js` and replace its entire content**

Replace the file with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter"', "system-ui", "sans-serif"],
        body: ['"Barlow"', '"Inter"', "sans-serif"],
        mono: ['"DM Mono"', "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        heading: ['"Inter"', "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', '"DM Serif Display"', "serif"],
      },
      colors: {
        ink: {
          50: "rgba(255, 255, 255, 0.95)",
          100: "rgba(255, 255, 255, 0.85)",
          200: "rgba(255, 255, 255, 0.7)",
          300: "rgba(255, 255, 255, 0.55)",
          400: "rgba(255, 255, 255, 0.4)",
          500: "rgba(255, 255, 255, 0.3)",
          600: "rgba(255, 255, 255, 0.18)",
          700: "rgba(255, 255, 255, 0.1)",
          800: "rgba(255, 255, 255, 0.05)",
        },
        base: "#0a0a0f",
        elevated: "#09090b",
        "brand-purple": "#8b5cf6",
        "brand-pink": "#ec4899",
        "brand-cyan": "#06b6d4",
        "state-busy": "#fbbf24",
        "state-ready": "#22c55e",
      },
      animation: {
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "typing-cursor": "typing-cursor 0.8s step-end infinite",
        "counter-up": "counter-up 0.6s ease-out both",
        "orb-float-a": "orb-float-a 22s ease-in-out infinite",
        "orb-float-b": "orb-float-b 26s ease-in-out infinite",
        "orb-float-c": "orb-float-c 30s ease-in-out infinite",
        "caret-blink": "caret-blink 1s step-end infinite",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        "typing-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "counter-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "orb-float-a": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(40px, -30px) scale(1.08)" },
          "66%": { transform: "translate(-30px, 20px) scale(0.95)" },
        },
        "orb-float-b": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-50px, 30px) scale(0.92)" },
          "66%": { transform: "translate(30px, -40px) scale(1.1)" },
        },
        "orb-float-c": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(20px, 40px) scale(1.05)" },
          "66%": { transform: "translate(-40px, -20px) scale(0.97)" },
        },
        "caret-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      backgroundImage: {
        "cta-glow":
          "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 70%)",
        "gradient-brand":
          "linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #06b6d4 100%)",
        "gradient-mesh":
          "radial-gradient(ellipse 60% 50% at 20% 10%, rgba(139,92,246,.35), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 20%, rgba(236,72,153,.25), transparent 60%), radial-gradient(ellipse 50% 40% at 50% 90%, rgba(6,182,212,.20), transparent 60%)",
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Verify file parses**

Run: `cd "C:\neuron os\website" && node -e "import('./tailwind.config.js').then(m => console.log('OK:', Object.keys(m.default.theme.extend.colors).join(',')))"`
Expected: `OK: ink,base,elevated,brand-purple,brand-pink,brand-cyan,state-busy,state-ready`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/tailwind.config.js
git commit -m "feat(website): add brand color tokens, animations, gradient backgrounds"
```

---

## Task 2: CSS utilities — mesh gradient, glass variants, retune noise

**Files:**
- Modify: `website/src/index.css`

- [ ] **Step 1: Open `website/src/index.css` and replace its entire content**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    @apply bg-base text-white;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    scroll-behavior: smooth;
  }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 999px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }

  :root {
    --hairline: rgba(255, 255, 255, 0.05);
    --color-base: #0a0a0f;
    --color-elevated: #09090b;
    --color-purple: #8b5cf6;
    --color-pink: #ec4899;
    --color-cyan: #06b6d4;
    --color-busy: #fbbf24;
    --color-ready: #22c55e;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out: cubic-bezier(0.22, 1, 0.36, 1);
  }

  body {
    font-family: 'Barlow', 'Inter', sans-serif;
    background: var(--color-base);
    color: #fff;
    overflow-x: hidden;
    font-weight: 400;
    letter-spacing: 0.005em;
  }
}

@layer components {
  /* ── Mesh background (hero / page) ── */
  .bg-mesh-hero {
    background: var(--color-base);
    background-image:
      radial-gradient(ellipse 60% 50% at 20% 10%, rgba(139, 92, 246, 0.35), transparent 60%),
      radial-gradient(ellipse 50% 40% at 80% 20%, rgba(236, 72, 153, 0.25), transparent 60%),
      radial-gradient(ellipse 50% 40% at 50% 90%, rgba(6, 182, 212, 0.20), transparent 60%);
  }

  /* ── Liquid Glass — wanderful signature surface ── */
  .liquid-glass {
    background: rgba(255, 255, 255, 0.012);
    background-blend-mode: luminosity;
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.06),
      0 1px 0 rgba(0, 0, 0, 0.4);
    position: relative;
    overflow: hidden;
  }

  .liquid-glass::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.32) 0%,
      rgba(255, 255, 255, 0.08) 20%,
      rgba(255, 255, 255, 0) 40%,
      rgba(255, 255, 255, 0) 60%,
      rgba(255, 255, 255, 0.08) 80%,
      rgba(255, 255, 255, 0.32) 100%
    );
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  .liquid-glass-strong {
    background: rgba(255, 255, 255, 0.025);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08);
  }

  /* ── Glass card (new) — for feature cards, sections ── */
  .glass-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    position: relative;
    transition: all 0.25s var(--ease-in-out);
  }

  .glass-card-interactive {
    cursor: pointer;
  }

  .glass-card-interactive:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.055);
    box-shadow: 0 12px 40px -10px rgba(139, 92, 246, 0.3);
  }

  .glass-card-glow-purple {
    box-shadow: 0 0 60px -20px rgba(139, 92, 246, 0.4);
  }

  .glass-card-glow-pink {
    box-shadow: 0 0 60px -20px rgba(236, 72, 153, 0.35);
  }

  .glass-card-glow-cyan {
    box-shadow: 0 0 60px -20px rgba(6, 182, 212, 0.35);
  }

  /* ── Gradient text (replaces old) ── */
  .gradient-text {
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #06b6d4 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }

  .gradient-text-subtle {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(220, 220, 220, 0.7) 50%, rgba(180, 180, 180, 0.5) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }

  .section-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.06) 50%, transparent);
  }

  .noise-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/feFilter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 128px;
  }

  .terminal-window {
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    overflow: hidden;
    backdrop-filter: blur(20px);
  }

  .terminal-window-glow {
    box-shadow: 0 0 80px -20px rgba(139, 92, 246, 0.4);
  }

  /* ── Buttons ── */
  .btn-landing-primary {
    @apply px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 cursor-pointer;
    background: #fff;
    color: #000;
    letter-spacing: 0.01em;
  }
  .btn-landing-primary:hover {
    transform: scale(1.03);
    box-shadow: 0 0 32px 4px rgba(255, 255, 255, 0.2);
  }
  .btn-landing-primary:active {
    transform: scale(0.97);
  }

  .btn-landing-gradient {
    @apply px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 cursor-pointer;
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
    color: #fff;
    letter-spacing: 0.005em;
    box-shadow: 0 10px 30px -10px rgba(139, 92, 246, 0.5);
  }
  .btn-landing-gradient:hover {
    transform: scale(1.03);
    box-shadow: 0 14px 40px -10px rgba(236, 72, 153, 0.55);
  }
  .btn-landing-gradient:active {
    transform: scale(0.97);
  }

  .btn-landing-outline {
    @apply px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 cursor-pointer;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.015);
    backdrop-filter: blur(8px);
  }
  .btn-landing-outline:hover {
    border-color: rgba(255, 255, 255, 0.25);
    color: white;
    background: rgba(255, 255, 255, 0.04);
  }

  /* ── Section label (eyebrow) ── */
  .section-label {
    @apply text-[11px] uppercase font-medium block;
    letter-spacing: 0.2em;
    color: rgba(255, 255, 255, 0.3);
    font-family: 'DM Mono', 'Inter', monospace;
  }

  .section-label-cyan {
    @apply text-[11px] uppercase font-medium block;
    letter-spacing: 0.22em;
    color: var(--color-cyan);
    font-family: 'DM Mono', 'Inter', monospace;
  }

  /* ── Hairline border ── */
  .hairline-b { border-bottom: 1px solid var(--hairline); }
  .hairline-t { border-top: 1px solid var(--hairline); }

  /* ── Stat numeral (serif italic) ── */
  .num-display {
    font-family: 'Instrument Serif', 'DM Serif Display', serif;
    font-style: italic;
    font-weight: 400;
    letter-spacing: -0.02em;
  }

  /* ── Serif italic accent ── */
  .serif-italic {
    font-family: 'Instrument Serif', 'DM Serif Display', serif;
    font-style: italic;
    font-weight: 400;
  }

  /* ── Brand gradient cube (for logo) ── */
  .brand-cube {
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #06b6d4 100%);
    border-radius: 7px;
  }

  /* ── Focus ring ── */
  :focus-visible {
    outline: 2px solid var(--color-purple);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

@layer utilities {
  .fade-enter {
    opacity: 0;
    transform: translateY(24px);
    transition:
      opacity 1s var(--ease-out-expo),
      transform 1s var(--ease-out-expo);
  }
  .fade-enter.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Reduced motion — kill animations, keep opacity transitions */
  @media (prefers-reduced-motion: reduce) {
    .fade-enter { transform: none; }
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 2: Run dev server briefly to confirm CSS loads**

Run: `cd "C:\neuron os\website" && timeout 10 bun run dev 2>&1 | head -20`
Expected: Vite dev server starts on `:5173` with no CSS errors. (Ctrl-C / timeout to stop.)

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/index.css
git commit -m "feat(website): add mesh bg, glass-card, gradient-text, brand-button utilities"
```

---

## Task 3: Motion primitives — `src/lib/motion.ts`

**Files:**
- Create: `website/src/lib/motion.ts`

- [ ] **Step 1: Create `website/src/lib/` directory if missing**

Run: `Test-Path "C:\neuron os\website\src\lib"` (should be False; if False, `New-Item -ItemType Directory -Path "C:\neuron os\website\src\lib" -Force`)

- [ ] **Step 2: Create `website/src/lib/motion.ts` with full content**

```ts
import type { Variants } from "framer-motion"

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]
export const EASE_IN_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
}

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(10px)" },
  show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE_OUT_EXPO } },
}

export const stagger = (delay = 0.08): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
})

export const inViewport = (amount = 0.2) => ({
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, amount },
})

export const orbFloat = (i: number) => ({
  animate: {
    x: [0, 30 * (i % 2 ? 1 : -1), 0],
    y: [0, -20 * (i % 2 ? -1 : 1), 0],
    scale: [1, 1.08, 1],
    transition: {
      duration: 18 + i * 4,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  },
})
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: no errors (or only errors in unrelated files; new file should be clean)

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/lib/motion.ts
git commit -m "feat(website): add framer-motion variant primitives"
```

---

## Task 4: Component — `GradientText`

**Files:**
- Create: `website/src/components/GradientText.tsx`

- [ ] **Step 1: Create file**

```tsx
import type { ReactNode } from "react"

type Gradient = "brand" | "subtle"

interface GradientTextProps {
  children: ReactNode
  gradient?: Gradient
  className?: string
  as?: "span" | "h1" | "h2" | "h3" | "p" | "em"
}

export default function GradientText({
  children,
  gradient = "brand",
  className = "",
  as: Tag = "span",
}: GradientTextProps) {
  const cls = gradient === "brand" ? "gradient-text" : "gradient-text-subtle"
  return <Tag className={`${cls} ${className}`}>{children}</Tag>
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "GradientText" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/components/GradientText.tsx
git commit -m "feat(website): add GradientText component"
```

---

## Task 5: Component — `SectionEyebrow`

**Files:**
- Create: `website/src/components/SectionEyebrow.tsx`

- [ ] **Step 1: Create file**

```tsx
type Tone = "muted" | "cyan"

interface SectionEyebrowProps {
  children: React.ReactNode
  tone?: Tone
  className?: string
}

export default function SectionEyebrow({
  children,
  tone = "muted",
  className = "",
}: SectionEyebrowProps) {
  const cls = tone === "cyan" ? "section-label-cyan" : "section-label"
  return <span className={`${cls} ${className}`}>{children}</span>
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "SectionEyebrow" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/components/SectionEyebrow.tsx
git commit -m "feat(website): add SectionEyebrow component"
```

---

## Task 6: Component — `SectionHeader`

**Files:**
- Create: `website/src/components/SectionHeader.tsx`

- [ ] **Step 1: Create file**

```tsx
import SectionEyebrow from "./SectionEyebrow"

interface SectionHeaderProps {
  eyebrow?: string
  title: React.ReactNode
  body?: React.ReactNode
  align?: "left" | "center"
  tone?: "muted" | "cyan"
  className?: string
}

export default function SectionHeader({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "muted",
  className = "",
}: SectionHeaderProps) {
  const wrapperAlign = align === "center" ? "text-center mx-auto" : "text-left"
  return (
    <header className={`max-w-3xl ${wrapperAlign} ${className}`}>
      {eyebrow && <SectionEyebrow tone={tone}>{eyebrow}</SectionEyebrow>}
      {eyebrow && <div className="h-4" />}
      <h2
        className="serif-italic text-white"
        style={{
          fontSize: "clamp(40px, 5vw, 64px)",
          lineHeight: 0.98,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      {body && (
        <>
          <div className="h-5" />
          <p
            className="text-ink-300"
            style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}
          >
            {body}
          </p>
        </>
      )}
    </header>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "SectionHeader" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/components/SectionHeader.tsx
git commit -m "feat(website): add SectionHeader component"
```

---

## Task 7: Component — `GlassCard`

**Files:**
- Create: `website/src/components/GlassCard.tsx`

- [ ] **Step 1: Create file**

```tsx
import type { ReactNode } from "react"

type Glow = "none" | "purple" | "pink" | "cyan"

interface GlassCardProps {
  children: ReactNode
  glow?: Glow
  interactive?: boolean
  className?: string
  as?: "div" | "article" | "section" | "li"
  style?: React.CSSProperties
}

const glowClass: Record<Glow, string> = {
  none: "",
  purple: "glass-card-glow-purple",
  pink: "glass-card-glow-pink",
  cyan: "glass-card-glow-cyan",
}

export default function GlassCard({
  children,
  glow = "none",
  interactive = false,
  className = "",
  as: Tag = "div",
  style,
}: GlassCardProps) {
  const cls = [
    "glass-card",
    interactive ? "glass-card-interactive" : "",
    glowClass[glow],
    className,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Tag className={cls} style={style}>
      {children}
    </Tag>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "GlassCard" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/components/GlassCard.tsx
git commit -m "feat(website): add GlassCard component"
```

---

## Task 8: Component — `MetricCard`

**Files:**
- Create: `website/src/components/MetricCard.tsx`

- [ ] **Step 1: Create file**

```tsx
import { useEffect, useRef, useState } from "react"
import GradientText from "./GradientText"

interface MetricCardProps {
  value: number
  label: string
  suffix?: string
  caption?: string
  gradient?: boolean
  align?: "left" | "center"
  className?: string
}

export default function MetricCard({
  value,
  label,
  suffix,
  caption,
  gradient = true,
  align = "center",
  className = "",
}: MetricCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    const duration = 1200
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [started, value])

  const formatted =
    value % 1 === 0 ? Math.round(display).toString() : display.toFixed(1)
  const alignCls = align === "center" ? "text-center" : "text-left"

  return (
    <div
      ref={ref}
      className={`bg-elevated/60 px-5 py-6 backdrop-blur-xl ${alignCls} ${className}`}
    >
      <div
        className="num-display"
        style={{ fontSize: "clamp(36px, 5vw, 64px)", lineHeight: 1 }}
      >
        {gradient ? (
          <GradientText gradient="brand">{formatted}</GradientText>
        ) : (
          <span className="text-white">{formatted}</span>
        )}
        {suffix && (
          <span className="text-ink-400" style={{ fontSize: "0.6em" }}>
            {suffix}
          </span>
        )}
      </div>
      <div
        className="mt-3 font-mono text-ink-300"
        style={{ fontSize: 10, letterSpacing: "0.18em" }}
      >
        {label}
      </div>
      {caption && (
        <div className="mt-2 text-ink-300" style={{ fontSize: 13 }}>
          {caption}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "MetricCard" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/components/MetricCard.tsx
git commit -m "feat(website): add MetricCard with animated counter"
```

---

## Task 9: Component — `TerminalBlock`

**Files:**
- Create: `website/src/components/TerminalBlock.tsx`

- [ ] **Step 1: Create file**

```tsx
import { motion } from "framer-motion"
import { EASE_OUT_EXPO, stagger, fadeUp } from "../lib/motion"

export type TerminalTone = "default" | "success" | "warning" | "info" | "muted"

export interface TerminalLine {
  prompt?: string
  text: string
  tone?: TerminalTone
  prefix?: string
}

interface TerminalBlockProps {
  title?: string
  lines: TerminalLine[]
  glow?: "none" | "purple"
  className?: string
  showCaret?: boolean
}

const toneClass: Record<TerminalTone, string> = {
  default: "text-white",
  success: "text-state-ready",
  warning: "text-state-busy",
  info: "text-brand-cyan",
  muted: "text-ink-400",
}

const promptColor = "text-brand-purple"

export default function TerminalBlock({
  title,
  lines,
  glow = "none",
  className = "",
  showCaret = true,
}: TerminalBlockProps) {
  const glowCls = glow === "purple" ? "terminal-window-glow" : ""
  return (
    <div
      className={`terminal-window ${glowCls} ${className}`}
      style={{ background: "rgba(9,9,11,0.7)" }}
    >
      {title !== undefined && (
        <div
          className="flex items-center gap-1.5 px-3.5 py-2.5"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: "#ec4899", opacity: 0.6 }} />
          <span className="w-2 h-2 rounded-full" style={{ background: "#fbbf24", opacity: 0.6 }} />
          <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e", opacity: 0.6 }} />
          {title && (
            <span
              className="ml-auto font-mono text-ink-500"
              style={{ fontSize: 10 }}
            >
              {title}
            </span>
          )}
        </div>
      )}
      <motion.div
        className="px-5 py-4 font-mono"
        style={{ fontSize: 13, lineHeight: 1.85, color: "#e5e5e5" }}
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        {lines.map((line, i) => {
          const tone = line.tone ?? "default"
          const cls = toneClass[tone]
          const isLast = i === lines.length - 1
          return (
            <motion.div key={i} variants={fadeUp}>
              {line.prompt && (
                <>
                  <span className={promptColor}>{line.prompt} </span>
                </>
              )}
              {line.prefix && (
                <span className="text-ink-500">{line.prefix} </span>
              )}
              <span className={cls}>{line.text}</span>
              {isLast && showCaret && (
                <span
                  className="inline-block ml-0.5 animate-caret-blink"
                  style={{ color: "#e5e5e5" }}
                >
                  ▌
                </span>
              )}
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "TerminalBlock" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/components/TerminalBlock.tsx
git commit -m "feat(website): add TerminalBlock with stagger reveal and caret blink"
```

---

## Task 10: Navbar rewrite

**Files:**
- Modify: `website/src/sections/Navbar.tsx` (replace entire content)

- [ ] **Step 1: Replace file content**

```tsx
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { EASE_OUT_EXPO } from "../lib/motion"

function MenuIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 7H20" />
      <path d="M4 12H20" />
      <path d="M4 17H20" />
    </svg>
  )
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 6L18 18" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

const navLinks = [
  { label: "Docs", href: "#docs" },
  { label: "Dashboard", href: "#dashboard" },
  { label: "Skills", href: "#stack" },
  { label: "Changelog", href: "#changelog" },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleAnchorClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    setMobileOpen(false)
  }

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
        scrolled ? "py-3" : "py-6"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-2.5 transition-all duration-500"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 12,
            boxShadow: scrolled ? "0 8px 32px -8px rgba(0,0,0,0.4)" : "none",
          }}
        >
          <a
            href="#top"
            onClick={(e) => handleAnchorClick(e, "#top")}
            className="flex items-center gap-2.5 relative z-50"
          >
            <span className="brand-cube w-6 h-6" />
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Aegis
            </span>
            <span
              className="font-mono text-ink-300 px-1.5 py-0.5"
              style={{ fontSize: 9, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4 }}
            >
              v0.1.0
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-5">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleAnchorClick(e, link.href)}
                className="text-[13px] text-ink-300 hover:text-white transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <span
              className="font-mono text-ink-400 px-2 py-1"
              style={{ fontSize: 11, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}
            >
              ⌘K
            </span>
            <a
              href="/"
              className="btn-landing-gradient"
              style={{ padding: "7px 14px", fontSize: 12 }}
            >
              Get started
            </a>
          </div>

          <button
            className="md:hidden p-2 text-ink-200 hover:text-white transition-colors relative z-50"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden bg-base/95 backdrop-blur-xl border-t border-white/[0.05] overflow-hidden"
          >
            <div className="px-6 py-8 flex flex-col gap-6 items-center">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleAnchorClick(e, link.href)}
                  className="text-[13px] text-ink-200 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <a href="/" className="btn-landing-gradient w-full text-center">
                Get started
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "Navbar" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/Navbar.tsx
git commit -m "feat(website): rewrite Navbar in glassmorphic pill style"
```

---

## Task 11: Hero rewrite

**Files:**
- Modify: `website/src/sections/HeroSection.tsx` (replace entire content)

- [ ] **Step 1: Replace file content**

```tsx
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { EASE_OUT_EXPO, EASE_IN_OUT, stagger, fadeUp } from "../lib/motion"
import TerminalBlock from "../components/TerminalBlock"
import MetricCard from "../components/MetricCard"

const heroStats = [
  { value: 14, label: "AGENT TYPES" },
  { value: 12, label: "TUI MODES" },
  { value: 95, suffix: ".2%", label: "R@5 · LONGMEMEVAL" },
  { value: 5, label: "AI PROVIDERS" },
]

const heroLines = [
  { prompt: "$", text: "bun add aegis" },
  { tone: "muted" as const, text: "+ aegis@0.1.0 installed · 14 agent types · 12 modes" },
  { prompt: "$", text: "aegis agent spawn plan --model claude-opus-4" },
  { prefix: "→", text: " plan agent online · pid 4187 · ", tone: "default" as const },
  { prefix: "→", text: "ready", tone: "success" as const },
  { prefix: "→", text: " streaming architecture.md → tasks.json", tone: "info" as const },
]

export default function HeroSection() {
  const [mounted, setMounted] = useState(false)
  const orbContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    const el = orbContainerRef.current
    if (!el) return
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let rafId = 0
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      targetX = ((e.clientX - cx) / cx) * 14
      targetY = ((e.clientY - cy) / cy) * 14
    }
    const tick = () => {
      currentX += (targetX - currentX) * 0.06
      currentY += (targetY - currentY) * 0.06
      el.style.transform = `translate(${currentX}px, ${currentY}px)`
      rafId = requestAnimationFrame(tick)
    }
    window.addEventListener("mousemove", onMove)
    rafId = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("mousemove", onMove)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <section
      id="top"
      className="relative w-full min-h-screen flex flex-col items-center overflow-hidden"
    >
      {/* Orb layer — fixed bg, mouse parallax + ambient float */}
      <div
        ref={orbContainerRef}
        className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-mesh-hero"
        style={{ transition: "transform 200ms linear" }}
      >
        <div
          className="absolute rounded-full animate-orb-float-a"
          style={{
            top: "15%",
            left: "8%",
            width: 320,
            height: 320,
            background: "#8b5cf6",
            filter: "blur(100px)",
            opacity: 0.45,
          }}
        />
        <div
          className="absolute rounded-full animate-orb-float-b"
          style={{
            top: "50%",
            right: "5%",
            width: 380,
            height: 380,
            background: "#ec4899",
            filter: "blur(120px)",
            opacity: 0.4,
          }}
        />
        <div
          className="absolute rounded-full animate-orb-float-c"
          style={{
            bottom: "10%",
            left: "30%",
            width: 360,
            height: 360,
            background: "#06b6d4",
            filter: "blur(110px)",
            opacity: 0.35,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, transparent 60%, var(--color-base) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 w-full text-center pt-[140px] px-6"
        variants={stagger(0.1)}
        initial="hidden"
        animate={mounted ? "show" : "hidden"}
      >
        <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 mb-9"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 999,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse-soft"
            style={{ background: "#22c55e", boxShadow: "0 0 8px #22c55e" }}
          />
          <span className="font-mono text-ink-200" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
            v0.1.0 — TUI Platform · 14 agent types
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="leading-[0.92] tracking-[-0.03em] font-normal"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(56px, 9vw, 110px)",
          }}
        >
          <span className="block text-white">Ship agents,</span>
          <span className="block">
            not <span className="gradient-text">wrappers.</span>
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="max-w-[560px] mx-auto mt-8 text-ink-100"
          style={{ fontSize: 16, lineHeight: 1.55 }}
        >
          A full operating system for autonomous AI agents — typed, observable,
          recoverable, and runnable from your terminal.
        </motion.p>

        <motion.div variants={fadeUp} className="flex items-center gap-3 justify-center mt-9 flex-wrap">
          <a href="#top" className="btn-landing-gradient flex items-center gap-2">
            <span>Install aegis</span>
            <span
              className="font-mono"
              style={{ fontSize: 11, background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}
            >
              ⌘
            </span>
          </a>
          <a
            href="https://github.com"
            className="btn-landing-outline flex items-center gap-2"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span>View on GitHub</span>
            <span className="font-mono text-ink-400">↗</span>
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-6 font-mono text-ink-400"
          style={{ fontSize: 10, letterSpacing: "0.2em" }}
        >
          SESSION-FIRST · LOCAL VAULT · ZERO DATA LEAKS
        </motion.div>
      </motion.div>

      <motion.div
        className="relative z-10 w-full max-w-[760px] mx-auto px-6 mt-16"
        initial={{ opacity: 0, y: 24 }}
        animate={mounted ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.5 }}
      >
        <TerminalBlock title="~/projects/aegis" lines={heroLines} glow="purple" />
      </motion.div>

      <motion.div
        className="relative z-10 w-full max-w-5xl mx-auto px-6 mt-20 mb-24"
        variants={stagger(0.06)}
        initial="hidden"
        animate={mounted ? "show" : "hidden"}
        style={{ transitionDelay: "700ms" }}
      >
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-px"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            overflow: "hidden",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {heroStats.map((s) => (
            <motion.div key={s.label} variants={fadeUp}>
              <MetricCard
                value={s.value}
                suffix={"suffix" in s ? s.suffix : undefined}
                label={s.label}
                gradient
              />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "HeroSection" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/HeroSection.tsx
git commit -m "feat(website): rewrite Hero with mesh bg, gradient headline, terminal, metric grid"
```

---

## Task 12: FeaturesGrid restyle

**Files:**
- Modify: `website/src/sections/FeaturesGrid.tsx`

- [ ] **Step 1: Read current file to preserve content (not modify copy)**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/FeaturesGrid.tsx`

- [ ] **Step 2: Replace wrapper styling only — preserve copy and feature data**

Apply these specific edits to `website/src/sections/FeaturesGrid.tsx`:

- Replace any section wrapper class containing `bg-black/85` or similar with: `relative w-full max-w-6xl mx-auto px-6`
- Replace any section header text with: use `SectionHeader` component with eyebrow `— FEATURES` (cyan tone), title `Everything you need. Nothing you don't.`, body `<existing body line>`
- Replace feature card class with: `glass-card glass-card-interactive p-7` on each card
- Replace feature icon containers with: `w-12 h-12 rounded-xl mb-5` with inline `style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4)', opacity: 0.9 }}`
- Wrap the section header and grid in: `<motion.div variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>` and wrap each card in `<motion.div variants={fadeUp}>`
- Add imports at top: `import { motion } from "framer-motion"`, `import { stagger, fadeUp } from "../lib/motion"`, `import SectionHeader from "../components/SectionHeader"`, `import GlassCard from "../components/GlassCard"`

**Note:** If the original file uses a 3-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), keep that structure. Apply the changes to all cards in the map.

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "FeaturesGrid" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/FeaturesGrid.tsx
git commit -m "feat(website): restyle FeaturesGrid with glass cards and gradient icons"
```

---

## Task 13: ArchitectureSection restyle

**Files:**
- Modify: `website/src/sections/ArchitectureSection.tsx`

- [ ] **Step 1: Read current file to preserve diagram/copy**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/ArchitectureSection.tsx`

- [ ] **Step 2: Apply restyle**

- Replace the outer section padding: `relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32`
- Replace section header with `SectionHeader` (cyan tone, eyebrow `— ARCHITECTURE`, title `From spawn to ship.`)
- For each architecture node in the diagram: wrap in `<motion.div variants={fadeUp} className="glass-card glass-card-interactive px-5 py-4">` (the `glass-card-interactive` class already provides the hover lift and border-color change defined in Task 2)
- Add connections between nodes using SVG with linearGradient def matching `gradient-brand` (purple→pink→cyan)
- Wrap the diagram in a `<motion.div variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>`
- Preserve any body copy blocks below the diagram — just update the type system (use `text-ink-300` for body)
- Add imports: `import { motion } from "framer-motion"`, `import { stagger, fadeUp } from "../lib/motion"`, `import SectionHeader from "../components/SectionHeader"`, `import GlassCard from "../components/GlassCard"`

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "ArchitectureSection" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/ArchitectureSection.tsx
git commit -m "feat(website): restyle ArchitectureSection with glass nodes and gradient flow"
```

---

## Task 14: TerminalDemo restyle

**Files:**
- Modify: `website/src/sections/TerminalDemo.tsx`

- [ ] **Step 1: Read current file to preserve line content**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/TerminalDemo.tsx`

- [ ] **Step 2: Apply restyle**

- Wrap the existing terminal block in `<TerminalBlock>` component (passing existing lines as the `lines` prop with proper `tone` and `prompt` fields — map to the new `TerminalTone` types)
- Replace the outer section with: `relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32`
- Above the terminal, add a `SectionHeader` (cyan tone, eyebrow `— LIVE`, title `<existing title line>`)
- Add a thin gradient progress bar (using `bg-gradient-brand` height-1 with `animate-pulse-soft`) below the terminal block
- Remove the `ScrollReveal` wrappers around the terminal; use the `TerminalBlock`'s built-in stagger reveal
- Add imports: `import SectionHeader from "../components/SectionHeader"`, `import TerminalBlock from "../components/TerminalBlock"`. Keep `ScrollReveal` if used elsewhere in the file.

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "TerminalDemo" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/TerminalDemo.tsx
git commit -m "feat(website): restyle TerminalDemo with TerminalBlock + section header"
```

---

## Task 15: MetricsSection restyle

**Files:**
- Modify: `website/src/sections/MetricsSection.tsx`

- [ ] **Step 1: Read current file**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/MetricsSection.tsx`

- [ ] **Step 2: Apply restyle**

- Replace the outer section with: `relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32`
- Replace section header with `SectionHeader` (cyan tone, eyebrow `— METRICS`, title `Built for scale. Benchmarked.`)
- For each metric stat: replace with `<MetricCard value={...} label={...} caption={...} gradient />` from the new component
- Wrap the grid in `<motion.div variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>` with `grid grid-cols-1 md:grid-cols-3 gap-5`
- Add imports: `import { motion } from "framer-motion"`, `import { stagger } from "../lib/motion"`, `import SectionHeader from "../components/SectionHeader"`, `import MetricCard from "../components/MetricCard"`. Remove the now-unused `ScrollReveal` import IF no longer used in the file.

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "MetricsSection" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/MetricsSection.tsx
git commit -m "feat(website): restyle MetricsSection with MetricCard animated counters"
```

---

## Task 16: TechStack restyle

**Files:**
- Modify: `website/src/sections/TechStack.tsx`

- [ ] **Step 1: Read current file**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/TechStack.tsx`

- [ ] **Step 2: Apply restyle**

- Replace the outer section with: `relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32`
- Replace section header with `SectionHeader` (cyan tone, eyebrow `— TECH STACK`, title `Built on shoulders.`, body `Bun · TypeScript · React 19 · Vite · Framer Motion · Tailwind CSS`)
- Replace each tech tile with: `<motion.div variants={fadeUp} className="glass-card-interactive aspect-square flex items-center justify-center p-6">` wrapping the existing logo/mark
- Add hover: `hover:border-white/30` and color transition on the logo to white
- Wrap grid in `<motion.div variants={stagger(0.06)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>` with `grid grid-cols-3 md:grid-cols-6 gap-3`
- Add imports: `import { motion } from "framer-motion"`, `import { stagger, fadeUp } from "../lib/motion"`, `import SectionHeader from "../components/SectionHeader"`. Remove the now-unused `ScrollReveal` import IF no longer used in the file.

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "TechStack" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/TechStack.tsx
git commit -m "feat(website): restyle TechStack with glass logo tiles"
```

---

## Task 17: CTASection restyle

**Files:**
- Modify: `website/src/sections/CTASection.tsx`

- [ ] **Step 1: Read current file**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/CTASection.tsx`

- [ ] **Step 2: Apply restyle**

- Replace the outer section with: `relative w-full px-6 py-24 md:py-32`
- The CTA panel itself becomes a `<div>` with: `max-w-6xl mx-auto glass-card p-12 md:p-20 text-center glass-card-glow-purple` and background overlay using `bg-gradient-brand` at low opacity
- Replace section h2 with: `serif-italic text-white` at `clamp(40px, 5vw, 64px)`, copy: `Stop wrapping. Start shipping.`
- Replace primary CTA with: `<a href="/" className="btn-landing-gradient mt-9 inline-flex items-center gap-2"><span>Install aegis</span><span className="font-mono" style={{ fontSize: 11, background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>⌘</span></a>`
- Add a row of 3 micro-stats below the CTA: `2-MIN SETUP`, `LOCAL-FIRST`, `MIT LICENSED` in `font-mono text-ink-400` `tracking-[0.18em]` at 10px
- Wrap entire content in `<motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }}>`
- Add imports: `import { motion } from "framer-motion"`, `import { fadeUp } from "../lib/motion"`. Remove `ScrollReveal` import IF no longer used.

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "CTASection" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/CTASection.tsx
git commit -m "feat(website): restyle CTASection with gradient panel and micro-stats"
```

---

## Task 18: Footer restyle

**Files:**
- Modify: `website/src/sections/Footer.tsx`

- [ ] **Step 1: Read current file**

Run: `cd "C:\neuron os" && Get-Content website/src/sections/Footer.tsx`

- [ ] **Step 2: Apply restyle**

- Replace the outer footer with: `<footer className="relative w-full border-t border-white/[0.06] bg-elevated/40 backdrop-blur-xl">` with inner `<div className="max-w-6xl mx-auto px-6 py-16">`
- Top row: 4 columns of link groups — preserve the existing link list structure, restyle each link to `text-ink-300 hover:text-white transition-colors text-[13px]`
- Bottom row: brand-cube + "Aegis · MIT · 2026" in `font-mono text-ink-400` at 11px
- Wrap the entire content in `<motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>`
- Add imports: `import { motion } from "framer-motion"`, `import { fadeUp } from "../lib/motion"`

- [ ] **Step 3: Typecheck**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "Footer" || echo "no errors"`
Expected: `no errors`

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add website/src/sections/Footer.tsx
git commit -m "feat(website): restyle Footer with glass surface and link columns"
```

---

## Task 19: App.tsx — remove GridBackground, apply mesh gradient

**Files:**
- Modify: `website/src/App.tsx`

- [ ] **Step 1: Replace file content**

```tsx
import Navbar from "./sections/Navbar"
import HeroSection from "./sections/HeroSection"
import FeaturesGrid from "./sections/FeaturesGrid"
import ArchitectureSection from "./sections/ArchitectureSection"
import TerminalDemo from "./sections/TerminalDemo"
import MetricsSection from "./sections/MetricsSection"
import TechStack from "./sections/TechStack"
import CTASection from "./sections/CTASection"
import Footer from "./sections/Footer"

export default function App() {
  return (
    <div className="min-h-screen bg-base text-white overflow-x-hidden font-body relative">
      <div className="noise-overlay" />

      <Navbar />
      <HeroSection />
      <div className="bg-base/85 backdrop-blur-md">
        <FeaturesGrid />
        <ArchitectureSection />
        <TerminalDemo />
        <MetricsSection />
        <TechStack />
        <CTASection />
        <Footer />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd "C:\neuron os\website" && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd "C:\neuron os"
git add website/src/App.tsx
git commit -m "feat(website): drop GridBackground, apply bg-base to App root"
```

---

## Task 20: Delete `GridBackground.tsx` and `sections/GradientText.tsx`

**Files:**
- Delete: `website/src/sections/GridBackground.tsx`
- Delete: `website/src/sections/GradientText.tsx` (replaced by `components/GradientText.tsx`)

- [ ] **Step 1: Delete the two files**

```bash
cd "C:\neuron os"
Remove-Item website/src/sections/GridBackground.tsx
Remove-Item website/src/sections/GradientText.tsx
```

- [ ] **Step 2: Verify no remaining imports**

Run: `cd "C:\neuron os" && Select-String -Path "website\src" -Pattern "GridBackground|sections/GradientText" -Recurse`
Expected: no matches

- [ ] **Step 3: Final typecheck + build**

Run: `cd "C:\neuron os\website" && bun run build 2>&1 | tail -20`
Expected: build completes, `dist/` is populated, no errors

- [ ] **Step 4: Commit**

```bash
cd "C:\neuron os"
git add -u website/src/sections/
git commit -m "chore(website): delete obsolete GridBackground and old GradientText"
```

---

## Task 21: `index.html` SEO update (meta description + JSON-LD)

**Files:**
- Modify: `website/index.html`

- [ ] **Step 1: Open `website/index.html`**

Read the current `<head>` to see the exact existing structure. The file currently has:
```html
<meta name="description" content="Neuron OS is a session-first AI orchestration platform with 14 agent types, 12 TUI modes, vector memory, and multi-provider streaming. Built for reproducibility and clarity." />
```

- [ ] **Step 2: Replace the `<meta name="description" ...>` line with:**

```html
<meta name="description" content="Ship agents, not wrappers. A full operating system for autonomous AI agents — typed, observable, recoverable, runnable from your terminal." />
```

- [ ] **Step 3: Add JSON-LD structured data just before the closing `</head>` tag**

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Neuron OS",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Windows, macOS, Linux",
  "description": "A full operating system for autonomous AI agents — typed, observable, recoverable, runnable from your terminal."
}
</script>
```

- [ ] **Step 4: Verify file is valid HTML**

Run: `cd "C:\neuron os\website" && Get-Content index.html | Select-String -Pattern "description|application/ld" | Select-Object -First 5`
Expected: 2 lines — one with `description` (the new copy) and one with `application/ld` (the JSON-LD)

- [ ] **Step 5: Commit**

```bash
cd "C:\neuron os"
git add website/index.html
git commit -m "feat(website): update meta description and add SoftwareApplication JSON-LD"
```

---

## Task 22: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `cd "C:\neuron os\website" && bun run typecheck 2>&1 | tail -10`
Expected: `tsc -b` exits 0, no errors

- [ ] **Step 2: Run full build**

Run: `cd "C:\neuron os\website" && bun run build 2>&1 | tail -10`
Expected: `tsc -b && vite build` exits 0, dist/ created

- [ ] **Step 3: Run lint**

Run: `cd "C:\neuron os\website" && bun run lint 2>&1 | tail -10`
Expected: no errors (warnings OK)

- [ ] **Step 4: Visual review in dev server**

Run: `cd "C:\neuron os\website" && bun run dev` and open `http://localhost:5173`.

Verify against the mockup at `http://localhost:64392/03-manu-arora-take.html`:

| Check | Expected |
|---|---|
| Background | Deep navy `#0a0a0f` with mesh gradient + 3 floating orbs |
| Navbar | Glassmorphic pill with gradient cube + "Aegis" + v0.1.0 badge |
| Hero headline | "Ship agents, not **wrappers.**" (gradient on wrappers) in Instrument Serif italic |
| Hero CTAs | Gradient "Install aegis" + glassmorphic "View on GitHub" |
| Trust line | DM Mono 10px "SESSION-FIRST · LOCAL VAULT · ZERO DATA LEAKS" |
| Hero terminal | Glassmorphic with purple glow, 4 lines, caret blinking |
| Hero metric grid | 4 cells with serif italic numbers (gradient) + DM Mono labels |
| Features section | Eyebrow `— FEATURES` (cyan), serif h2, glass cards with gradient icons |
| Architecture section | Eyebrow `— ARCHITECTURE`, glass nodes, gradient flow lines |
| Terminal demo | Eyebrow `— LIVE`, terminal with stagger reveal |
| Metrics section | Big gradient numerals that count up on scroll |
| Tech stack | Glass logo tiles in grid |
| CTA section | Gradient panel "Stop wrapping. Start shipping." |
| Footer | Glassmorphic, 4 link columns, gradient logo + Aegis · MIT · 2026 |
| Responsive | Layout works at 1440px, 1024px, 768px, 375px (test by resizing browser) |
| Reduced motion | Toggle OS reduced-motion setting; orbs and transitions should be disabled |

- [ ] **Step 5: Run final typecheck one more time**

Run: `cd "C:\neuron os\website" && bun run typecheck`
Expected: exits 0

- [ ] **Step 6: No commit needed — visual review confirms completion**

If issues found: fix in place, commit the fix with a clear message. Then re-run steps 1–5.

---

## Done

The landing page redesign is complete when all 21 tasks pass. The final state should match the Manu Arora mockup pushed to the brainstorm companion (`http://localhost:64392/03-manu-arora-take.html`).

If any task fails to typecheck or build, **do not proceed** — fix the failing task first, then continue.
