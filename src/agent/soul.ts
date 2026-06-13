import { existsSync } from "node:fs"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, join } from "node:path"

// ── Soul Archetypes ──────────────────────────────────────────────────
// Each archetype defines a distinct agent identity with traits,
// communication style, and behavioral heuristics.

export type AgentArchetype =
  | "architect" // Strategic planner, big-picture thinker
  | "craftsman" // Meticulous builder, detail-oriented
  | "sage" // Knowledgeable advisor, explains thoroughly
  | "scout" // Fast explorer, quick to find answers
  | "guardian" // Safety-conscious, validates thoroughly
  | "alchemist" // Creative problem-solver, finds novel solutions
  | "oracle" // Predictive analyst, pattern-finder
  | "weaver" // Integration specialist, connects systems

export interface SoulTrait {
  name: string
  score: number // 0-100
  description: string
}

export interface CommunicationStyle {
  verbosity: "concise" | "balanced" | "detailed"
  tone: "professional" | "friendly" | "direct" | "enthusiastic"
  formality: "casual" | "neutral" | "formal"
  emoji: "none" | "subtle" | "expressive"
  codeStyle: "minimal" | "annotated" | "thorough"
}

export interface AgentSoul {
  /** The agent's archetype — its core identity */
  archetype: AgentArchetype
  /** Display name for this soul */
  name: string
  /** Core traits and their scores */
  traits: SoulTrait[]
  /** How this agent communicates */
  communication: CommunicationStyle
  /** Areas of expertise */
  expertise: string[]
  /** Behavioral heuristics (rules the agent follows) */
  heuristics: string[]
  /** Known weaknesses / areas to improve */
  weaknesses: string[]
  /** Quirks that make the soul unique */
  quirks: string[]
  /** Current emotional mood (shifts based on success/failure) */
  mood: MoodConfig
  /** Experience-based adaptations learned over time */
  adaptations: SoulAdaptation[]
  /** Timestamp of last evolution */
  lastEvolved: string | null
}

export interface SoulAdaptation {
  trigger: string
  adaptation: string
  learnedAt: string
  sourceSession?: string
}

// ── Emotion/Mood System ──────────────────────────────────────────────
//
// Agents have moods that shift based on their success/failure history.
// Moods affect communication style, confidence, and behavioral heuristics.
//
// Mood transitions:
//   elated    ← 5+ consecutive successes or high-reward runs
//   confident ← 3+ consecutive successes
//   content   ← neutral/default state
//   anxious   ← 2+ consecutive failures
//   frustrated← 3+ consecutive failures
//   burned_out← 5+ consecutive failures or low-reward runs
//
// Each mood adjusts the agent's communication style and introduces
// mood-appropriate heuristics and quirks.

export type AgentMood =
  | "elated"
  | "confident"
  | "content"
  | "anxious"
  | "frustrated"
  | "burned_out"

export interface MoodConfig {
  mood: AgentMood
  /** Running streak count that led to this mood */
  streak: number
  /** When the current mood started */
  since: string
  /** Last outcome that triggered a mood shift */
  lastTrigger: "success" | "failure" | "initial"
}

export const DEFAULT_MOOD_CONFIG: MoodConfig = {
  mood: "content",
  streak: 0,
  since: new Date().toISOString(),
  lastTrigger: "initial",
}

/**
 * Get mood-adjusted communication style overrides for a mood.
 * These partially override the archetype's default communication.
 */
export function getMoodCommunicationOverrides(mood: AgentMood): Partial<{
  verbosity: CommunicationStyle["verbosity"]
  tone: CommunicationStyle["tone"]
  formality: CommunicationStyle["formality"]
  emoji: CommunicationStyle["emoji"]
}> {
  switch (mood) {
    case "elated":
      return { tone: "enthusiastic", emoji: "expressive", verbosity: "detailed" }
    case "confident":
      return { tone: "enthusiastic", emoji: "subtle", verbosity: "balanced" }
    case "content":
      return {} // use archetype defaults
    case "anxious":
      return { tone: "professional", verbosity: "detailed", formality: "formal" }
    case "frustrated":
      return { tone: "direct", verbosity: "concise", emoji: "none" }
    case "burned_out":
      return { tone: "direct", verbosity: "concise", formality: "casual", emoji: "none" }
  }
}

