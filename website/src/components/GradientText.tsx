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
