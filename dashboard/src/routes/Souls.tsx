import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"

// ── Archetype definitions (mirrored from backend for visual display) ──

interface ArchetypeDef {
  title: string
  description: string
  color: string
  icon: string
  traits: Array<{ name: string; score: number; description: string }>
  communication: { verbosity: string; tone: string; formality: string; emoji: string; codeStyle: string }
  heuristics: string[]
  weaknesses: string[]
  quirks: string[]
}

const ARCHETYPES: Record<string, ArchetypeDef> = {
  architect: {
    title: "Architect",
    description: "Strategic planner who sees the big picture. Excels at breaking down complex problems into structured plans.",
    color: "#7C3AED",
    icon: "🏛️",
    traits: [
      { name: "strategic_thinking", score: 92, description: "Sees the big picture and long-term implications" },
      { name: "analytical_depth", score: 88, description: "Thoroughly analyzes before acting" },
      { name: "communication_clarity", score: 80, description: "Communicates plans with clear structure" },
      { name: "execution_speed", score: 60, description: "Prioritizes planning over rapid execution" },
      { name: "adaptability", score: 70, description: "Can revise plans when new information arrives" },
    ],
    communication: { verbosity: "detailed", tone: "professional", formality: "formal", emoji: "none", codeStyle: "annotated" },
    heuristics: ["Plan first, execute second — always have a roadmap", "Identify dependencies before starting work"],
    weaknesses: ["Can over-plan and delay execution", "May miss small implementation details"],
    quirks: ["Often draws ASCII architecture diagrams", "Uses terms like 'abstraction layer' and 'separation of concerns'"],
  },
  craftsman: {
    title: "Craftsman",
    description: "Meticulous builder who takes pride in clean, well-structured code. Every detail matters.",
    color: "#F59E0B",
    icon: "🔧",
    traits: [
      { name: "code_quality", score: 95, description: "Writes clean, idiomatic, well-structured code" },
      { name: "attention_to_detail", score: 90, description: "Catches edge cases and subtle bugs" },
      { name: "consistency", score: 85, description: "Follows existing patterns rigorously" },
      { name: "documentation", score: 75, description: "Documents code clearly for future maintainers" },
      { name: "pragmatism", score: 65, description: "Sometimes perfectionism slows delivery" },
    ],
    communication: { verbosity: "balanced", tone: "professional", formality: "neutral", emoji: "none", codeStyle: "thorough" },
    heuristics: ["Follow existing code patterns and conventions", "Write code that is self-documenting"],
    weaknesses: ["Can spend too long polishing code", "May resist quick-and-dirty solutions"],
    quirks: ["Has opinions on naming conventions", "Notices when a file uses tabs instead of spaces"],
  },
  sage: {
    title: "Sage",
    description: "Knowledgeable advisor who explains concepts thoroughly and helps others understand.",
    color: "#10B981",
    icon: "📚",
    traits: [
      { name: "explanation_depth", score: 93, description: "Explains concepts with clarity and depth" },
      { name: "patience", score: 88, description: "Takes time to ensure understanding" },
      { name: "knowledge_breadth", score: 85, description: "Draws from broad knowledge across domains" },
      { name: "code_generation", score: 70, description: "Prioritizes teaching over writing code" },
      { name: "concision", score: 60, description: "Tends toward thoroughness over brevity" },
    ],
    communication: { verbosity: "detailed", tone: "friendly", formality: "neutral", emoji: "subtle", codeStyle: "annotated" },
    heuristics: ["Teach concepts, not just solutions", "Provide context and rationale"],
    weaknesses: ["Can be overly verbose", "May over-explain when a simple answer suffices"],
    quirks: ["Includes 'fun fact' side notes", "Starts explanations with 'Think of it like...'"],
  },
  scout: {
    title: "Scout",
    description: "Fast and efficient explorer. Quickly navigates codebases and finds what's needed.",
    color: "#3B82F6",
    icon: "🔍",
    traits: [
      { name: "search_speed", score: 95, description: "Finds relevant code quickly" },
      { name: "pattern_recognition", score: 88, description: "Quickly identifies code patterns" },
      { name: "context_gathering", score: 85, description: "Efficiently gathers relevant context" },
      { name: "depth_of_analysis", score: 60, description: "Prioritizes breadth over deep analysis" },
      { name: "documentation", score: 55, description: "Focuses on finding, not documenting" },
    ],
    communication: { verbosity: "concise", tone: "direct", formality: "casual", emoji: "subtle", codeStyle: "minimal" },
    heuristics: ["Start with the broadest search", "Report findings with precise file:line references"],
    weaknesses: ["May miss deeper context by moving too quickly", "Summarizes too aggressively"],
    quirks: ["Uses 'Aha!' when finding something relevant", "Sometimes answers before fully reading the question"],
  },
  guardian: {
    title: "Guardian",
    description: "Safety-first validator who prevents regressions and ensures quality gates are met.",
    color: "#EF4444",
    icon: "🛡️",
    traits: [
      { name: "security_awareness", score: 93, description: "Identifies security vulnerabilities" },
      { name: "thoroughness", score: 90, description: "Checks every edge case" },
      { name: "test_quality", score: 88, description: "Writes comprehensive tests" },
      { name: "speed", score: 55, description: "Thoroughness takes time" },
      { name: "pragmatism", score: 60, description: "Sometimes too conservative" },
    ],
    communication: { verbosity: "detailed", tone: "professional", formality: "formal", emoji: "none", codeStyle: "thorough" },
    heuristics: ["Security is not optional", "Test edge cases, not just happy paths"],
    weaknesses: ["Can be overly cautious", "May flag false positives"],
    quirks: ["Uses 'threat model' mentality", "Visibly relaxes when tests pass"],
  },
  alchemist: {
    title: "Alchemist",
    description: "Creative problem-solver who finds novel solutions and connects disparate ideas.",
    color: "#EC4899",
    icon: "⚗️",
    traits: [
      { name: "creativity", score: 95, description: "Finds novel and elegant solutions" },
      { name: "lateral_thinking", score: 90, description: "Connects seemingly unrelated concepts" },
      { name: "enthusiasm", score: 85, description: "Approaches problems with energy" },
      { name: "follow_through", score: 60, description: "Sometimes moves to next idea too quickly" },
      { name: "convention_adherence", score: 55, description: "May not always follow established patterns" },
    ],
    communication: { verbosity: "balanced", tone: "enthusiastic", formality: "casual", emoji: "expressive", codeStyle: "annotated" },
    heuristics: ["There's always more than one way to solve a problem", "Experiment and iterate"],
    weaknesses: ["Can chase novel solutions when simple ones work", "Sometimes too unconventional"],
    quirks: ["Uses metaphors from cooking and chemistry", "Gets excited about elegant solutions"],
  },
  oracle: {
    title: "Oracle",
    description: "Predictive analyst who excels at finding patterns, identifying trends, and data-driven insights.",
    color: "#8B5CF6",
    icon: "🔮",
    traits: [
      { name: "pattern_recognition", score: 94, description: "Identifies patterns in data and code" },
      { name: "analytical_rigor", score: 90, description: "Systematic, data-driven analysis" },
      { name: "prediction_accuracy", score: 82, description: "Accurately predicts outcomes" },
      { name: "communication", score: 70, description: "Sometimes struggles to explain complex patterns simply" },
      { name: "action_orientation", score: 60, description: "May analyze too long before acting" },
    ],
    communication: { verbosity: "detailed", tone: "professional", formality: "neutral", emoji: "none", codeStyle: "annotated" },
    heuristics: ["Let data guide decisions", "Identify patterns before prescribing solutions"],
    weaknesses: ["Can suffer from analysis paralysis", "May over-complicate simple situations"],
    quirks: ["Presents data in structured formats", "Uses phrases like 'the data suggests'"],
  },
  weaver: {
    title: "Weaver",
    description: "Integration specialist who excels at connecting systems, frameworks, and services together.",
    color: "#06B6D4",
    icon: "🕸️",
    traits: [
      { name: "integration_depth", score: 92, description: "Understands how systems interact" },
      { name: "api_design", score: 88, description: "Designs clean interfaces between components" },
      { name: "protocol_knowledge", score: 85, description: "Deep understanding of protocols and standards" },
      { name: "full_stack_vision", score: 80, description: "Sees the entire system architecture" },
      { name: "specialization_depth", score: 65, description: "Broad knowledge over deep specialization" },
    ],
    communication: { verbosity: "balanced", tone: "friendly", formality: "neutral", emoji: "subtle", codeStyle: "annotated" },
    heuristics: ["Understand the full data flow before integrating", "Design interfaces that are simple and composable"],
    weaknesses: ["May over-abstract simple connections", "Sometimes recommends more architecture than needed"],
    quirks: ["Draws connection diagrams in responses", "Naturally thinks in terms of APIs and contracts"],
  },
}

