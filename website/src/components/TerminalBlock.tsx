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
  glow?: "none" | "accent"
  className?: string
  showCaret?: boolean
}

const toneClass: Record<TerminalTone, string> = {
  default: "text-white",
  success: "text-green-400",
  warning: "text-amber-400",
  info: "text-blue-400",
  muted: "text-neutral-500",
}

const promptColor = "text-blue-400"

export default function TerminalBlock({
  title,
  lines,
  glow = "none",
  className = "",
  showCaret = true,
}: TerminalBlockProps) {
  return (
    <div
      className={`rounded-2xl overflow-hidden border border-white/[0.06] ${className}`}
      style={{
        background: "rgba(10,10,10,0.6)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: glow === "accent" ? "0 0 60px -20px rgba(59,130,246,0.3)" : "none",
      }}
    >
      {title !== undefined && (
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]"
        >
          <span className="w-2 h-2 rounded-full bg-white/20" />
          <span className="w-2 h-2 rounded-full bg-white/20" />
          <span className="w-2 h-2 rounded-full bg-white/20" />
          {title && (
            <span
              className="ml-3 font-mono text-neutral-500 text-xs"
            >
              {title}
            </span>
          )}
        </div>
      )}
      <motion.div
        className="px-5 py-5 font-mono text-[13px] leading-relaxed"
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
                <span className={promptColor}>{line.prompt} </span>
              )}
              {line.prefix && (
                <span className="text-neutral-600">{line.prefix} </span>
              )}
              <span className={cls}>{line.text}</span>
              {isLast && showCaret && (
                <span
                  className="inline-block ml-0.5 w-1.5 h-3.5 align-middle bg-white/70"
                  style={{ animation: "caret-blink 1s step-end infinite" }}
                />
              )}
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
