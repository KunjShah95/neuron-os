import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"

interface DemoScene {
  title: string
  commands: Array<{ input: string; output: string[] }>
}

const scenes: DemoScene[] = [
  {
    title: "Launch",
    commands: [
      {
        input: "bun run index.ts",
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
    title: "Spawn Agents",
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
    title: "AI Chat",
    commands: [
      {
        input: "aegis chat",
        output: [
          " ✦ Chat — Anthropic (claude-sonnet-4-20250514)",
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

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
    intervalRef.current = setInterval(() => {
      setShowCursor((c) => !c)
    }, 530)
    return () => clearInterval(intervalRef.current)
  }, [])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight
    }
  }, [displayLines, currentInput])

  return (
    <section id="demo" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— LIVE"
        tone="cyan"
        title="Developer-first CLI experience"
        body="A unified terminal interface that puts you in command of your agent fleet."
      />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-10 flex gap-2 flex-wrap"
      >
        {scenes.map((s, i) => (
          <button
            key={i}
            onClick={() => resetTerminal(i)}
            className={`text-[11px] font-medium tracking-[0.12em] px-4 py-2 rounded-full transition-all duration-200 cursor-pointer ${
              activeScene === i
                ? "btn-landing-gradient"
                : "btn-landing-outline"
            }`}
          >
            {s.title.toUpperCase()}
          </button>
        ))}
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-6"
      >
        <div className="liquid-glass rounded-2xl overflow-hidden">
          <div className="bg-white/[0.02] px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
              <span className="text-[11px] text-white/60 font-medium tracking-[0.12em] uppercase font-mono">
                neuron-os — {scene.title}
              </span>
            </div>
            <span className="text-[10px] text-white/30 font-mono tracking-wider">
              SECURE END-TO-END
            </span>
          </div>

          <div
            ref={termRef}
            className="p-5 font-mono text-[12.5px] leading-relaxed h-[340px] overflow-y-auto text-white/45"
          >
            {displayLines.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("$")
                    ? "text-white/70"
                    : line.startsWith(" ✓")
                    ? "text-white/55"
                    : line.startsWith(" ◈") || line.startsWith(" ✦")
                    ? "text-white/65"
                    : "text-white/30"
                }
              >
                {line || "\u00A0"}
              </div>
            ))}
            {phase === "typing" && (
              <div className="text-white/70">
                <span className="text-white/30">$ </span>
                {currentInput}
                <span
                  className={`inline-block w-[7px] h-[13px] bg-white/55 ml-[1px] align-middle ${
                    showCursor ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>
            )}
            {phase === "done" && (
              <div className="text-white/30">
                <span>$ </span>
                <span
                  className={`inline-block w-[7px] h-[13px] bg-white/30 ml-[1px] align-middle ${
                    showCursor ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 h-1 rounded-full overflow-hidden bg-gradient-brand animate-pulse-soft" />
      </motion.div>
    </section>
  )
}
