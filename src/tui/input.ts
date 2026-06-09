import type { AppState } from "./store"
import { addLogEntry } from "./store"
import { saveConfig, loadConfig } from "../config"
import { loadSession, renameSession, listSessions, exportSession, deleteSession } from "../memory/sessionStore"

export type KeyEvent =
  | { type: "char"; char: string }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "enter" }
  | { type: "tab" }
  | { type: "escape" }
  | { type: "ctrl_q" }
  | { type: "ctrl_l" }
  | { type: "ctrl_c" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "home" }
  | { type: "end" }
  | { type: "page_up" }
  | { type: "page_down" }
  | { type: "unknown"; raw: string }

export function parseKey(raw: string): KeyEvent {
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
  if (raw === "\x0c") return { type: "ctrl_l" }
  if (raw === "\x03") return { type: "ctrl_c" }
  if (raw === "\r" || raw === "\n") return { type: "enter" }
  if (raw === "\t") return { type: "tab" }
  if (raw === "\x7f" || raw === "\b") return { type: "backspace" }
  if (raw.length === 1 && raw.charCodeAt(0) >= 32) {
    return { type: "char", char: raw }
  }
  return { type: "unknown", raw }
}

export async function handleKey(state: AppState, key: KeyEvent): Promise<"continue" | "quit" | "refresh"> {
  const ui = state.ui

  switch (key.type) {
    case "ctrl_q":
    case "ctrl_c":
      return "quit"

    case "tab": {
      switch (ui.focus) {
        case "log":
          ui.focus = "agents"
          break
        case "agents":
          ui.focus = "providers"
          break
        case "providers":
          ui.focus = "sessions"
          break
        case "sessions":
          ui.focus = "command"
          break
        case "command":
          ui.focus = "log"
          break
      }
      state.dirty = true
      return "refresh"
    }

    case "up": {
      if (ui.focus === "command") {
        if (ui.history.length > 0 && ui.historyIndex < ui.history.length - 1) {
          ui.historyIndex++
          ui.input = ui.history[ui.history.length - 1 - ui.historyIndex] ?? ""
        }
      } else if (ui.focus === "providers") {
        state.providerIndex = Math.max(0, (state.providerIndex ?? 0) - 1)
      } else if (ui.focus === "sessions") {
        state.sessionIndex = Math.max(0, (state.sessionIndex ?? 0) - 1)
      } else {
        ui.logScroll++
      }
      state.dirty = true
      return "refresh"
    }

    case "down": {
      if (ui.focus === "command") {
        if (ui.historyIndex > 0) {
          ui.historyIndex--
          ui.input = ui.history[ui.history.length - 1 - ui.historyIndex] ?? ""
        } else if (ui.historyIndex === 0) {
          ui.historyIndex = -1
          ui.input = ""
        }
      } else if (ui.focus === "providers") {
        state.providerIndex = Math.min((state.providers?.length ?? 1) - 1, (state.providerIndex ?? 0) + 1)
      } else if (ui.focus === "sessions") {
        state.sessionIndex = Math.min((state.sessions?.length ?? 1) - 1, (state.sessionIndex ?? 0) + 1)
      } else if (ui.logScroll > 0) {
        ui.logScroll--
      }
      state.dirty = true
      return "refresh"
    }

    case "page_up":
      ui.logScroll += 10
      state.dirty = true
      return "refresh"

    case "page_down":
      ui.logScroll = Math.max(0, ui.logScroll - 10)
      state.dirty = true
      return "refresh"

    case "enter": {
      if (ui.focus === "providers") {
        const idx = state.providerIndex ?? 0
        const list = state.providers ?? []
        const name = list[idx]
        if (name) {
          try {
            const cfg = loadConfig()
            cfg.provider = name
            saveConfig(cfg)
            addLogEntry(state, { text: `Provider set to ${name}`, type: "event" })
          } catch {
            addLogEntry(state, { text: `Provider set to ${name} (could not persist)`, type: "warn" })
          }
        }
        state.dirty = true
        return "refresh"
      }

      if (ui.focus === "sessions") {
        const idx = state.sessionIndex ?? 0
        const list = state.sessions ?? []
        const id = list[idx]
        if (id) {
          try {
            const rec = await loadSession(id)
            if (rec) {
              addLogEntry(state, { text: `Replaying session ${id} (${rec.createdAt})`, type: "event" })
              for (const m of rec.messages) {
                addLogEntry(state, { text: `[${m.role}] ${m.content}`, type: "info" })
              }
            } else {
              addLogEntry(state, { text: `Session not found: ${id}`, type: "warn" })
            }
          } catch (e) {
            addLogEntry(state, { text: `Failed to replay session: ${String(e)}`, type: "error" })
          }
        }
        state.dirty = true
        return "refresh"
      }

      if (ui.focus === "command" && ui.input.trim()) {
        // If a pending rename/export action exists, handle it here
        if (ui.pendingAction?.type === "rename") {
          const newId = ui.input.trim()
          const oldId = ui.pendingAction.sessionId
          try {
            await renameSession(oldId, newId)
            state.sessions = await listSessions()
            addLogEntry(state, { text: `Renamed session ${oldId} → ${newId}`, type: "success" })
          } catch (e) {
            addLogEntry(state, { text: `Failed to rename session: ${String(e)}`, type: "error" })
          }
          ui.pendingAction = undefined
          ui.input = ""
          state.dirty = true
          return "refresh"
        }

        if (ui.pendingAction?.type === "export") {
          const outPath = ui.input.trim()
          const id = ui.pendingAction.sessionId
          try {
            await exportSession(id, outPath)
            addLogEntry(state, { text: `Exported session ${id} → ${outPath}`, type: "success" })
          } catch (e) {
            addLogEntry(state, { text: `Failed to export session: ${String(e)}`, type: "error" })
          }
          ui.pendingAction = undefined
          ui.input = ""
          state.dirty = true
          return "refresh"
        }

        const cmd = ui.input.trim()
        ui.history.push(cmd)
        if (ui.history.length > 100) ui.history.shift()
        ui.historyIndex = -1
        ui.input = ""
        state.dirty = true
        return "continue"
      }

      state.dirty = true
      return "refresh"
    }

    case "backspace":
      if (ui.focus === "command" && ui.input.length > 0) {
        ui.input = ui.input.slice(0, -1)
        state.dirty = true
      }
      return "refresh"

    case "char":
      if (ui.focus === "command") {
        // If a pending delete confirmation exists, accept y/n here
        if (ui.pendingAction?.type === "delete") {
          const c = key.char.toLowerCase()
          if (c === "y") {
            const id = ui.pendingAction.sessionId
            try {
              await deleteSession(id)
              state.sessions = await listSessions()
              addLogEntry(state, { text: `Deleted session ${id}`, type: "success" })
            } catch (e) {
              addLogEntry(state, { text: `Failed to delete session: ${String(e)}`, type: "error" })
            }
            ui.pendingAction = undefined
            state.dirty = true
            return "refresh"
          } else if (c === "n") {
            addLogEntry(state, { text: `Delete cancelled`, type: "info" })
            ui.pendingAction = undefined
            state.dirty = true
            return "refresh"
          }
        }
        ui.input += key.char
        state.dirty = true
      } else if (ui.focus === "sessions") {
        // handle quick action keys in sessions focus: d=delete, r=rename, e=export
        const c = key.char.toLowerCase()
        const idx = state.sessionIndex ?? 0
        const list = state.sessions ?? []
        const id = list[idx]
        if (!id) return "refresh"
        if (c === "d") {
          ui.pendingAction = { type: "delete", sessionId: id }
          addLogEntry(state, { text: `Confirm delete ${id}. Press 'y' to confirm or 'n' to cancel.`, type: "warn" })
          state.dirty = true
          return "refresh"
        }
        if (c === "r") {
          ui.pendingAction = { type: "rename", sessionId: id }
          ui.focus = "command"
          ui.input = id
          addLogEntry(state, {
            text: `Edit the name in the command bar and press Enter to rename (current: ${id})`,
            type: "event",
          })
          state.dirty = true
          return "refresh"
        }
        if (c === "e") {
          ui.pendingAction = { type: "export", sessionId: id }
          ui.focus = "command"
          ui.input = `exports/${id}.json`
          addLogEntry(state, {
            text: `Edit export path in the command bar and press Enter to export (suggested: exports/${id}.json)`,
            type: "event",
          })
          state.dirty = true
          return "refresh"
        }
      }
      return "refresh"

    case "escape":
    case "home":
    case "end":
    case "delete":
    case "left":
    case "right":
      state.dirty = true
      return "refresh"

    default:
      return "refresh"
  }
}
