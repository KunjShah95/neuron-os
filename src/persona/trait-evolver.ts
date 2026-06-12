import { createLogger } from "../cli/logger"
import { experienceStore } from "../experience/store"
import { dreamEngine } from "../dream/engine"
import { personaStore } from "./persona-store"
import type { PersonaEvent, EvolutionTrigger, EvolutionDirection } from "./types"

const log = createLogger("trait-evolver")

interface TraitDef {
  name: string
  description: string
  keywords: string[]
}

const TRAITS: TraitDef[] = [
  { name: "curiosity", description: "Desire to explore and ask questions", keywords: ["explore", "investigate", "learn", "discover", "curious"] },
  { name: "tenacity", description: "Persistence in the face of failure", keywords: ["retry", "attempt", "persist", "try again", "keep going"] },
  { name: "caution", description: "Carefulness and risk awareness", keywords: ["careful", "validate", "check", "verify", "safety", "backup"] },
  { name: "creativity", description: "Novel approaches and unconventional solutions", keywords: ["creative", "alternative", "novel", "different approach", "think outside"] },
  { name: "precision", description: "Attention to detail and accuracy", keywords: ["exact", "precise", "accurate", "detailed", "specific"] },
  { name: "efficiency", description: "Optimization and resource consciousness", keywords: ["optimize", "efficient", "fast", "quick", "minimal"] },
  { name: "collaboration", description: "Tendency to seek help and share", keywords: ["collaborate", "share", "help", "team", "together", "ask"] },
  { name: "confidence", description: "Self-assurance in decision-making", keywords: ["confident", "sure", "certain", "definitely", "will work"] },
]

export class TraitEvolver {
  computeEvolutionFromExperiences(agentType: string, agentId: string): PersonaEvent[] {
    const events: PersonaEvent[] = []
    const recent = experienceStore.listRecent(50)

    if (recent.length < 3) return events

    const agentExperiences = recent.filter((e) => e.agentType === agentType)
    if (agentExperiences.length < 3) return events

    const outcomes = agentExperiences.map((e) => e.outcome)
    const rewards = agentExperiences.map((e) => e.reward)
    const existing = personaStore.getProfile(agentType, agentId)
    const traitScores = existing?.traitScores || {}

    const successStreak = this.computeStreak(outcomes, "success")
    const failureStreak = this.computeStreak(outcomes, "failed")

    if (successStreak >= 3) {
      const currentVal = traitScores["confidence"] || 50
      const delta = Math.min(successStreak * 2, 10)
      events.push(this.makeEvent(agentType, agentId, "success-streak", "confidence", currentVal, Math.min(100, currentVal + delta), "increase",
        `${successStreak} consecutive successes boosted confidence`))
    }

    if (failureStreak >= 2) {
      const cautionVal = traitScores["caution"] || 50
      const cautionDelta = Math.min(failureStreak * 3, 12)
      events.push(this.makeEvent(agentType, agentId, "failure-streak", "caution", cautionVal, Math.min(100, cautionVal + cautionDelta), "increase",
        `${failureStreak} consecutive failures increased caution`))

      const confidenceVal = traitScores["confidence"] || 50
      const confDelta = Math.min(failureStreak * 3, 10)
      events.push(this.makeEvent(agentType, agentId, "failure-streak", "confidence", confidenceVal, Math.max(0, confidenceVal - confDelta), "decrease",
        `${failureStreak} consecutive failures dampened confidence`))

      if (failureStreak >= 3) {
        const tenacityVal = traitScores["tenacity"] || 50
        events.push(this.makeEvent(agentType, agentId, "failure-streak", "tenacity", tenacityVal, Math.min(100, tenacityVal + 3), "increase",
          `Persistent through ${failureStreak} failures — tenacity grows`))
      }
    }

    const avgReward = rewards.reduce((s, r) => s + r, 0) / rewards.length
    if (avgReward > 0.8 && agentExperiences.length > 5) {
      const effVal = traitScores["efficiency"] || 50
      events.push(this.makeEvent(agentType, agentId, "pattern-repeated", "efficiency", effVal, Math.min(100, effVal + 2), "increase",
        `Consistently high rewards (${(avgReward * 100).toFixed(0)}%) suggest efficient patterns`))
    }

    if (agentExperiences.length > 10) {
      const tags = agentExperiences.flatMap((e) => e.tags || [])
      const tagFreq: Record<string, number> = {}
      for (const t of tags) tagFreq[t] = (tagFreq[t] || 0) + 1

      const dominantTag = Object.entries(tagFreq).sort((a, b) => b[1] - a[1])[0]
      if (dominantTag && dominantTag[1] >= 3) {
        const trait = this.tagToTrait(dominantTag[0])
        if (trait) {
          const currentVal = traitScores[trait.name] || 50
          events.push(this.makeEvent(agentType, agentId, "pattern-repeated", trait.name, currentVal, Math.min(100, currentVal + 3), "increase",
            `Repeated ${dominantTag[0]} tasks strengthen ${trait.name}`))
        }
      }
    }

    for (const evt of events) personaStore.recordEvent(evt)
    return events
  }