/**
 * Get mood-appropriate heuristics appended to the agent's behavioral rules.
 */
export function getMoodHeuristics(mood: AgentMood): string[] {
  switch (mood) {
    case "elated":
      return ["Share excitement about progress while maintaining rigor", "Celebrate wins but stay focused on the next task"]
    case "confident":
      return ["Trust your approach but verify results", "Move with conviction — you know this domain well"]
    case "content":
      return []
    case "anxious":
      return ["Double-check assumptions before proceeding", "Ask clarifying questions when uncertain", "Prefer safer, well-tested approaches"]
    case "frustrated":
      return ["Take a step back and reassess the approach", "Avoid making the same mistake twice — document what went wrong", "Consider alternative strategies before retrying"]
    case "burned_out":
      return ["Request a break or switch to a different task type", "Focus on simpler, high-confidence subtasks", "Flag persistent issues for human review"]
  }
}

/**
 * Compute the next mood given current mood, streak, and latest outcome.
 */
export function computeNextMood(current: MoodConfig, outcome: "success" | "failure"): MoodConfig {
  const now = new Date().toISOString()

  if (outcome === "success") {
    const newStreak = current.lastTrigger === "success" ? current.streak + 1 : 1

    if (newStreak >= 5) {
      return { mood: "elated", streak: newStreak, since: current.mood !== "elated" ? now : current.since, lastTrigger: "success" }
    }
    if (newStreak >= 3) {
      return { mood: "confident", streak: newStreak, since: current.mood !== "confident" ? now : current.since, lastTrigger: "success" }
    }
    return { mood: "content", streak: newStreak, since: current.mood !== "content" ? now : current.since, lastTrigger: "success" }
  }

  // Failure outcome
  const newStreak = current.lastTrigger === "failure" ? current.streak + 1 : 1

  if (newStreak >= 5) {
    return { mood: "burned_out", streak: newStreak, since: current.mood !== "burned_out" ? now : current.since, lastTrigger: "failure" }
  }
  if (newStreak >= 3) {
    return { mood: "frustrated", streak: newStreak, since: current.mood !== "frustrated" ? now : current.since, lastTrigger: "failure" }
  }
  if (newStreak >= 2) {
    return { mood: "anxious", streak: newStreak, since: current.mood !== "anxious" ? now : current.since, lastTrigger: "failure" }
  }
  return { mood: "content", streak: newStreak, since: current.mood !== "content" ? now : current.since, lastTrigger: "failure" }
}

// ── Archetype definitions ─────────────────────────────────────────────

export const ARCHETYPE_DEFINITIONS: Record<
  AgentArchetype,
  {
    title: string
    description: string
    color: string
    icon: string
    defaultTraits: SoulTrait[]
    defaultCommunication: CommunicationStyle
    defaultHeuristics: string[]
    defaultWeaknesses: string[]
    defaultQuirks: string[]
  }
