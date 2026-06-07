import pc from "picocolors"
import { palette } from "./palette"

// ── 24-bit true color helper ──────────────────────────────────────────

function hex(hexColor: string) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`
}

// ── Box-drawing characters ────────────────────────────────────────────

export const box = {
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
  h: "─",
  v: "│",
  dot: "·",
  bullet: "●",
  cross: "✕",
  check: "✓",
  arrow: "→",
} as const

// ── Theme colors ──────────────────────────────────────────────────────

export const theme = {
  // Color functions
  heading: (s: string) => pc.bold(hex(palette.accent)(s)),
  accent: hex(palette.accent),
  accentBright: hex(palette.accentBright),
  info: hex(palette.info),
  success: hex(palette.success),
  warn: hex(palette.warn),
  error: hex(palette.error),
  muted: hex(palette.muted),
  text: hex(palette.text),
  textBright: hex(palette.textBright),
  dim: pc.dim,
  bold: pc.bold,
  reset: pc.reset,

  // Palette values for direct use
  palette,
}
