export type MessageRole = "user" | "assistant" | "system"

export interface ChatMessage {
  role: MessageRole
  content: string
  timestamp: string
  status: "complete" | "streaming" | "error"
}

export type PickerItem =
  | { kind: "provider"; name: string; active: boolean }
  | { kind: "model"; provider: string; id: string; label: string }

export interface ChatUIState {
  /** The current input buffer (supports multiline) */
  input: string
  /** Cursor position within the input */
  cursorCol: number
  cursorRow: number
  /** Number of visible lines the input occupies */
  inputLines: number
  /** Scroll offset for message history */
  scrollOffset: number
  /** Whether we're currently awaiting a streaming response */
  isStreaming: boolean
  /** Whether we've scrolled up from the latest message */
  scrolledUp: boolean
  /** Input history (submitted messages) */
  history: string[]
  historyIndex: number
<<<<<<< HEAD
=======
  /** Model picker overlay state */
>>>>>>> 908905d (feat: implement model picker functionality and UI rendering)
  showPicker: boolean
  pickerItems: PickerItem[]
  pickerIndex: number
}

export type PickerItem =
  | { kind: "provider"; name: string; active: boolean }
  | { kind: "model"; provider: string; id: string; label: string }

export interface ChatState {
  messages: ChatMessage[]
  ui: ChatUIState
  dirty: boolean
  agentType?: string
<<<<<<< HEAD
  sessionId: string
=======
  sessionId?: string
>>>>>>> 908905d (feat: implement model picker functionality and UI rendering)
  config: {
    provider?: string
    model: string
    baseUrl?: string
    apiKey?: string
    maxTokens: number
    baseUrl?: string
    apiKey?: string
  }
}

let sessionCounter = 0

function generateSessionId(agentType?: string): string {
  sessionCounter++
  const datePart = new Date().toISOString().slice(0, 10)
  const typePart = agentType || "chat"
  return `${typePart}-${datePart}-${sessionCounter}`
}

export function createInitialChatState(agentType?: string): ChatState {
  return {
    messages: [
      {
        role: "assistant",
        content: agentType 
          ? `Hello! I'm Aegis AI (${agentType} mode). How can I help you today?\n\nTry asking me to write code, explain concepts, or help with your projects.`
          : "Hello! I'm Aegis AI. How can I help you today?\n\nTry asking me to write code, explain concepts, or help with your projects.",
        timestamp: new Date().toLocaleTimeString(),
        status: "complete",
      },
    ],
    ui: {
      input: "",
      cursorCol: 0,
      cursorRow: 0,
      inputLines: 1,
      scrollOffset: 0,
      isStreaming: false,
      scrolledUp: false,
      history: [],
      historyIndex: -1,
      showPicker: false,
      pickerItems: [],
      pickerIndex: 0,
    },
    dirty: true,
    agentType,
    sessionId: generateSessionId(agentType),
    config: {
      model: "claude-sonnet-4-20250514",
      maxTokens: 8192,
    },
  }
}

export function addUserMessage(state: ChatState, text: string) {
  state.messages.push({
    role: "user",
    content: text,
    timestamp: new Date().toLocaleTimeString(),
    status: "complete",
  })
  state.ui.history.push(text)
  if (state.ui.history.length > 100) state.ui.history.shift()
  state.ui.historyIndex = -1
  state.ui.input = ""
  state.ui.cursorCol = 0
  state.ui.cursorRow = 0
  state.ui.inputLines = 1
  state.ui.scrolledUp = false
  state.ui.scrollOffset = 0
  state.dirty = true
}

export function addAssistantMessage(state: ChatState) {
  state.messages.push({
    role: "assistant",
    content: "",
    timestamp: new Date().toLocaleTimeString(),
    status: "streaming",
  })
  state.ui.isStreaming = true
  state.ui.scrolledUp = false
  state.ui.scrollOffset = 0
  state.dirty = true
}

export function appendToStreamingMessage(state: ChatState, text: string) {
  const last = state.messages[state.messages.length - 1]
  if (last && last.status === "streaming") {
    last.content += text
    state.dirty = true
  }
}

export function finalizeStreamingMessage(state: ChatState) {
  const last = state.messages[state.messages.length - 1]
  if (last && last.status === "streaming") {
    last.status = "complete"
  }
  state.ui.isStreaming = false
  state.dirty = true
  saveChatSession(state)
}

export function saveChatSession(state: ChatState) {
  try {
    const { saveSession } = require("../memory/sessionStore") as typeof import("../memory/sessionStore")
    const envSnapshot: Record<string, string | undefined> = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      AI_MODEL: process.env.AI_MODEL,
      AI_BASE_URL: process.env.AI_BASE_URL,
    }
    const record = {
      id: state.sessionId,
      createdAt: new Date().toISOString(),
      messages: state.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp, status: m.status })),
        providerConfig: state.config ? {
          provider: state.config.provider,
          model: state.config.model,
          maxTokens: state.config.maxTokens,
          apiKeyHint: undefined,
        } : undefined,
      environment: envSnapshot,
      agentTraces: [] as { agentId?: string; event: string; data?: any; timestamp: string }[],
    }
    try {
      const { agentManager } = require("../agent/manager") as typeof import("../agent/manager")
      const traces: Array<{ agentId?: string; event: string; data?: any; timestamp: string }> = []
      for (const [id, inst] of agentManager.agents) {
        const recent = (inst.log || []).slice(-10)
        for (const l of recent) {
          traces.push({ agentId: id, event: "agent:log", data: { level: l.level, text: l.text, stream: l.stream }, timestamp: new Date(l.timestamp).toISOString() })
        }
      }
      record.agentTraces = traces
    } catch {
      // ignore
    }
    saveSession(record)
  } catch {
    // ignore
  }
}

export function loadChatStateFromSession(sessionId: string, record: import("../memory/sessionStore").SessionRecord, agentType?: string): ChatState {
  const history = record.messages.filter((m) => m.role === "user").map((m) => m.content)
  return {
    messages: record.messages.map((m) => ({
      role: m.role as MessageRole,
      content: m.content,
      timestamp: m.timestamp,
      status: "complete",
    })),
    ui: {
      input: "",
      cursorCol: 0,
      cursorRow: 0,
      inputLines: 1,
      scrollOffset: 0,
      isStreaming: false,
      scrolledUp: false,
      history,
      historyIndex: -1,
      showPicker: false,
      pickerItems: [],
      pickerIndex: 0,
    },
    dirty: true,
    agentType,
    sessionId,
    config: {
      model: record.providerConfig?.model || "claude-sonnet-4-20250514",
      maxTokens: record.providerConfig?.maxTokens || 8192,
    },
  }
}

export function setStreamingError(state: ChatState, error: string) {
  const last = state.messages[state.messages.length - 1]
  if (last && last.status === "streaming") {
    last.status = "error"
    last.content = last.content || `Error: ${error}`
  }
  state.ui.isStreaming = false
  state.dirty = true
}


