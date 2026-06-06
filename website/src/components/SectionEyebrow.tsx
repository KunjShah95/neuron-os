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
