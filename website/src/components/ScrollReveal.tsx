import { useEffect, useRef, useState } from "react"

type Variant = "fade-up" | "fade-left" | "fade-right" | "blur-in" | "scale-up"

interface ScrollRevealProps {
  children: React.ReactNode
  variant?: Variant
  delay?: number
  duration?: number
  className?: string
}

export default function ScrollReveal({
  children,
  variant = "fade-up",
  delay = 0,
  duration = 0.7,
  className = "",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const variantStyles: Record<Variant, { from: React.CSSProperties; to: React.CSSProperties }> = {
    "fade-up": {
      from: { opacity: 0, transform: "translateY(30px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
    "fade-left": {
      from: { opacity: 0, transform: "translateX(-30px)" },
      to: { opacity: 1, transform: "translateX(0)" },
    },
    "fade-right": {
      from: { opacity: 0, transform: "translateX(30px)" },
      to: { opacity: 1, transform: "translateX(0)" },
    },
    "blur-in": {
      from: { opacity: 0, filter: "blur(10px)" },
      to: { opacity: 1, filter: "blur(0px)" },
    },
    "scale-up": {
      from: { opacity: 0, transform: "scale(0.96)" },
      to: { opacity: 1, transform: "scale(1)" },
    },
  }

  const { from, to } = variantStyles[variant]

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...(isVisible ? to : from),
        transition: `all ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  )
}