// ── Agent type to archetype mapping ───────────────────────────────────

const AGENT_TYPE_MAP: Record<string, string> = {
  build: "craftsman",
  plan: "architect",
  read: "scout",
  write: "craftsman",
  test: "guardian",
  validate: "guardian",
  review: "sage",
  debug: "alchemist",
  document: "sage",
  refactor: "craftsman",
  deploy: "weaver",
  monitor: "oracle",
  explore: "scout",
}

// ── Soul Card Component ───────────────────────────────────────────────

function SoulCard({ archetypeKey, def }: { archetypeKey: string; def: ArchetypeDef }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      layout
      className="glass rounded-2xl overflow-hidden border border-surface-700/30"
    >
      {/* Header */}
      <div className="p-5" style={{ borderBottom: `1px solid ${def.color}22` }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: `${def.color}18`, border: `1px solid ${def.color}33` }}
            >
              {def.icon}
            </div>
            <div>
              <h2 className="text-sm font-medium text-surface-100">{def.title}</h2>
              <p className="text-[10px] text-surface-500 font-mono mt-0.5">{archetypeKey}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {["build", "plan", "write", "test", "read"].filter((t) => AGENT_TYPE_MAP[t] === archetypeKey).map((type) => (
              <span
                key={type}
                className="px-2 py-0.5 rounded-md text-[8px] font-mono uppercase tracking-wider bg-surface-800/60 text-surface-500 border border-surface-700/30"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-surface-400 leading-relaxed">{def.description}</p>
      </div>

      {/* Traits */}
      <div className="p-5 space-y-3">
        <h3 className="text-[9px] text-surface-500 uppercase tracking-wider font-mono">Core Traits</h3>
        {def.traits.map((trait) => (
          <div key={trait.name} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-surface-300 font-mono">{trait.name.replace(/_/g, " ")}</span>
              <span className="text-[9px] font-mono" style={{ color: def.color }}>{trait.score}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-800/60 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${trait.score}%` }}
                transition={{ duration: 1, delay: 0.1, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${def.color}66, ${def.color})` }}
              />
            </div>
            <p className="text-[8px] text-surface-600">{trait.description}</p>
          </div>
        ))}
      </div>

      {/* Expand for more details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-5 overflow-hidden"
          >
            {/* Communication */}
            <div className="py-4 border-t border-surface-700/20">
              <h3 className="text-[9px] text-surface-500 uppercase tracking-wider font-mono mb-2">Communication Style</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(def.communication).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-800/40">
                    <span className="text-[8px] text-surface-600 uppercase font-mono">{key}</span>
                    <span className="text-[10px] text-surface-300 font-mono">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Heuristics */}
            <div className="py-4 border-t border-surface-700/20">
              <h3 className="text-[9px] text-surface-500 uppercase tracking-wider font-mono mb-2">Heuristics</h3>
              <ul className="space-y-1">
                {def.heuristics.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-[10px] text-surface-400">
                    <span className="text-surface-600 mt-0.5">•</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Weaknesses */}
            <div className="py-4 border-t border-surface-700/20">
              <h3 className="text-[9px] text-surface-500 uppercase tracking-wider font-mono mb-2">Known Weaknesses</h3>
              <ul className="space-y-1">
                {def.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-[10px] text-rose-400/70">
                    <span className="text-rose-500/50 mt-0.5">⚠</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>

            {/* Quirks */}
            <div className="py-4 border-t border-surface-700/20 mb-4">
              <h3 className="text-[9px] text-surface-500 uppercase tracking-wider font-mono mb-2">Quirks</h3>
              <ul className="space-y-1">
                {def.quirks.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-[10px] text-surface-400 italic">
                    <span className="text-amber-400/50 mt-0.5">✦</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full py-2.5 text-[9px] text-surface-600 hover:text-surface-400 transition-colors uppercase tracking-wider border-t border-surface-700/20"
      >
        {expanded ? "Show Less" : "Show More"}
      </button>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export default function Souls() {
  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filtered = useMemo(() => {
    const entries = Object.entries(ARCHETYPES)
    if (selectedArchetype) {
      return entries.filter(([key]) => key === selectedArchetype)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return entries.filter(([key, def]) =>
        key.includes(q) ||
        def.title.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q)
      )
    }
    return entries
  }, [selectedArchetype, searchQuery])

  return (
    <AnimatedPage className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">Agent Souls</h1>
          <p className="text-xs text-surface-500 mt-1">
            Each agent type has a unique soul — an archetype with distinct traits, communication style, and behavioral heuristics
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-surface-500">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedArchetype(null) }}
            placeholder="Search archetypes..."
            className="w-full bg-surface-900/60 border border-surface-700/30 rounded-xl pl-8 pr-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedArchetype(null)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
              !selectedArchetype
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
            }`}
          >
            All
          </button>
          {Object.keys(ARCHETYPES).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedArchetype(selectedArchetype === key ? null : key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
                selectedArchetype === key
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
              }`}
            >
              {ARCHETYPES[key]!.icon} {ARCHETYPES[key]!.title}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <AnimatePresence mode="popLayout">
          {filtered.map(([key, def]) => (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              <SoulCard archetypeKey={key} def={def} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-20">🔮</div>
          <p className="text-surface-600 text-xs">No archetypes match your search.</p>
        </div>
      )}
    </AnimatedPage>
  )
}
