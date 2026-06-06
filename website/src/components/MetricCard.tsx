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
