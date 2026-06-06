import { useEffect, useRef, useState } from "react"

const stats = [
  { value: "14", label: "Agent Types" },
  { value: "12", label: "TUI Modes" },
  { value: "8", label: "Built-in Tools" },
  { value: "5", label: "AI Providers" },
]

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export default function HeroSection() {
  const [mounted, setMounted] = useState(false)
  const videoBgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Subtle mouse parallax on the radial light
  useEffect(() => {
    const el = videoBgRef.current
    if (!el) return

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let rafId: number

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
      className="relative w-full min-h-screen flex flex-col justify-between items-center overflow-hidden"
    >
      {/* Atmospheric light (wanderful-style fixed background) */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div ref={videoBgRef} className="w-full h-full transition-transform duration-200">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 35%, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 45%, transparent 75%)",
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
      </div>

      {/* Headline */}
      <div
        className={`w-full text-center fade-enter mt-[120px] relative z-20 ${mounted ? "visible" : ""}`}
      >
        <h1
          className="leading-[1.1] tracking-[-0.02em] font-normal px-6"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "clamp(36px, 5.4vw, 72px)",
          }}
        >
          <span className="block text-white">An operating system</span>
          <span className="block" style={{ color: "rgba(255,255,255,0.5)" }}>
            for autonomous agents.
          </span>
        </h1>
      </div>

      {/* Bottom block */}
      <div
        className={`flex flex-col items-center gap-6 mb-14 fade-enter relative z-20 ${mounted ? "visible" : ""}`}
        style={{ transitionDelay: "300ms" }}
      >
        <p className="max-w-[640px] text-[15px] leading-relaxed text-center px-6 text-ink-100">
          Neuron OS records, replays, and ships agent-driven workflows with a
          developer-first dashboard.{" "}
          <span style={{ color: "rgba(255,255,255,0.45)" }}>
            {" "}14 specialized agent types. Vector memory. Multi-provider streaming. All in one session.
          </span>
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <button
            onClick={() => {
              const el = document.getElementById("demo")
              if (el) el.scrollIntoView({ behavior: "smooth" })
            }}
            className="bg-white text-black text-[15px] font-medium rounded-full px-8 py-3.5 transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_32px_4px_rgba(255,255,255,0.2)] active:scale-[0.97]"
          >
            See it in action
          </button>
          <a
            href="/"
            className="liquid-glass rounded-full px-6 py-3.5 text-[13px] font-medium text-white/85 hover:text-white transition-colors"
          >
            Open Console →
          </a>
        </div>

        {/* Trust row */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-white/55">
            <LockIcon />
          </span>
          <span className="text-[10px] font-medium tracking-[0.18em] text-white/55 font-mono">
            SESSION-FIRST. ZERO DATA LEAKS. LOCAL VAULT.
          </span>
        </div>
      </div>

      {/* Stats (subtle, mid-page) */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 pointer-events-none fade-enter ${mounted ? "visible" : ""}`}
        style={{ transitionDelay: "700ms" }}
      >
        <div className="max-w-5xl mx-auto px-6 pb-32">
          <div className="grid grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div
                  className="text-2xl md:text-3xl text-white/85 num-display"
                  style={{ fontWeight: 500 }}
                >
                  {stat.value}
                </div>
                <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] mt-1 font-mono">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