  computeEvolutionFromDreams(agentType: string, agentId: string): PersonaEvent[] {
    const events: PersonaEvent[] = []
    try {
      const insights = dreamEngine.getInsights(5, true)
      for (const insight of insights) {
        const desc = insight.description.toLowerCase()
        const matchedTrait = TRAITS.find((t) => t.keywords.some((k) => desc.includes(k)))
        if (!matchedTrait) continue

        const existing = personaStore.getProfile(agentType, agentId)
        const currentVal = existing?.traitScores[matchedTrait.name] || 50
        const direction = insight.confidence > 0.6 ? "increase" as EvolutionDirection : "decrease" as EvolutionDirection
        const delta = direction === "increase" ? 3 : -2

        events.push(this.makeEvent(agentType, agentId, "dream-insight", matchedTrait.name, currentVal,
          Math.max(0, Math.min(100, currentVal + delta)), direction,
          `Dream insight "${insight.title}" suggested ${direction} in ${matchedTrait.name}`))
      }
      for (const evt of events) personaStore.recordEvent(evt)
    } catch {
      log.debug("Could not fetch dream insights for persona evolution")
    }
    return events
  }

  aggregateProfile(agentType: string, agentId: string): void {
    const events = personaStore.getEvents(agentType, agentId, 100)
    const currentTraits: Record<string, number> = {}

    for (const t of TRAITS) {
      const traitEvents = events.filter((e) => e.traitName === t.name)
      if (traitEvents.length === 0) {
        currentTraits[t.name] = 50
      } else {
        currentTraits[t.name] = (traitEvents[traitEvents.length - 1] as (typeof traitEvents)[0]).newValue
      }
    }

    const triggerCounts: Record<string, number> = {}
    for (const e of events) {
      triggerCounts[e.trigger] = (triggerCounts[e.trigger] || 0) + 1
    }

    const uniqueTriggers = Object.keys(triggerCounts).length
    const stabilityScore = Math.max(0, Math.min(1, 1 - (uniqueTriggers / events.length || 0)))

    const profile: import("./types").PersonaProfile = {
      agentType,
      agentId,
      archetype: "",
      name: agentType,
      traitScores: currentTraits,
      communicationStyle: "{}",
      dominantMood: "content",
      quirkCount: 0,
      adaptationCount: 0,
      evolutionCount: events.length,
      lastEvolvedAt: events.length > 0 ? (events[0] as (typeof events)[0]).createdAt : "",
      stabilityScore,
    }

    personaStore.saveProfile(profile)
  }

  private makeEvent(
    agentType: string, agentId: string, trigger: EvolutionTrigger,
    traitName: string, oldValue: number, newValue: number,
    direction: EvolutionDirection, reason: string,
  ): PersonaEvent {
    return { id: "", agentType, agentId, trigger, traitName, oldValue, newValue, direction, reason, sourceExperienceId: "", sourceDreamId: "", createdAt: "" }
  }

  private computeStreak(outcomes: string[], target: string): number {
    let streak = 0
    for (let i = outcomes.length - 1; i >= 0; i--) {
      if (outcomes[i] === target) streak++
      else break
    }
    return streak
  }

  private tagToTrait(tag: string): TraitDef | null {
    const tagLower = tag.toLowerCase()
    if (tagLower.includes("bug") || tagLower.includes("fix")) return TRAITS.find((t) => t.name === "precision") || null
    if (tagLower.includes("feature") || tagLower.includes("new")) return TRAITS.find((t) => t.name === "creativity") || null
    if (tagLower.includes("refactor") || tagLower.includes("clean")) return TRAITS.find((t) => t.name === "efficiency") || null
    if (tagLower.includes("test") || tagLower.includes("validate")) return TRAITS.find((t) => t.name === "caution") || null
    if (tagLower.includes("explore") || tagLower.includes("research")) return TRAITS.find((t) => t.name === "curiosity") || null
    return null
  }
}

export const traitEvolver = new TraitEvolver()
