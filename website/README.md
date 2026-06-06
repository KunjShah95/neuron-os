# Aegis / Neuron OS — Marketing Website

Standalone marketing site for Neuron OS. Wanderful-style design language:
liquid glass surfaces, cinematic black palette, Inter + Barlow + Instrument Serif
typography, framer-motion micro-interactions.

## Stack
- Vite 6 + React 19 + TypeScript
- Tailwind CSS 3
- framer-motion

## Scripts
```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

## Structure
```
src/
  App.tsx                # Composes the page
  main.tsx               # React root
  index.css              # Tailwind base + liquid-glass utilities
  components/
    ScrollReveal.tsx     # IntersectionObserver-driven reveal wrapper
  sections/
    Navbar.tsx
    HeroSection.tsx
    FeaturesGrid.tsx
    ArchitectureSection.tsx
    TerminalDemo.tsx
    MetricsSection.tsx
    TechStack.tsx
    CTASection.tsx
    Footer.tsx
    GridBackground.tsx
    GradientText.tsx
```
