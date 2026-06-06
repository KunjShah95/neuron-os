import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"

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
