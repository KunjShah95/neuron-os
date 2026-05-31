import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

const demoMessages: Message[] = [
  { role: "assistant", content: "Hello! I'm Aegis, your AI command center. How can I assist you today?", timestamp: new Date().toISOString() },
]

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(demoMessages)
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [provider, setProvider] = useState("anthropic")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingText])

  const providers = [
    { id: "anthropic", label: "Anthropic", color: "text-amber-400" },
    { id: "openai", label: "OpenAI", color: "text-emerald-400" },
    { id: "deepseek", label: "DeepSeek", color: "text-cyan-400" },
    { id: "ollama", label: "Ollama", color: "text-rose-400" },
  ]

  async function handleSend() {
    if (!input.trim() || isStreaming) return
    const userMsg: Message = { role: "user", content: input, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsStreaming(true)
    setStreamingText("")

    const text = "I understand your request. Let me process that and get back to you with a thoughtful response."
    const words = text.split(" ")
    for (let i = 0; i < words.length; i++) {
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 30))
      setStreamingText((prev) => prev + (i === 0 ? "" : " ") + words[i]!)
    }

    const assistantMsg: Message = { role: "assistant", content: text, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, assistantMsg])
    setStreamingText("")
    setIsStreaming(false)
  }

  return (
    <AnimatedPage className="h-screen flex flex-col">
      {/* Header */}
      <div className="glass-strong px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl text-surface-50">Chat</h1>
          <p className="text-[10px] text-surface-500 uppercase tracking-widest">
            {isStreaming ? "Streaming..." : "Ready"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all duration-200 ${
                provider === p.id
                  ? `${p.color} bg-white/5 border border-white/10`
                  : "text-surface-600 hover:text-surface-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-5 py-3 ${
                  msg.role === "user"
                    ? "bg-amber-400/10 border border-amber-400/20"
                    : "glass"
                }`}
              >
                <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">
                  {msg.role === "user" ? "You" : "Aegis"}
                </div>
                <div className="text-sm text-surface-100 leading-relaxed">{msg.content}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="max-w-[70%] glass rounded-2xl px-5 py-3">
              <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Aegis · streaming</div>
              <div className="text-sm text-surface-100 leading-relaxed">
                {streamingText}
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="inline-block w-1.5 h-4 bg-amber-400 ml-0.5 align-middle"
                />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="glass-strong px-8 py-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            disabled={isStreaming}
            className="flex-1 bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="px-5 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium hover:bg-amber-500/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-surface-600">
          <span>Enter to send</span>
          <span>·</span>
          <span>Provider: {providers.find((p) => p.id === provider)?.label}</span>
        </div>
      </div>
    </AnimatedPage>
  )
}
