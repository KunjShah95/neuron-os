import ansiEscapes from "ansi-escapes"
import { theme } from "../theme"

export interface MenuItem {
  value: string
  label: string
  hint?: string
  children?: MenuItem[]
}

export interface MenuLevel {
  title: string
  items: MenuItem[]
  selected: number
}

export interface MenuState {
  path: MenuLevel[]
  current: MenuLevel
}

export type MenuResult =
  | { action: "select"; value: string; path: string[] }
  | { action: "quit" }

function renderMenu(state: MenuState): string {
  let output = ""

  output += ansiEscapes.eraseScreen
  output += ansiEscapes.cursorTo(0, 0)

  for (const level of state.path) {
    const selectedItem = level.items[level.selected]
    output += theme.muted(`  ${level.title}: `) + theme.info(selectedItem?.label ?? "") + "\n"
  }

  output += `\n${theme.accent("\u25C6")} ${theme.bold(state.current.title)}\n\n`

  for (let i = 0; i < state.current.items.length; i++) {
    const item = state.current.items[i]!
    const isSelected = i === state.current.selected
    const bullet = isSelected ? theme.accent("\u25CF ") : theme.muted("\u25CB ")
    const label = isSelected ? theme.bold(item.label) : item.label
    const hint = isSelected && item.hint ? theme.muted(`  ${item.hint}`) : ""

    output += `  ${bullet}${label}${hint}\n`
  }

  output += `\n${theme.muted("  \u2191\u2193 navigate  Enter select  Esc back  Ctrl+Q quit")}`

  return output
}

function parseKey(raw: string): string {
  if (raw === "\x1b[A") return "up"
  if (raw === "\x1b[B") return "down"
  if (raw === "\x1b[C") return "right"
  if (raw === "\x1b[D") return "left"
  if (raw === "\r" || raw === "\n") return "enter"
  if (raw === "\x1b") return "escape"
  if (raw === "\x11") return "ctrl_q"
  if (raw === "\x03") return "ctrl_c"
  return "unknown"
}

export async function runMenu(items: MenuItem[], title?: string): Promise<MenuResult> {
  if (!process.stdin.isTTY) {
    console.error("Menu requires a TTY terminal")
    process.exit(1)
  }

  const menuTitle = title ?? "Aegis Menu"
  const state: MenuState = {
    path: [],
    current: {
      title: menuTitle,
      items,
      selected: 0,
    },
  }

  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  process.stdout.write(ansiEscapes.enterAlternativeScreen)
  process.stdout.write(ansiEscapes.cursorHide)

  let running = true
  let result: MenuResult | null = null

  function render(_state: MenuState) {
    let out = ansiEscapes.cursorHide
    out += ansiEscapes.eraseScreen
    out += renderMenu(_state)
    out += ansiEscapes.cursorShow
    process.stdout.write(out)
  }

  const onData = (raw: string) => {
    if (!running) return

    const maxIdx = state.current.items.length - 1

    switch (parseKey(raw)) {
      case "up":
        state.current.selected = Math.max(0, state.current.selected - 1)
        render(state)
        break

      case "down":
        state.current.selected = Math.min(maxIdx, state.current.selected + 1)
        render(state)
        break

      case "enter": {
        const selected = state.current.items[state.current.selected]!

        if (selected.value === "__back__") {
          const parent = state.path.pop()
          if (parent) {
            state.current = parent
            render(state)
          }
          break
        }

        if (selected.children && selected.children.length > 0) {
          const backItem: MenuItem = {
            value: "__back__",
            label: "\u2190 Back to main menu",
          }
          state.path.push({ ...state.current })
          state.current = {
            title: `Choose ${selected.label}`,
            items: [...selected.children, backItem],
            selected: 0,
          }
          render(state)
        } else {
          const pathLabels = state.path.map((p) => {
            const item = p.items[p.selected]
            return item?.label ?? ""
          })
          running = false
          result = { action: "select", value: selected.value, path: [...pathLabels, selected.label] }
        }
        break
      }

      case "escape": {
        const parent = state.path.pop()
        if (parent) {
          state.current = parent
          render(state)
        } else {
          running = false
          result = { action: "quit" }
        }
        break
      }

      case "ctrl_c":
      case "ctrl_q":
        running = false
        result = { action: "quit" }
        break
    }
  }

  process.stdin.on("data", onData)

  render(state)

  await new Promise<void>((resolve) => {
    const check = () => {
      if (!running) {
        resolve()
      } else {
        setTimeout(check, 50)
      }
    }
    check()
  })

  process.stdin.off("data", onData)
  try {
    process.stdin.setRawMode(wasRaw ?? false)
  } catch { /* ignore */ }
  process.stdout.write(ansiEscapes.exitAlternativeScreen)
  process.stdout.write(ansiEscapes.cursorShow)

  return result ?? { action: "quit" }
}
