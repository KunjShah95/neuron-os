import SectionEyebrow from "./SectionEyebrow"

interface SectionHeaderProps {
  eyebrow?: string
  title: React.ReactNode
  body?: React.ReactNode
  align?: "left" | "center"
  tone?: "muted" | "cyan"
  className?: string
}

export default function SectionHeader({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "muted",
  className = "",
}: SectionHeaderProps) {
  const wrapperAlign = align === "center" ? "text-center mx-auto" : "text-left"
  return (
    <header className={`max-w-3xl ${wrapperAlign} ${className}`}>
      {eyebrow && <SectionEyebrow tone={tone}>{eyebrow}</SectionEyebrow>}
      {eyebrow && <div className="h-4" />}
      <h2
        className="serif-italic text-white"
        style={{
          fontSize: "clamp(40px, 5vw, 64px)",
          lineHeight: 0.98,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      {body && (
        <>
          <div className="h-5" />
          <p
            className="text-ink-300"
            style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}
          >
            {body}
          </p>
        </>
      )}
    </header>
  )
}