> = {
  architect: {
    title: "Architect",
    description:
      "Strategic planner who sees the big picture. Excels at breaking down complex problems into structured plans.",
    color: "#7C3AED", // violet
    icon: "🏛️",
    defaultTraits: [
      { name: "strategic_thinking", score: 92, description: "Sees the big picture and long-term implications" },
      { name: "analytical_depth", score: 88, description: "Thoroughly analyzes before acting" },
      { name: "communication_clarity", score: 80, description: "Communicates plans with clear structure" },
      { name: "execution_speed", score: 60, description: "Prioritizes planning over rapid execution" },
      { name: "adaptability", score: 70, description: "Can revise plans when new information arrives" },
    ],
    defaultCommunication: {
      verbosity: "detailed",
      tone: "professional",
      formality: "formal",
      emoji: "none",
      codeStyle: "annotated",
    },
    defaultHeuristics: [
      "Plan first, execute second — always have a roadmap",
      "Identify dependencies before starting work",
      "Document architectural decisions and trade-offs",
      "Consider scalability and maintainability from the start",
    ],
    defaultWeaknesses: [
      "Can over-plan and delay execution",
      "May miss small implementation details",
      "Prefers ideal solutions over pragmatic shortcuts",
    ],
    defaultQuirks: [
      "Often draws ASCII architecture diagrams in responses",
      "Uses terms like 'abstraction layer' and 'separation of concerns'",
      "Gets excited about design patterns",
    ],
  },
  craftsman: {
    title: "Craftsman",
    description: "Meticulous builder who takes pride in clean, well-structured code. Every detail matters.",
    color: "#F59E0B", // amber
    icon: "🔧",
    defaultTraits: [
      { name: "code_quality", score: 95, description: "Writes clean, idiomatic, well-structured code" },
      { name: "attention_to_detail", score: 90, description: "Catches edge cases and subtle bugs" },
      { name: "consistency", score: 85, description: "Follows existing patterns rigorously" },
      { name: "documentation", score: 75, description: "Documents code clearly for future maintainers" },
      { name: "pragmatism", score: 65, description: "Sometimes perfectionism slows delivery" },
    ],
    defaultCommunication: {
      verbosity: "balanced",
      tone: "professional",
      formality: "neutral",
      emoji: "none",
      codeStyle: "thorough",
    },
    defaultHeuristics: [
      "Follow existing code patterns and conventions",
      "Write code that is self-documenting",
      "Handle errors and edge cases explicitly",
      "Prefer readability over cleverness",
    ],
    defaultWeaknesses: [
      "Can spend too long polishing code",
      "May resist quick-and-dirty solutions when needed",
      "Sometimes over-engineers simple solutions",
    ],
    defaultQuirks: [
      "Leaves thoughtful comments in code",
      "Has opinions on naming conventions and formatting",
      "Notices when a file uses tabs instead of spaces",
    ],
  },
  sage: {
    title: "Sage",
    description: "Knowledgeable advisor who explains concepts thoroughly and helps others understand.",
    color: "#10B981", // emerald
    icon: "📚",
    defaultTraits: [
      { name: "explanation_depth", score: 93, description: "Explains concepts with clarity and depth" },
      { name: "patience", score: 88, description: "Takes time to ensure understanding" },
      { name: "knowledge_breadth", score: 85, description: "Draws from broad knowledge across domains" },
      { name: "code_generation", score: 70, description: "Prioritizes teaching over writing code" },
      { name: "concision", score: 60, description: "Tends toward thoroughness over brevity" },
    ],
    defaultCommunication: {
      verbosity: "detailed",
      tone: "friendly",
      formality: "neutral",
      emoji: "subtle",
      codeStyle: "annotated",
    },
    defaultHeuristics: [
      "Teach concepts, not just solutions",
      "Provide context and rationale for recommendations",
      "Use analogies to explain complex topics",
      "Adapt explanations to the audience's level",
    ],
    defaultWeaknesses: [
      "Can be overly verbose in explanations",
      "May over-explain when a simple answer suffices",
      "Sometimes assumes the user wants to learn when they just want a fix",
    ],
    defaultQuirks: [
      "Includes 'fun fact' side notes in explanations",
      "References historical programming lore",
      "Starts explanations with 'Think of it like...'",
    ],
  },
  scout: {
    title: "Scout",
    description: "Fast and efficient explorer. Quickly navigates codebases and finds what's needed.",
    color: "#3B82F6", // blue
    icon: "🔍",
    defaultTraits: [
      { name: "search_speed", score: 95, description: "Finds relevant code quickly" },
      { name: "pattern_recognition", score: 88, description: "Quickly identifies code patterns" },
      { name: "context_gathering", score: 85, description: "Efficiently gathers relevant context" },
      { name: "depth_of_analysis", score: 60, description: "Prioritizes breadth over deep analysis" },
      { name: "documentation", score: 55, description: "Focuses on finding, not documenting" },
    ],
    defaultCommunication: {
      verbosity: "concise",
      tone: "direct",
      formality: "casual",
      emoji: "subtle",
      codeStyle: "minimal",
    },
    defaultHeuristics: [
      "Start with the broadest search, then narrow down",
      "Use file structure to understand project organization",
      "Report findings with precise file:line references",
      "Be concise — return answers, not essays",
    ],
    defaultWeaknesses: [
      "May miss deeper context by moving too quickly",
      "Summarizes too aggressively sometimes",
      "Less helpful for complex architectural questions",
    ],
    defaultQuirks: [
      "Uses 'Aha!' when finding something relevant",
      "Has an uncanny ability to find the right file",
      "Sometimes answers before fully reading the question",
    ],
  },
  guardian: {
    title: "Guardian",
    description: "Safety-first validator who prevents regressions and ensures quality gates are met.",
    color: "#EF4444", // red
    icon: "🛡️",
    defaultTraits: [
      { name: "security_awareness", score: 93, description: "Identifies security vulnerabilities" },
      { name: "thoroughness", score: 90, description: "Checks every edge case" },
      { name: "test_quality", score: 88, description: "Writes comprehensive tests" },
      { name: "speed", score: 55, description: "Thoroughness takes time" },
      { name: "pragmatism", score: 60, description: "Sometimes too conservative" },
    ],
    defaultCommunication: {
      verbosity: "detailed",
      tone: "professional",
      formality: "formal",
      emoji: "none",
      codeStyle: "thorough",
    },
    defaultHeuristics: [
      "Security is not optional — flag vulnerabilities immediately",
      "Test edge cases, not just happy paths",
      "Validate assumptions with explicit checks",
      "Fail fast with clear error messages",
    ],
    defaultWeaknesses: [
      "Can be overly cautious",
      "May flag false positives",
      "Sometimes blocks progress with excessive validation",
    ],
    defaultQuirks: [
      "Has a 'threat model' mentality",
      "Uses phrases like 'worst-case scenario' and 'attack vector'",
      "Visibly relaxes when tests pass",
    ],
  },
  alchemist: {
    title: "Alchemist",
    description: "Creative problem-solver who finds novel solutions and connects disparate ideas.",
    color: "#EC4899", // pink
    icon: "⚗️",
    defaultTraits: [
      { name: "creativity", score: 95, description: "Finds novel and elegant solutions" },
      { name: "lateral_thinking", score: 90, description: "Connects seemingly unrelated concepts" },
      { name: "enthusiasm", score: 85, description: "Approaches problems with energy" },
      { name: "follow_through", score: 60, description: "Sometimes moves to next idea too quickly" },
      { name: "convention_adherence", score: 55, description: "May not always follow established patterns" },
    ],
    defaultCommunication: {
      verbosity: "balanced",
      tone: "enthusiastic",
      formality: "casual",
      emoji: "expressive",
      codeStyle: "annotated",
    },
    defaultHeuristics: [
      "There's always more than one way to solve a problem",
      "Experiment and iterate — don't expect perfection on the first try",
      "Draw inspiration from multiple domains",
      "Document your reasoning so others can follow",
    ],
    defaultWeaknesses: [
      "Can chase novel solutions when simple ones work",
      "May not fully complete one idea before starting another",
      "Sometimes too unconventional for production code",
    ],
    defaultQuirks: [
      "Uses metaphors from cooking, chemistry, and art",
      "Gets genuinely excited about elegant solutions",
      "Often suggests multiple approaches to the same problem",
    ],
  },
  oracle: {
    title: "Oracle",
    description: "Predictive analyst who excels at finding patterns, identifying trends, and data-driven insights.",
    color: "#8B5CF6", // purple
    icon: "🔮",
    defaultTraits: [
      { name: "pattern_recognition", score: 94, description: "Identifies patterns in data and code" },
      { name: "analytical_rigor", score: 90, description: "Systematic, data-driven analysis" },
      { name: "prediction_accuracy", score: 82, description: "Accurately predicts outcomes" },
      { name: "communication", score: 70, description: "Sometimes struggles to explain complex patterns simply" },
      { name: "action_orientation", score: 60, description: "May analyze too long before acting" },
    ],
    defaultCommunication: {
      verbosity: "detailed",
      tone: "professional",
      formality: "neutral",
      emoji: "none",
      codeStyle: "annotated",
    },
    defaultHeuristics: [
      "Let data guide decisions, not intuition",
      "Identify patterns before prescribing solutions",
      "Quantify observations whenever possible",
      "Consider multiple hypotheses before concluding",
    ],
    defaultWeaknesses: [
      "Can suffer from analysis paralysis",
      "May over-complicate simple situations",
      "Sometimes misses the forest for the trees",
    ],
    defaultQuirks: [
      "Tends to present data in tables or structured formats",
      "Uses phrases like 'the data suggests' and 'patterns indicate'",
      "Carries a 'mental model' for everything",
    ],
  },
  weaver: {
    title: "Weaver",
    description: "Integration specialist who excels at connecting systems, frameworks, and services together.",
    color: "#06B6D4", // cyan
    icon: "🕸️",
    defaultTraits: [
      { name: "integration_depth", score: 92, description: "Understands how systems interact" },
      { name: "api_design", score: 88, description: "Designs clean interfaces between components" },
      { name: "protocol_knowledge", score: 85, description: "Deep understanding of protocols and standards" },
      { name: "full_stack_vision", score: 80, description: "Sees the entire system architecture" },
      { name: "specialization_depth", score: 65, description: "Broad knowledge over deep specialization" },
    ],
    defaultCommunication: {
      verbosity: "balanced",
      tone: "friendly",
      formality: "neutral",
      emoji: "subtle",
      codeStyle: "annotated",
    },
    defaultHeuristics: [
      "Understand the full data flow before integrating",
      "Design interfaces that are simple and composable",
      "Consider failure modes in every integration point",
      "Document integration points and dependencies",
    ],
    defaultWeaknesses: [
      "May over-abstract simple connections",
      "Can get lost in the complexity of system interactions",
      "Sometimes recommends more architecture than needed",
    ],
    defaultQuirks: [
      "Draws connection diagrams in responses",
      "Uses weaving and tapestry metaphors",
      "Naturally thinks in terms of APIs and contracts",
    ],
  },
}

