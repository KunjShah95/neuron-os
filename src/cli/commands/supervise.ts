/**
 * supervise — Autonomous agent supervision with auto-restart on failure.
 *
 * Wraps the Supervisor class as a CLI command. Spawns an agent worker,
 * monitors it, and restarts on failure up to a configurable limit.
 */

import type { Command } from "commander"
import { Supervisor } from "../../agent/supervisor"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerSupervise(program: Command) {
  program
    .command("supervise <goal>")
    .description("Spawn an agent and supervise it — auto-restart on failure")
    .option("-t, --agent-type <type>", "Agent type (build, test, review, etc.)", "default")
    .option("-r, --max-restarts <n>", "Max restarts before giving up", "3")
    .action(async (goal: string, opts: { agentType?: string; maxRestarts?: string }) => {
      showBanner()

      const maxRestartsRaw = parseInt(opts.maxRestarts || "3", 10)
      const maxRestarts = Number.isNaN(maxRestartsRaw) ? 3 : maxRestartsRaw

      console.log(`  ${theme.heading("🧬 Supervisor")}`)
      console.log(`  ${theme.muted(`Goal:     `)} ${goal.slice(0, 120)}`)
      console.log(`  ${theme.muted(`Restarts: `)} ${maxRestarts > 0 ? `up to ${maxRestarts}` : "none"}`)
      console.log()

      try {
        const supervisor = new Supervisor({
          goal,
          agentType: opts.agentType || "default",
          maxRestarts,
        })

        console.log(`  ${theme.info("Monitoring agent... (Ctrl+C to stop)")}`)
        console.log()

        await supervisor.run()

        console.log()
        console.log(`  ${theme.success("✅ Supervision complete.")}`)
      } catch (err: unknown) {
        console.log(`  ${theme.error(`❌ Supervision failed: ${err instanceof Error ? err.message : String(err)}`)}`)
        process.exit(1)
      }
    })
}
