import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"
interface DemoScene {
  title: string
  subtitle: string
  commands: Array<{ input: string; output: string[] }>
}

const scenes: DemoScene[] = [
  {
    title: "Launch",
    subtitle: "One command to start",
    commands: [
      {
        input: "aegis",
        output: [
          "  █████╗ ███████╗ ██████╗ ██╗███████╗",
          " ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝",
          " ███████║█████╗  ██║  ███╗██║███████╗",
          "",
          " ⚡ Neuron OS v0.10.0 — Mode Launcher",
          " ┌─────────────────────────────────┐",
          " │  ◈ Console      ✦ Chat          │",
          " │  ⬡ Agents       ◇ Memory        │",
          " │  ◎ Status       ⚙ Config        │",
          " │  ◆ Improve      ▣ Distributed    │",
          " │  🛡 Production   ⊞ MCP           │",
          " └─────────────────────────────────┘",
        ],
      },
    ],
  },
  {
    title: "Multi-Agent",
    subtitle: "Orchestrate typed agents in parallel",
    commands: [
      {
        input: "aegis agent spawn builder --type build --goal 'Refactor auth module'",
        output: [
          " ✓ Agent 'builder' spawned (type: build)",
          " ├── PID: 42891",
          " ├── Tools: read, write, edit, bash, grep",
          " └── Status: running",
        ],
      },
      {
        input: "aegis agent spawn reviewer --type review --goal 'Review auth refactor'",
        output: [
          " ✓ Agent 'reviewer' spawned (type: review)",
          " ├── PID: 42893",
          " ├── Tools: read-only",
          " └── Status: running",
        ],
      },
      {
        input: "aegis agent spawn tester --type test --goal 'Run auth tests'",
        output: [
          " ✓ Agent 'tester' spawned (type: test)",
          " ├── PID: 42897",
          " ├── Tools: bash (restricted), read",
          " └── Status: running",
        ],
      },
      {
        input: "aegis dashboard",
        output: [
          " ┌─ Agent Dashboard ────────────────────────────┐",
          " │  builder  ●●●○○○  55%  src/auth/          │",
          " │  reviewer ●●●●●○  83%  src/auth/          │",
          " │  tester   ●●●●●●  100%  PASS: 12/12       │",
          " ├────────────────────────────────────────────┤",
          " │  Cost so far: $0.0083  │  14 tool calls   │",
          " └────────────────────────────────────────────┘",
        ],
      },
    ],
  },
  {
    title: "Memory",
    subtitle: "Query your agent's knowledge graph",
    commands: [
      {
        input: "aegis memory search 'authentication flow configuration'",
        output: [
          " Unified Memory Query — 4 stores searched",
          " ─────────────────────────────────────────────",
          " ◈ Recall (FTS5):",
          "   · \"session auth tokens expire after 24h\" — 0.91",
          " ◈ Vector (TF-IDF):",
          "   · \"JWT middleware setup in api/server.ts\" — 0.87",
          " ◈ Graph:",
          "   · [module] AuthModule → depends_on → JWTStrategy",
          "   · [class] AuthMiddleware → implements → RequestHandler",
          " ◈ Sessions:",
          "   · session#4a2f — \"Configured OAuth2 provider\"",
          "",
          " ▸ 8 results in 142ms",
        ],
      },
      {
        input: "aegis memory graph search auth",
        output: [
          " Knowledge Graph — 12 entities found",
          " ─────────────────────────────────────────────",
          " [module]    AuthModule          (confidence: 0.94)",
          " [class]     AuthMiddleware      (confidence: 0.91)",
          " [function]  validateToken()     (confidence: 0.88)",
          " [config]    JWT_SECRET          (confidence: 0.85)",
          " [class]     OAuth2Provider      (confidence: 0.82)",
          "",
          " Top relationship: AuthModule → depends_on → JWTStrategy",
        ],
      },
    ],
  },
  {
    title: "Distributed",
    subtitle: "Multi-host worker pool with encrypted transport",
    commands: [
      {
        input: "aegis distributed status",
        output: [
          " Distributed Runtime — 3 workers online",
          " ┌──────────┬──────────────┬────────┬──────────┐",
          " │ Worker   │ Address      │ Load   │ Capacity │",
          " ├──────────┼──────────────┼────────┼──────────┤",
          " │ leader   │ 10.0.1.4:9443│ 23%    │ CPU 8c   │",
          " │ worker-1 │ 10.0.1.5:9443│ 12%    │ CPU 16c  │",
          " │ worker-2 │ 10.0.1.6:9443│ 67%    │ GPU T4   │",
          " └──────────┴──────────────┴────────┴──────────┘",
          "",
          " Transport: AES-256-GCM encrypted",
          " Leader: bully algorithm (epoch 142)",
          " Tasks dispatched: 1,283 | Avg latency: 47ms",
        ],
      },
      {
        input: "aegis agent spawn train --type build --goal 'Fine-tune model' --require gpu",
        output: [
          " ✓ Capacity-aware placement: worker-2 (GPU available)",
          " ├── Remote agent dispatched via encrypted tunnel",
          " ├── GPU: Tesla T4 (16GB VRAM)",
          " ├── ETA: ~12 minutes",
          " └── Cost estimate: $0.04 (spot routing active)",
        ],
      },
    ],
  },
  {
    title: "Improve",
    subtitle: "Self-improving agents with skill extraction",
    commands: [
      {
        input: "aegis improve skill extract --since 24h",
        output: [
          " Self-Improvement Pipeline — Running...",
          " ─────────────────────────────────────────────",
          " ✓ Loaded 47 completed agent sessions",
          " ✓ Clustered by embedding similarity",
          " ✓ Found 3 skill candidates:",
          "",
          "   1. auth-refactor-pattern (12 episodes, 92% pass rate)",
          "   2. test-setup-boilerplate (8 episodes, 88% pass rate)",
          "   3. error-handling-wrapper (6 episodes, 95% pass rate)",
          "",
          " Running quality gates...",
          " ✓ auth-refactor-pattern → PASSED (judge: approve)",
          " ✓ test-setup-boilerplate → PASSED (judge: approve)",
          " ✓ error-handling-wrapper → REJECTED (judge: needs more evidence)",
          "",
          " ○ Published 2 new skills to auto-registry",
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
      }, 25 + Math.random() * 35)
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
      }, 500)
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
            See it in action.{" "}
            <span className="serif-italic font-normal text-neutral-400">No recording needed.</span>
          </h2>
        </div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="flex gap-2 flex-wrap justify-center mb-2"
        >
          {scenes.map((s, i) => (
            <button
              key={i}
              onClick={() => resetTerminal(i)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeScene === i
                  ? "bg-white text-black font-medium"
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
          className="text-center mb-6"
        >
          <span className="text-xs font-mono text-neutral-500">
            {scene.subtitle}
          </span>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <div className="mt-2 rounded-2xl overflow-hidden border border-white/[0.06] font-mono text-[13px] leading-relaxed"
            style={{ background: "rgba(10,10,10,0.6)" }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <span className="w-2 h-2 rounded-full bg-red-500/40" />
              <span className="w-2 h-2 rounded-full bg-yellow-500/40" />
              <span className="w-2 h-2 rounded-full bg-green-500/40" />
              <span className="ml-3 font-mono text-neutral-500 text-xs">
                ~/neuron-os — {scene.title.toLowerCase()}
              </span>
            </div>
            <div
              ref={termRef}
              className="p-5 h-[380px] overflow-y-auto"
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
                      : line.startsWith(" ○") || line.startsWith(" ▸")
                      ? "text-cyan-400"
                      : line.startsWith(" ┌") || line.startsWith(" │") || line.startsWith(" └") || line.startsWith(" ├")
                      ? "text-neutral-400"
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
