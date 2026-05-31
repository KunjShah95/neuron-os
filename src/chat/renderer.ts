import ansiEscapes from "ansi-escapes"
import { calculateChatLayout } from "./layout"
import { renderChatHeader, renderMessages, renderInputArea, renderChatHint } from "./components"
import { createInitialChatState, loadChatStateFromSession, addUserMessage, addAssistantMessage, finalizeStreamingMessage, saveChatSession } from "./store"
import type { ChatState } from "./store"
import { parseChatKey, handleChatKey } from "./input"
import { streamResponse, createEngine } from "./provider"
import { listProviders } from "../ai/providers"
import { saveConfig, loadConfig } from "../config"
import type { AgentTypeName } from "../agent/agent-types"

export async function startChat(agentType?: AgentTypeName) {
  const state = createInitialChatState(agentType)
  // Create a lazy engine below when sending so that runtime config from state can be used.
  let engine = createEngine(agentType)
  const rows = process.stdout.rows ?? 24
  const cols = process.stdout.columns ?? 80

  // Guard: TTY required
  if (!process.stdout.isTTY) {
    console.error("Chat requires a TTY terminal")
    process.exit(1)
  }

  // Persist session start
  saveChatSession(state)

  // Enter alternate screen
  process.stdout.write(ansiEscapes.enterAlternativeScreen)

  // Set raw mode
  const wasRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  let running = true
  let cleanedUp = false
  let frameTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null

  // Handle incoming keystrokes
  const onData = async (raw: string) => {
    const key = parseChatKey(raw)
    const result = handleChatKey(state, key)

    switch (result) {
      case "quit":
        abortController?.abort()
        running = false
        break

      case "cancel_stream":
        abortController?.abort()
        finalizeStreamingMessage(state)
        state.dirty = true
        break

      case "send": {
        const text = state.ui.input.trim()
        if (!text) break
        // Special slash commands for runtime configuration
        if (text.startsWith("/provider")) {
          // Commands:
          // /provider list
          // /provider set <name> [model=<model>]
          const parts = text.split(/\s+/)
          if (parts[1] === "list") {
            const names = listProviders().join(", ")
            addUserMessage(state, text)
            addAssistantMessage(state)
            // show a short assistant message with available providers
            // finalize immediately rather than streaming
            const last = state.messages[state.messages.length - 1]
            if (last) {
              last.content = `Available providers: ${names}`
              last.status = "complete"
            }
            state.dirty = true
            break
          }
          if (parts[1] === "set") {
            const name = parts[2]
            if (!name) {
              addUserMessage(state, text)
              addAssistantMessage(state)
              const last = state.messages[state.messages.length - 1]
              if (last) {
                last.content = `Usage: /provider set <name> [model=<model>]`
                last.status = "complete"
              }
              state.dirty = true
              break
            }
            // optional model=...
            let model: string | undefined
            for (const p of parts.slice(3)) {
              const m = p.match(/^model=(.+)$/)
              if (m) model = m[1]
            }
            // update chat state config
            state.config.provider = name
            if (model) state.config.model = model

            const cfg = loadConfig()
            cfg.provider = name
            if (model) cfg.model = model
            saveConfig(cfg)

            addUserMessage(state, text)
            addAssistantMessage(state)
            const last2 = state.messages[state.messages.length - 1]
            if (last2) {
              last2.content = `Provider set to ${name}${model ? ` (model=${model})` : ""}`
              last2.status = "complete"
            }
            state.dirty = true
            break
          }
        }

        if (text === "/clear") {
          const oldSessionId = state.sessionId
          const oldAgentType = state.agentType
          Object.assign(state, createInitialChatState(oldAgentType))
          state.sessionId = oldSessionId
          state.dirty = true
          break
        }

        if (text.startsWith("/sessions")) {
          const parts = text.split(/\s+/)
          if (parts[1] === "list") {
            const { listSessions, loadSession } = await import("../memory/sessionStore")
            const ids = await listSessions()
            const summaries: string[] = []
            for (const id of ids.slice(-10).reverse()) {
              const rec = await loadSession(id)
              if (rec) {
                const msgCount = rec.messages.length
                const lastMsg = rec.messages[msgCount - 1]?.content.slice(0, 60) || ""
                summaries.push(`${id} (${msgCount} msgs) — "${lastMsg}"`)
              }
            }
            addUserMessage(state, text)
            addAssistantMessage(state)
            const last = state.messages[state.messages.length - 1]
            if (last) {
              last.content = summaries.length
                ? `Recent sessions:\n${summaries.join("\n")}\n\nUse /sessions load <id> to resume a session.`
                : "No saved sessions found."
              last.status = "complete"
            }
            state.dirty = true
            break
          }
          if (parts[1] === "load") {
            const id = parts[2]
            if (!id) {
              addUserMessage(state, text)
              addAssistantMessage(state)
              const last = state.messages[state.messages.length - 1]
              if (last) { last.content = "Usage: /sessions load <session-id>"; last.status = "complete" }
              state.dirty = true
              break
            }
            const { loadSession } = await import("../memory/sessionStore")
            const rec = await loadSession(id)
            if (!rec) {
              addUserMessage(state, text)
              addAssistantMessage(state)
              const last = state.messages[state.messages.length - 1]
              if (last) { last.content = `Session "${id}" not found.`; last.status = "complete" }
              state.dirty = true
              break
            }
            const loaded = loadChatStateFromSession(id, rec, state.agentType)
            loaded.ui.history = state.ui.history
            Object.assign(state, loaded)
            state.dirty = true
            break
          }
        }

        addUserMessage(state, text)
        addAssistantMessage(state)

        // Build engine using latest runtime config stored in state
        try {
          const override: any = {}
          if (state.config.provider) override.provider = state.config.provider
          if (state.config.model) override.model = state.config.model
          if (state.config.maxTokens) override.maxTokens = state.config.maxTokens
          engine = createEngine(agentType, override)
        } catch (e) {
          // fall back to previously created engine
        }

        // Start streaming
        abortController = new AbortController()
        streamResponse(state, engine, abortController.signal)
        state.dirty = true
        break
      }

      case "newline":
      case "continue":
        state.dirty = true
        break
    }
  }

  process.stdin.on("data", onData)

  // Render loop
  async function render() {
    if (!running) return cleanup()

    if (state.dirty) {
      const layout = calculateChatLayout(rows, cols, state.ui.inputLines)

      let output = ansiEscapes.cursorHide
      output += ansiEscapes.cursorTo(0, 0)

      // Header
      output += renderChatHeader(layout.header) + "\n"

      // Messages viewport
      const messageLines = renderMessages(state, layout.messages)
      for (let y = 0; y < layout.messages.height; y++) {
        output += ansiEscapes.cursorTo(layout.messages.x, layout.messages.y + y)
        output += messageLines[y] ?? ""
      }

      // Input area
      const inputLines = renderInputArea(state, layout.input)
      for (let y = 0; y < layout.input.height; y++) {
        output += ansiEscapes.cursorTo(layout.input.x, layout.input.y + y)
        output += inputLines[y] ?? ""
      }

      // Hint line
      output += ansiEscapes.cursorTo(0, layout.hint.y)
      output += renderChatHint(state, layout.hint)

      // Position cursor at the correct position in the input
      const cursorX = Math.min(state.ui.cursorCol + 2, layout.input.width - 1)
      const cursorY = Math.min(state.ui.cursorRow, layout.input.height - 1)
      output += ansiEscapes.cursorTo(cursorX, layout.input.y + cursorY)
      output += ansiEscapes.cursorShow

      process.stdout.write(output)
      state.dirty = false
    }

    frameTimer = setTimeout(render, 50) // 20fps for smoother streaming
  }

  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    abortController?.abort()
    if (frameTimer) clearTimeout(frameTimer)
    process.off("SIGINT", cleanup)
    process.off("SIGTERM", cleanup)
    process.stdin.off("data", onData)
    try {
      process.stdin.setRawMode(wasRaw ?? false)
    } catch { /* ignore */ }
    process.stdin.pause()
    saveChatSession(state)
    process.stdout.write(ansiEscapes.exitAlternativeScreen)
    process.stdout.write(ansiEscapes.cursorShow)
    process.exit(0)
  }

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  render()
}
