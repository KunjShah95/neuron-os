/**
 * orchestrate — Multi-agent orchestration CLI command.
 *
 * Decomposes a complex goal into sub-tasks and executes them
 * in parallel via the AgentPool.
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerOrchestrate(program: Command) {
  program
    .command("orchestrate")
    .alias("orch")
    .description("Decompose and execute a complex goal using multiple agents in parallel")
    .argument("<goal>", "The complex goal to decompose and execute")
    .option("--dry-run", "Show the decomposition plan without executing")
    .action(async (goal: string, opts: { dryRun?: boolean }) => {
      showBanner()

      console.log(theme.heading(`\n  🧠 Multi-Agent Orchestration\n`))
      console.log(theme.info(`  Goal: ${goal}`))
      console.log()

      try {
        const { runMultiAgent } = await import("../../agent/multi-agent")

        if (opts.dryRun) {
          // Just show the plan
          const { decomposeGoal } = await import("../../agent/multi-agent")
          const plan = await decomposeGoal(goal)

          console.log(theme.heading("  Decomposition Plan"))
          console.log()
          console.log(
            `  ${theme.bold(`${plan.subTasks.length} sub-tasks`)} in ${theme.bold(`${plan.parallelGroups.length} parallel groups`)}`,
          )
          console.log()

          for (const [i, group] of plan.parallelGroups.entries()) {
            console.log(`  ${theme.accent(`Group ${i + 1}`)} (${group.length} task(s)):`)
            for (const task of group) {
              const complexityColor =
                task.complexity === "simple" ? theme.dim : task.complexity === "medium" ? theme.info : theme.warn
              console.log(`    ${theme.bold(task.title)}`)
              console.log(`      ${task.description.slice(0, 120)}`)
              console.log(`      ${complexityColor(task.complexity)}`)
              if (task.dependencies.length > 0) {
                console.log(`      depends on: ${task.dependencies.join(", ")}`)
              }
            }
            console.log()
          }

          console.log(theme.dim("  Run without --dry-run to execute the plan"))
        } else {
          const result = await runMultiAgent(goal)

          console.log()
          if (result.overallSuccess) {
            console.log(theme.success("  ✅ All sub-tasks completed successfully"))
          } else {
            console.log(theme.warn("  ⚠️  Some sub-tasks failed"))
          }

          console.log(theme.dim(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`))
          console.log()

          for (const r of result.results) {
            const emoji = r.success ? "✅" : "❌"
            console.log(`  ${emoji} ${theme.bold(r.title)}`)
            console.log(`      ${r.summary.slice(0, 200)}`)
            if (r.error) console.log(`      ${theme.error(r.error)}`)
          }
        }
      } catch (err: unknown) {
        console.log(theme.error(`\n  ✗ Orchestration error: ${err instanceof Error ? err.message : String(err)}`))
        process.exit(1)
      }
    })
}
