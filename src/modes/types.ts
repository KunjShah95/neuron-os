export type KeyEvent =
  | { type: "char"; char: string }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "enter" }
  | { type: "tab" }
  | { type: "escape" }
  | { type: "ctrl_p" }
  | { type: "ctrl_q" }
  | { type: "ctrl_c" }
  | { type: "ctrl_l" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "home" }
  | { type: "end" }
  | { type: "page_up" }
  | { type: "page_down" }
  | { type: "unknown"; raw: string }

export function parseKey(raw: string): KeyEvent {
  if (raw === "\x10") return { type: "ctrl_p" }
  if (raw === "\x1b[A") return { type: "up" }
  if (raw === "\x1b[B") return { type: "down" }
  if (raw === "\x1b[C") return { type: "right" }
  if (raw === "\x1b[D") return { type: "left" }
  if (raw === "\x1b[5~") return { type: "page_up" }
  if (raw === "\x1b[6~") return { type: "page_down" }
  if (raw === "\x1b[H") return { type: "home" }
  if (raw === "\x1b[F") return { type: "end" }
  if (raw === "\x1b[3~") return { type: "delete" }
  if (raw === "\x1b") return { type: "escape" }
  if (raw === "\x11") return { type: "ctrl_q" }
  if (raw === "\x03") return { type: "ctrl_c" }
  if (raw === "\x0c") return { type: "ctrl_l" }
  if (raw === "\r" || raw === "\n") return { type: "enter" }
  if (raw === "\t") return { type: "tab" }
  if (raw === "\x7f" || raw === "\b") return { type: "backspace" }
  if (raw.length === 1 && raw.charCodeAt(0) >= 32) return { type: "char", char: raw }
  return { type: "unknown", raw }
}

export interface Mode {
  id: string
  name: string
  description: string
  run(): Promise<"back" | "quit">
}
