import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import GlassCard from "../components/GlassCard"

const nodes = [
  { id: "goal", label: "Goal Input", x: 50, y: 30, color: "rgba(255,255,255,0.6)" },
  { id: "planner", label: "DAG Planner", x: 200, y: 30, color: "rgba(255,255,255,0.45)" },
  { id: "build", label: "Build Agent", x: 350, y: 10, color: "rgba(255,255,255,0.4)" },
  { id: "test", label: "Test Agent", x: 350, y: 50, color: "rgba(255,255,255,0.35)" },
  { id: "review", label: "Review Agent", x: 350, y: 90, color: "rgba(255,255,255,0.3)" },
  { id: "checkpoint", label: "Checkpoint", x: 500, y: 30, color: "rgba(255,255,255,0.45)" },
  { id: "audit", label: "Audit Log", x: 500, y: 70, color: "rgba(255,255,255,0.35)" },
  { id: "memory", label: "Episodic Memory", x: 650, y: 30, color: "rgba(255,255,255,0.55)" },
  { id: "gateway", label: "Gateway", x: 650, y: 70, color: "rgba(255,255,255,0.4)" },
  { id: "supervisor", label: "Supervisor", x: 200, y: 90, color: "rgba(255,255,255,0.3)" },
]

const connections = [
  [0, 1], [1, 2], [1, 3], [1, 4], [2, 5], [3, 5],
  [4, 6], [5, 7], [6, 8], [1, 9],
]

export default function ArchitectureSection() {
  return (
    <section id="architecture" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— ARCHITECTURE"
        tone="cyan"
        title="From spawn to ship."
        body="From a single goal input through DAG planning, multi-agent execution, checkpointing, and back into episodic memory for continuous improvement."
      />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14"
      >
        <GlassCard className="p-6 md:p-10 overflow-x-auto" glow="purple">
          <svg
            viewBox="0 0 750 120"
            className="w-full min-w-[600px]"
            fill="none"
          >
            {connections.map(([from, to], i) => {
              const a = nodes[from]
              const b = nodes[to]
              return (
                <g key={i}>
                  <line
                    x1={a.x + 45}
                    y1={a.y + 12}
                    x2={b.x}
                    y2={b.y + 12}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={(a.x + 45 + b.x) / 2}
                    cy={(a.y + 12 + b.y + 12) / 2}
                    r="1.5"
                    fill="rgba(255, 255, 255, 0.4)"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.2;0.8;0.2"
                      dur={`${2 + i * 0.3}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              )
            })}

            {nodes.map((node, i) => (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width="90"
                  height="24"
                  rx="6"
                  fill="rgba(255,255,255,0.02)"
                  stroke={node.color}
                  strokeWidth="0.5"
                  strokeOpacity="0.25"
                >
                  <animate
                    attributeName="stroke-opacity"
                    values="0.15;0.4;0.15"
                    dur={`${3 + i * 0.5}s`}
                    repeatCount="indefinite"
                  />
                </rect>
                <text
                  x={node.x + 45}
                  y={node.y + 15}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.6)"
                  fontSize="7"
                  fontFamily="DM Mono, monospace"
                  letterSpacing="0.05em"
                >
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </GlassCard>
      </motion.div>

      <motion.div
        variants={stagger(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {[
          { title: "Task Checkpointing", desc: "Resume mid-task on crash. State saved before every tool call.", num: "01" },
          { title: "Queryable Audit Log", desc: "SQLite-backed. Every tool call logged, indexed, and searchable.", num: "02" },
          { title: "Reflection Loop", desc: "Agents critique their own output. Feedback feeds back into memory.", num: "03" },
        ].map((item) => (
          <motion.div key={item.num} variants={fadeUp}>
            <GlassCard interactive className="p-5">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/20 font-mono">{item.num}</span>
                <h4 className="font-heading font-medium text-white/85 text-sm">{item.title}</h4>
              </div>
              <p className="text-ink-400 text-xs mt-2 leading-relaxed">{item.desc}</p>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
