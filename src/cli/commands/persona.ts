import type { Command } from "commander"
import { personaEngine } from "../../persona/engine"
import { theme } from "../theme"

export function registerPersona(program: Command) {
  const persona = program
    .command("persona")
    .description("Agent persona evolution — traits, mood, and communication style that grow from experience")
    .hook("preAction", () => {
      personaEngine.getConfig()
    })

  persona
    .command("evolve")
    .description("Run persona evolution for an agent type")
    .option("-t, --agent-type <type>", "Agent type to evolve", "general")
    .option("-i, --agent-id <id>", "Specific agent ID")
    .action((opts) => {
      const events = personaEngine.evolveForAgent(opts.agentType, opts.agentId || "")

      if (events.length === 0) {
        console.log(`  ${theme.muted(`No trait changes triggered for ${opts.agentType}`)}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold(`🧬 Persona Evolution: ${opts.agentType}`)}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      for (const evt of events) {
        const arrow = evt.direction === "increase" ? theme.success("↑") : evt.direction === "decrease" ? theme.error("↓") : theme.info("→")
        console.log(`  ${arrow} ${theme.bold(evt.traitName)}: ${evt.oldValue.toFixed(0)} → ${evt.newValue.toFixed(0)}`)
        console.log(`     ${theme.muted(evt.reason)}`)
      }
      console.log()
      console.log(`  ${theme.muted("Trigger: " + (events[0]?.trigger ?? ""))}`)
      console.log()
    })

  persona
    .command("status")
    .description("Show persona profiles and stats")
    .option("-t, --agent-type <type>", "Agent type")
    .option("-i, --agent-id <id>", "Agent ID")
    .action((opts) => {
      if (opts.agentType) {
        const profile = personaEngine.getProfile(opts.agentType, opts.agentId || "")
        if (!profile) {
          console.log(`  ${theme.muted(`No profile found for ${opts.agentType}`)}`)
          return
        }
        printProfile(profile)
      } else {
        const stats = personaEngine.getStats()
        const profiles = personaEngine.listProfiles()

        console.log()
        console.log(`  ${theme.bold("🧬 Persona Evolution")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Total events:")}      ${stats.totalEvents}`)
        console.log(`  ${theme.info("Evolutions:")}         ${stats.totalEvolutions}`)
        console.log(`  ${theme.info("Active profiles:")}    ${stats.activeProfiles}`)
        console.log(`  ${theme.info("Avg stability:")}      ${(stats.averageStability * 100).toFixed(1)}%`)
        console.log()
        if (stats.topTraits.length > 0) {
          console.log(`  ${theme.bold("Most Active Traits:")}`)
          for (const t of stats.topTraits) {
            console.log(`    ${theme.muted(t.name)}: ${t.totalDelta.toFixed(0)} total delta`)
          }
          console.log()
        }
        if (profiles.length > 0) {
          console.log(`  ${theme.bold("Profiles:")}`)
          for (const p of profiles.slice(0, 10)) {
            const topTrait = Object.entries(p.traitScores).sort((a, b) => b[1] - a[1])[0]
            const label = topTrait ? `${topTrait[0]}: ${topTrait[1].toFixed(0)}` : "no traits"
            console.log(`    ${theme.muted(p.agentType)} — ${label} — ${p.evolutionCount} evolutions`)
          }
          console.log()
        }
      }
    })

  persona
    .command("history")
    .description("Show persona evolution history")
    .option("-t, --agent-type <type>", "Filter by agent type")
    .option("-i, --agent-id <id>", "Filter by agent ID")
    .option("-l, --limit <count>", "Number of events", "30")
    .action((opts) => {
      const limit = Number.parseInt(opts.limit, 10)
      const events = personaEngine.getEvents(opts.agentType, opts.agentId || undefined, limit)

      if (events.length === 0) {
        console.log(`  ${theme.muted("No evolution events found.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("📜 Evolution History")}`)
      console.log(`  ${theme.muted("─".repeat(60))}`)
      for (const evt of events) {
        const arrow = evt.direction === "increase" ? "↑" : evt.direction === "decrease" ? "↓" : "→"
        const triggerTag = theme.muted(`[${evt.trigger}]`)
        console.log(`  ${arrow} ${theme.bold(evt.traitName)} ${theme.muted(`${evt.oldValue.toFixed(0)} → ${evt.newValue.toFixed(0)}`)} ${triggerTag}`)
        console.log(`     ${theme.muted(evt.reason.slice(0, 120))}`)
        console.log(`     ${theme.muted(evt.createdAt)}`)
        console.log()
      }
    })

  persona
    .command("config")
    .description("View or update persona configuration")
    .option("--enable", "Enable persona evolution")
    .option("--disable", "Disable persona evolution")
    .option("--min-exp <count>", "Minimum experiences before evolution", Number)
    .option("--cooldown <ms>", "Evolution cooldown in ms", Number)
    .action((opts) => {
      const config = personaEngine.getConfig()

      if (opts.enable) { config.enabled = true; personaEngine.updateConfig({ enabled: true }) }
      if (opts.disable) { config.enabled = false; personaEngine.updateConfig({ enabled: false }) }
      if (opts.minExp) { personaEngine.updateConfig({ minExperiencesBeforeEvolution: opts.minExp }) }
      if (opts.cooldown) { personaEngine.updateConfig({ evolutionCooldownMs: opts.cooldown }) }

      console.log()
      console.log(`  ${theme.bold("🧬 Persona Configuration")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log(`  ${theme.info("Enabled:")}                       ${config.enabled ? theme.success("yes") : theme.error("no")}`)
      console.log(`  ${theme.info("Auto evolve:")}                   ${config.autoEvolve ? theme.success("on") : theme.error("off")}`)
      console.log(`  ${theme.info("Min experiences:")}               ${config.minExperiencesBeforeEvolution}`)
      console.log(`  ${theme.info("Cooldown:")}                      ${(config.evolutionCooldownMs / 60000).toFixed(0)}min`)
      console.log(`  ${theme.info("Max trait delta:")}               ${config.maxTraitDelta}`)
      console.log(`  ${theme.info("Quirk threshold:")}               ${(config.quirkEmergenceThreshold * 100).toFixed(0)}%`)
      console.log(`  ${theme.info("Track communication:")}           ${config.trackCommunication ? theme.success("yes") : theme.warn("no")}`)
      console.log()
    })
}

function printProfile(profile: import("../../persona/types").PersonaProfile): void {
  console.log()
  console.log(`  ${theme.bold(`🧬 Persona: ${profile.name}`)}`)
  console.log(`  ${theme.muted("─".repeat(50))}`)
  console.log(`  ${theme.info("Type:")}          ${profile.agentType}`)
  console.log(`  ${theme.info("Archetype:")}     ${profile.archetype || "—"}`)
  console.log(`  ${theme.info("Evolutions:")}    ${profile.evolutionCount}`)
  console.log(`  ${theme.info("Stability:")}     ${(profile.stabilityScore * 100).toFixed(1)}%`)
  console.log(`  ${theme.info("Mood:")}          ${profile.dominantMood}`)
  console.log()
  console.log(`  ${theme.bold("Traits:")}`)
  const sorted = Object.entries(profile.traitScores).sort((a, b) => b[1] - a[1])
  for (const [name, score] of sorted) {
    const bar = theme.muted("▓".repeat(Math.round(score / 10))).padEnd(10, "░")
    console.log(`    ${bar} ${name}: ${score.toFixed(0)}`)
  }
  console.log()
  if (profile.lastEvolvedAt) {
    console.log(`  ${theme.muted(`Last evolved: ${profile.lastEvolvedAt}`)}`)
  }
  console.log()
}
