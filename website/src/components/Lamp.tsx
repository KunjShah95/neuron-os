import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface LampContainerProps {
  children: ReactNode
  className?: string
}

export function LampContainer({ children, className = "" }: LampContainerProps) {
  return (
    <div
      className={`relative flex min-h-[calc(100vh-4rem)] w-full flex-col items-center justify-center overflow-hidden bg-base ${className}`}
    >
      <div className="lamp-glow" />
      <div className="lamp-cone" />

      <div className="relative z-10 flex w-full flex-col items-center justify-center px-6 py-24">
        {children}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{
          background: "linear-gradient(180deg, transparent 0%, #000 100%)",
        }}
      />
    </div>
  )
}

export function LampEffect() {
  return (
    <motion.div
      initial={{ opacity: 0.5, width: "15rem" }}
      whileInView={{ opacity: 1, width: "30rem" }}
      transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 bg-gradient-to-r from-transparent via-accent-light to-transparent"
    />
  )
}
