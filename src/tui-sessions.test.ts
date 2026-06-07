import { describe, it } from "bun:test"
import { createInitialState } from "./tui/store"
import { renderProviders } from "./tui/components/providers"
import { renderSessions } from "./tui/components/sessions"
import { listProviders } from "./ai/providers"
import { saveSession, listSessions, loadSession } from "./memory/sessionStore"

describe("Tui Sessions Tests", () => {
  it("should render providers", async () => {
    const state = createInitialState()
    state.providers = listProviders()
    const out = renderProviders(state, { x: 0, y: 0, width: 60, height: 20 })
    if (state.providers.length === 0) throw new Error("Expected at least one provider registered")
    // Ensure that the provider names appear in the rendered output
    for (const p of state.providers) {
      if (!out.some((l) => l.includes(p))) throw new Error(`Rendered providers missing ${p}`)
    }
    console.log("testRenderProviders OK")
  })

  it("should sessions flow", async () => {
    const id = `test-session-${Date.now()}`
    const record = {
      id,
      createdAt: new Date().toISOString(),
      messages: [
        { role: "user", content: "Hello", timestamp: new Date().toISOString(), status: "done" },
        { role: "assistant", content: "Hi", timestamp: new Date().toISOString(), status: "done" },
      ],
    }
    await saveSession(record as any)
    const list = await listSessions()
    if (!list.includes(id)) throw new Error("Saved session not listed")
    const loaded = await loadSession(id)
    if (!loaded) throw new Error("Failed to load saved session")
    if (loaded.messages.length !== 2) throw new Error("Loaded session has wrong message count")

    const state = createInitialState()
    state.sessions = await listSessions()
    const out = renderSessions(state, { x: 0, y: 0, width: 60, height: 20 })
    if (!out.some((l) => l.includes(id))) throw new Error("Rendered sessions missing saved id")

    console.log("testSessionsFlow OK")
  })
})