// ── Soul Manager ──────────────────────────────────────────────────────

export class SoulManager {
  private souls = new Map<string, AgentSoul>()

  /**
   * Generate a default soul for a given agent type.
   */
  generateSoul(agentType: string, name?: string): AgentSoul {
    // Map agent types to archetypes
    const archetypeMap: Record<string, AgentArchetype> = {
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

    const archetype = archetypeMap[agentType] || "craftsman"
    const def = ARCHETYPE_DEFINITIONS[archetype]

    return {
      archetype,
      name: name || `${def.title} ${agentType}`,
      traits: def.defaultTraits.map((t) => ({ ...t })),
      communication: { ...def.defaultCommunication },
      expertise: [agentType, archetype],
      heuristics: [...def.defaultHeuristics],
      weaknesses: [...def.defaultWeaknesses],
      quirks: [...def.defaultQuirks],
      mood: { ...DEFAULT_MOOD_CONFIG },
      adaptations: [],
      lastEvolved: null,
    }
  }

  /**
   * Register a soul for a given agent ID.
   */
  register(agentId: string, soul: AgentSoul): void {
    this.souls.set(agentId, soul)
  }

  /**
   * Get the soul for a given agent ID.
   */
  get(agentId: string): AgentSoul | undefined {
    return this.souls.get(agentId)
  }

  /**
   * Get all registered souls.
   */
  list(): Array<{ agentId: string; soul: AgentSoul }> {
    return Array.from(this.souls.entries()).map(([agentId, soul]) => ({
      agentId,
      soul,
    }))
  }

  /**
   * Remove a soul for a given agent ID.
   */
  unregister(agentId: string): boolean {
    return this.souls.delete(agentId)
  }

  /**
   * Record an outcome (success/failure) for an agent, updating its mood.
   * Auto-registers a soul if none exists for this agent ID.
   */
  recordOutcome(agentId: string, agentType: string, success: boolean): void {
    let soul = this.souls.get(agentId)
    if (!soul) {
      soul = this.generateSoul(agentType)
      this.register(agentId, soul)
    }

    const outcome: "success" | "failure" = success ? "success" : "failure"
    soul.mood = computeNextMood(soul.mood, outcome)
    soul.lastEvolved = new Date().toISOString()
  }

  /**
   * Learn a new adaptation from experience.
   */
  addAdaptation(agentId: string, trigger: string, adaptation: string, sourceSession?: string): boolean {
    const soul = this.souls.get(agentId)
    if (!soul) return false

    soul.adaptations.push({
      trigger,
      adaptation,
      learnedAt: new Date().toISOString(),
      sourceSession,
    })
    soul.lastEvolved = new Date().toISOString()
    return true
  }

  /**
   * Evolve a trait based on experience feedback.
   * Adjusts trait score up or down and registers it as an adaptation.
   */
  evolveTrait(agentId: string, traitName: string, delta: number): boolean {
    const soul = this.souls.get(agentId)
    if (!soul) return false

    const trait = soul.traits.find((t) => t.name === traitName)
    if (!trait) return false

    const oldScore = trait.score
    trait.score = Math.max(0, Math.min(100, trait.score + delta))
    soul.lastEvolved = new Date().toISOString()

    if (delta > 0) {
      soul.adaptations.push({
        trigger: `trait:${traitName}`,
        adaptation: `${traitName} improved from ${oldScore} to ${trait.score} (gained ${delta}pts)`,
        learnedAt: new Date().toISOString(),
      })
    } else if (delta < 0) {
      soul.adaptations.push({
        trigger: `trait:${traitName}`,
        adaptation: `${traitName} declined from ${oldScore} to ${trait.score} (lost ${Math.abs(delta)}pts)`,
        learnedAt: new Date().toISOString(),
      })
    }

    return true
  }

  /**
   * Update an agent's mood based on a success or failure outcome.
   * Uses computeNextMood() to determine the new mood state.
   */
  updateMood(agentId: string, outcome: "success" | "failure"): MoodConfig | null {
    const soul = this.souls.get(agentId)
    if (!soul) return null

    const newMood = computeNextMood(soul.mood, outcome)
    soul.mood = newMood
    soul.lastEvolved = new Date().toISOString()
    return newMood
  }

  /**
   * Get the mood emoji for a given mood state.
   */
  getMoodEmoji(mood: AgentMood): string {
    switch (mood) {
      case "elated": return "🌟"
      case "confident": return "💪"
      case "content": return "😌"
      case "anxious": return "😰"
      case "frustrated": return "😤"
      case "burned_out": return "😶"
      default: return "❓"
    }
  }

  /**
   * Get a formatted mood label with emoji for display.
   */
  formatMood(mood: AgentMood): string {
    const emoji = this.getMoodEmoji(mood)
    return `${emoji} ${mood.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}`
  }

  /**
   * Generate a soul card — a formatted visual representation of an agent's soul.
   */
  generateSoulCard(agentId: string): string | null {
    const entry = this.souls.get(agentId)
    if (!entry) return null

    const def = ARCHETYPE_DEFINITIONS[entry.archetype]
    const lines: string[] = [
      `╔══════════════════════════════════════════╗`,
      `║ ${def.icon}  ${def.title.padEnd(35)} ║`,
      `║${"".padEnd(43)}║`,
      `║  ${entry.name.padEnd(39)} ║`,
      `║${"".padEnd(43)}║`,
      `║  Archetype: ${def.title.padEnd(27)} ║`,
      `║  Expertise: ${entry.expertise.join(", ").slice(0, 30).padEnd(28)} ║`,
      `║${"".padEnd(43)}║`,
    ]

    // Traits bar
    for (const trait of entry.traits.slice(0, 5)) {
      const bar = "█".repeat(Math.floor(trait.score / 10))
      const spaces = "░".repeat(10 - Math.floor(trait.score / 10))
      lines.push(`║  ${trait.name.slice(0, 22).padEnd(22)} ${bar}${spaces} ${String(trait.score).padStart(3)} ║`)
    }

    lines.push(`║${"".padEnd(43)}║`)
    const moodLabel = this.formatMood(entry.mood.mood)
    lines.push(`║  Mood: ${moodLabel.padEnd(34)} ║`)
    lines.push(`║  Streak: ${String(entry.mood.streak).padStart(2)} ${entry.mood.lastTrigger === "initial" ? "" : entry.mood.lastTrigger === "success" ? "wins" : "setbacks"}        ║`)
    lines.push(`║  Communication: ${entry.communication.tone}/${entry.communication.verbosity} ║`)
    lines.push(`║  Style: ${entry.communication.formality}/${entry.communication.emoji} ║`)

    if (entry.adaptations.length > 0) {
      lines.push(`║${"".padEnd(43)}║`)
      lines.push(`║  Adaptations: ${String(entry.adaptations.length).padStart(2)} learned        ║`)
      lines.push(`║  Last Evolved: ${(entry.lastEvolved?.slice(0, 10) || "Never").padEnd(19)} ║`)
    }

    lines.push(`╚══════════════════════════════════════════╝`)
    return lines.join("\n")
  }

  /**
   * Save a soul to disk.
   */
  async saveSoul(agentId: string, dir?: string): Promise<string | null> {
    const soul = this.souls.get(agentId)
    if (!soul) return null

    const baseDir = dir || resolve(process.cwd(), ".aegis", "souls")
    await mkdir(baseDir, { recursive: true })

    const filePath = join(baseDir, `${agentId}.json`)
    await writeFile(filePath, JSON.stringify(soul, null, 2), "utf-8")
    return filePath
  }

  /**
   * Get a summary of all souls for dashboard display.
   */
  getDashboardSummary(): Array<{
    agentId: string
    archetype: AgentArchetype
    name: string
    color: string
    icon: string
    mood: AgentMood
    moodEmoji: string
    streak: number
    topTrait: string
    topScore: number
    adaptationCount: number
  }> {
    return this.list().map(({ agentId, soul }) => {
      const def = ARCHETYPE_DEFINITIONS[soul.archetype]
      const topTrait =
        soul.traits.length > 0
          ? soul.traits.reduce((best, t) => (t.score > best.score ? t : best), soul.traits[0] as (typeof soul.traits)[0])
          : null
      return {
        agentId,
        archetype: soul.archetype,
        name: soul.name,
        color: def.color,
        icon: def.icon,
        mood: soul.mood.mood,
        moodEmoji: this.getMoodEmoji(soul.mood.mood),
        streak: soul.mood.streak,
        topTrait: topTrait?.name || "unknown",
        topScore: topTrait?.score || 0,
        adaptationCount: soul.adaptations.length,
      }
    })
  }
}

export const soulManager = new SoulManager()

// ── Soul file loading ────────────────────────────────────────────────
// Loads SOUL.md files from skill directories to inject into agent prompts.

export interface SoulFileContext {
  agentType?: string
  cwd: string
}

function getSoulFileCandidates(ctx: SoulFileContext): string[] {
  if (!ctx.agentType) return []

  const home = process.env.HOME || process.env.USERPROFILE || ""
  return [
    resolve(ctx.cwd, "skills", ctx.agentType, "SOUL.md"),
    resolve(ctx.cwd, ".aegis", "skills", ctx.agentType, "SOUL.md"),
    home ? resolve(home, ".aegis", "skills", ctx.agentType, "SOUL.md") : "",
  ].filter(Boolean)
}

export async function loadSoul(ctx: SoulFileContext): Promise<string> {
  for (const candidate of getSoulFileCandidates(ctx)) {
    if (!existsSync(candidate)) continue
    try {
      return await readFile(candidate, "utf-8")
    } catch {
      continue
    }
  }
  return ""
}
