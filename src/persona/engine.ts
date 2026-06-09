import { createLogger } from "../cli/logger"
import { personaStore } from "./persona-store"
import { TraitEvolver, traitEvolver } from "./trait-evolver"
import type { PersonaConfig, PersonaProfile, PersonaStats, PersonaEvent } from "./types"
import { DEFAULT_PERSONA_CONFIG } from "./types"

const log = createLogger("persona-engine")

export class PersonaEngine {
  private evolver: TraitEvolver
  private config: PersonaConfig

  constructor(config?: Partial<PersonaConfig>) {
    this.evolver = traitEvolver
    this.config = { ...DEFAULT_PERSONA_CONFIG, ...config }
  }

  getConfig(): PersonaConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<PersonaConfig>): void {
    this.config = { ...this.config, ...config }
  }

  evolveForAgent(agentType: string, agentId = ""): PersonaEvent[] {
    const events: PersonaEvent[] = []

    const fromExp = this.evolver.computeEvolutionFromExperiences(agentType, agentId)
    events.push(...fromExp)

    const fromDreams = this.evolver.computeEvolutionFromDreams(agentType, agentId)
    events.push(...fromDreams)

    this.evolver.aggregateProfile(agentType, agentId)

    if (events.length > 0) {
      log.info(`Evolved ${agentType}/${agentId || "default"}: ${events.length} trait change(s)`)
    }

    return events
  }

  evolveAll(): { totalEvents: number; profilesAffected: number } {
    const profiles = personaStore.listProfiles()
    let totalEvents = 0
    let profilesAffected = 0

    const agentTypes = new Set(profiles.map((p) => p.agentType))
    agentTypes.add("general")

    for (const agentType of agentTypes) {
      const events = this.evolveForAgent(agentType, "")
      if (events.length > 0) {
        totalEvents += events.length
        profilesAffected++
      }
    }

    return { totalEvents, profilesAffected }
  }

  getProfile(agentType: string, agentId = ""): PersonaProfile | null {
    const existing = personaStore.getProfile(agentType, agentId)
    if (!existing) {
      this.evolver.aggregateProfile(agentType, agentId)
    }
    return personaStore.getProfile(agentType, agentId)
  }

  listProfiles(): PersonaProfile[] {
    return personaStore.listProfiles()
  }

  getEvents(agentType?: string, agentId?: string, limit = 50): PersonaEvent[] {
    return personaStore.getEvents(agentType, agentId, limit)
  }

  getStats(): PersonaStats {
    return personaStore.getStats()
  }
}

export const personaEngine = new PersonaEngine()
