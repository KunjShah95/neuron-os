export type EvolutionTrigger =
  | "success-streak"
  | "failure-streak"
  | "pattern-repeated"
  | "dream-insight"
  | "social-influence"
  | "manual"
  | "milestone"

export type EvolutionDirection = "increase" | "decrease" | "emerge" | "fade"

export interface PersonaEvent {
  id: string
  agentType: string
  agentId: string
  trigger: EvolutionTrigger
  traitName: string
  oldValue: number
  newValue: number
  direction: EvolutionDirection
  reason: string
  sourceExperienceId: string
  sourceDreamId: string
  createdAt: string
}

export interface PersonaProfile {
  agentType: string
  agentId: string
  archetype: string
  name: string
  traitScores: Record<string, number>
  communicationStyle: string
  dominantMood: string
  quirkCount: number
  adaptationCount: number
  evolutionCount: number
  lastEvolvedAt: string
  stabilityScore: number
}

export interface PersonaConfig {
  enabled: boolean
  autoEvolve: boolean
  minExperiencesBeforeEvolution: number
  evolutionCooldownMs: number
  maxTraitDelta: number
  traitDecayRate: number
  quirkEmergenceThreshold: number
  trackCommunication: boolean
}

export const DEFAULT_PERSONA_CONFIG: PersonaConfig = {
  enabled: true,
  autoEvolve: true,
  minExperiencesBeforeEvolution: 5,
  evolutionCooldownMs: 3600000,
  maxTraitDelta: 5,
  traitDecayRate: 0.02,
  quirkEmergenceThreshold: 0.7,
  trackCommunication: true,
}

export interface PersonaStats {
  totalEvents: number
  totalEvolutions: number
  activeProfiles: number
  topTraits: Array<{ name: string; totalDelta: number }>
  topTriggers: Array<{ trigger: string; count: number }>
  averageStability: number
  lastCycleAt: string
}
