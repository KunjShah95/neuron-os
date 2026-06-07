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

export default function GlassCard({
  children,
  glow = "none",
  className = "",
  as: Tag = "div",
  style,
}: GlassCardProps) {
  const glowClass = glow !== "none" ? `glass-card-glow-${glow}` : ""

  return (
    <Tag
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl ${glowClass} ${className}`}
      style={{
        ...style,
        position: "relative",
      }}
    >
      <div className="relative z-[1]">{children}</div>
    </Tag>
  )
}
