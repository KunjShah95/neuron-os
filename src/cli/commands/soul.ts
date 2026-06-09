import type { Command } from "commander"
import { soulManager, ARCHETYPE_DEFINITIONS } from "../../agent/soul"
import { theme } from "../theme"

export function registerSoul(program: Command) {
  const soul = program
    .command("soul")
    .description("Agent soul & emotion system — archetypes, moods, and emotional health")
    .hook("preAction", () => {
      // no-op
    })

  soul
    .command("list")
    .description("List all registered agent souls with mood and archetype")
    .action(() => {
      const souls = soulManager.list()

      if (souls.length === 0) {
        console.log(`  ${theme.muted("No agent souls registered yet.")}`)
        console.log()
        console.log(`  ${theme.muted("Souls are created when agents spawn. Spawn an agent first.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("🧠 Agent Souls")}`)
      console.log(`  ${theme.muted("─".repeat(70))}`)

      for (const { agentId, soul: s } of souls) {
        const def = ARCHETYPE_DEFINITIONS[s.archetype]
        const moodEmoji = soulManager.getMoodEmoji(s.mood.mood)
        const moodLabel = s.mood.mood.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
        const streakInfo = s.mood.streak > 0
          ? theme.muted(` (streak: ${s.mood.streak} ${s.mood.lastTrigger === "success" ? "wins" : "setbacks"})`)
          : ""
        const adaptations = s.adaptations.length > 0 ? theme.info(` · ${s.adaptations.length} adaptations`) : ""

        console.log(`  ${def.icon} ${theme.bold(s.name)} ${theme.muted(`(${agentId})`)}`)
        console.log(`     ${theme.accent(def.title)} · ${moodEmoji} ${moodLabel}${streakInfo}${adaptations}`)
        console.log()
      }

      // Fleet health summary
      const moodCounts = new Map<string, number>()
      let totalStreak = 0
      for (const { soul: s } of souls) {
        moodCounts.set(s.mood.mood, (moodCounts.get(s.mood.mood) ?? 0) + 1)
        totalStreak += s.mood.streak
      }

      const burnedOut = moodCounts.get("burned_out") ?? 0
      const frustrated = moodCounts.get("frustrated") ?? 0
      const health = burnedOut > 0
        ? theme.error("⚠ CONCERNING")
        : frustrated > 0
          ? theme.warn("⚠ STRAINED")
          : theme.success("✓ HEALTHY")

      console.log(`  ${theme.bold("Fleet Mood Health:")} ${health}`)
      console.log(`  ${theme.muted(`  ${souls.length} agents · ${[...moodCounts.entries()].map(([m, c]) => `${m}: ${c}`).join(", ")}`)}`)
      console.log()
    })

  soul
    .command("card <agentId>")
    .description("Show a detailed soul card for a specific agent")
    .action((agentId: string) => {
      const card = soulManager.generateSoulCard(agentId)
      if (!card) {
        console.error(`  ${theme.error("✖")} No soul found for agent "${agentId}"`)
        console.log(`  ${theme.muted("Run 'aegis soul list' to see all registered souls.")}`)
        process.exit(1)
      }
      console.log()
      console.log(card)
      console.log()
    })

  soul
    .command("mood <agentId>")
    .description("Show the current mood and emotional state of an agent")
    .option("--set-success", "Simulate a success outcome and update mood")
    .option("--set-failure", "Simulate a failure outcome and update mood")
    .action((agentId: string, opts: { setSuccess?: boolean; setFailure?: boolean }) => {
      if (opts.setSuccess) {
        const newMood = soulManager.updateMood(agentId, "success")
        if (!newMood) {
          console.error(`  ${theme.error("✖")} No soul found for agent "${agentId}"`)
          process.exit(1)
        }
        console.log(`  ${theme.success("✓")} Mood updated — agent now: ${soulManager.formatMood(newMood.mood)} (streak: ${newMood.streak})`)
        return
      }

      if (opts.setFailure) {
        const newMood = soulManager.updateMood(agentId, "failure")
        if (!newMood) {
          console.error(`  ${theme.error("✖")} No soul found for agent "${agentId}"`)
          process.exit(1)
        }
        console.log(`  ${theme.warn("⚠")} Mood updated — agent now: ${soulManager.formatMood(newMood.mood)} (streak: ${newMood.streak})`)
        return
      }

      const soul = soulManager.get(agentId)
      if (!soul) {
        console.error(`  ${theme.error("✖")} No soul found for agent "${agentId}"`)
        console.log(`  ${theme.muted("Run 'aegis soul list' to see all registered souls.")}`)
        process.exit(1)
      }

      const moodEmoji = soulManager.getMoodEmoji(soul.mood.mood)
      const def = ARCHETYPE_DEFINITIONS[soul.archetype]

      console.log()
      console.log(`  ${def.icon} ${theme.bold(soul.name)} ${theme.muted(`(${agentId})`)}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log(`  ${theme.info("Current Mood:")}    ${moodEmoji} ${soulManager.formatMood(soul.mood.mood)}`)
      console.log(`  ${theme.info("Streak:")}           ${soul.mood.streak} ${soul.mood.lastTrigger === "initial" ? "" : soul.mood.lastTrigger === "success" ? "consecutive wins" : "consecutive setbacks"}`)
      console.log(`  ${theme.info("Since:")}            ${soul.mood.since.slice(0, 10)}`)
      console.log(`  ${theme.info("Last trigger:")}     ${soul.mood.lastTrigger}`)
      console.log()
      console.log(`  ${theme.bold("Mood Effects:")}`)
      console.log(`    ${theme.muted("Communication overrides apply to agent output style")}`)
      console.log(`    ${theme.muted("Behavioral heuristics influence decision-making")}`)
      console.log()
    })
}
