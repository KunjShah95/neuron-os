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
