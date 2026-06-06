import type { Variants } from "framer-motion"

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]
export const EASE_IN_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE_OUT_EXPO } },
}

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(10px)" },
  show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE_OUT_EXPO } },
}

export const stagger = (delay = 0.08): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
})

export const inViewport = (amount = 0.2) => ({
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, amount },
})

export const orbFloat = (i: number) => ({
  animate: {
    x: [0, 30 * (i % 2 ? 1 : -1), 0],
    y: [0, -20 * (i % 2 ? -1 : 1), 0],
    scale: [1, 1.08, 1],
    transition: {
      duration: 18 + i * 4,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  },
})
