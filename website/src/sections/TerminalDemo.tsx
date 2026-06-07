import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"
import TerminalBlock from "../components/TerminalBlock"

interface DemoScene {
  title: string
  commands: Array<{ input: string; output: string[] }>
}

const scenes: DemoScene[] = [
  {
    title: "Launch",
    commands: [
      {
        input: "aegis",
        output: [
          "  █████╗ ███████╗ ██████╗ ██╗███████╗",
          " ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝",
          " ███████║█████╗  ██║  ███╗██║███████╗",
          "",
          " ⚡ Neuron OS v0.1.0 — Mode Launcher",
          " ┌─────────────────────────────────┐",
          " │  ◈ Console      ✦ Chat          │",
          " │  ⬡ Agents       ◇ Memory        │",
          " │  ◎ Status       ⚙ Config        │",
          " └─────────────────────────────────┘",
        ],
      },
    ],
  },
  {
    title: "Spawn",
    commands: [
      {
        input: "aegis agent spawn builder --type build",
        output: [
          " ✓ Agent 'builder' spawned (type: build)",
          " ├── PID: 42891",
          " ├── Tools: all",
          " └── Status: running",
        ],
      },
      {
        input: "aegis agent spawn reviewer --type review",
        output: [
          " ✓ Agent 'reviewer' spawned (type: review)",
          " ├── PID: 42903",
          " ├── Tools: read-only",
          " └── Status: running",
        ],
      },
    ],
  },
  {
    title: "Chat",
    commands: [
      {
        input: "aegis chat",
        output: [
          " ✦ Chat — Anthropic (claude-sonnet-4)",
          " ─────────────────────────────────",
          " You: Explain the agent architecture",
          "",
          " ◈ Neuron OS uses a DAG-based planner",
          "   that decomposes goals into typed",
          "   sub-agents: build, test, review...",
          "   Each agent has scoped tool access.",
        ],
      },
    ],
  },
]

export default function TerminalDemo() {
  const [activeScene, setActiveScene] = useState(0)
  const [displayLines, setDisplayLines] = useState<string[]>([])
  const [currentInput, setCurrentInput] = useState("")
  const [cmdIndex, setCmdIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const [phase, setPhase] = useState<"typing" | "output" | "done">("typing")
  const termRef = useRef<HTMLDivElement>(null)

  const scene = scenes[activeScene]

  const resetTerminal = useCallback((sceneIdx: number) => {
    setDisplayLines([])
    setCurrentInput("")
    setCmdIndex(0)
    setCharIndex(0)
    setPhase("typing")
    setActiveScene(sceneIdx)
  }, [])

  useEffect(() => {
    if (phase !== "typing") return

    const cmd = scene.commands[cmdIndex]
    if (!cmd) {
      setPhase("done")
      return
    }

    if (charIndex < cmd.input.length) {
      const timeout = setTimeout(() => {
        setCurrentInput(cmd.input.slice(0, charIndex + 1))
        setCharIndex((c) => c + 1)
      }, 30 + Math.random() * 40)
      return () => clearTimeout(timeout)
    } else {
      const timeout = setTimeout(() => {
        setDisplayLines((prev) => [
          ...prev,
          `$ ${cmd.input}`,
          ...cmd.output,
          "",
        ])
        setCurrentInput("")
        setCharIndex(0)
        setCmdIndex((c) => c + 1)

        if (cmdIndex + 1 >= scene.commands.length) {
          setPhase("done")
        }
      }, 400)
      return () => clearTimeout(timeout)
    }
  }, [phase, charIndex, cmdIndex, scene, activeScene])

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((c) => !c)
    }, 530)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight
    }
  }, [displayLines, currentInput])

  return (
    <section id="demo" className="relative w-full py-24 md:py-32">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="section-label mb-3 inline-block">DEMO</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Developer-first{" "}
            <span className="serif-italic font-normal text-neutral-400">by design.</span>
          </h2>
        </div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="flex gap-2 flex-wrap justify-center mb-4"
        >
          {scenes.map((s, i) => (
            <button
              key={i}
              onClick={() => resetTerminal(i)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeScene === i
                  ? "bg-white text-black"
                  : "text-neutral-400 hover:text-white border border-white/[0.08] hover:border-white/20"
              }`}
            >
              {s.title}
            </button>
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <TerminalBlock title={`~/neuron-os — ${scene.title.toLowerCase()}`} lines={[]} glow="accent" />
          <div className="mt-3 rounded-2xl overflow-hidden border border-white/[0.06] font-mono text-[13px] leading-relaxed"
            style={{ background: "rgba(10,10,10,0.6)" }}
          >
            <div
              ref={termRef}
              className="p-5 h-[320px] overflow-y-auto"
            >
              {displayLines.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("$")
                      ? "text-white"
                      : line.startsWith(" ✓")
                      ? "text-green-400"
                      : line.startsWith(" ◈") || line.startsWith(" ✦")
                      ? "text-blue-300"
                      : "text-neutral-500"
                  }
                >
                  {line || "\u00A0"}
                </div>
              ))}
              {phase === "typing" && (
                <div className="text-white">
                  <span className="text-blue-400">$ </span>
                  {currentInput}
                  <span
                    className={`inline-block w-1.5 h-3.5 align-middle ml-px bg-white/70 ${
                      showCursor ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </div>
              )}
              {phase === "done" && (
                <div className="text-neutral-500">
                  <span className="text-blue-400">$ </span>
                  <span
                    className={`inline-block w-1.5 h-3.5 align-middle ml-px bg-white/70 ${
                      showCursor ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
