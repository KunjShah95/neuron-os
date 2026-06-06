import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { EASE_OUT_EXPO, stagger, fadeUp } from "../lib/motion"
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
            href="https://github.com/KunjShah95/neuron-os"
            target="_blank"
            rel="noopener noreferrer"
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
