/**
 * pool — AgentPool CLI commands.
 *
 * Manage concurrent agent execution via the AgentPool.
 */

import type { Command } from "commander"
import { theme } from "../theme"

export function registerPool(program: Command) {
  const pool = program.command("pool").description("Manage the agent execution pool")

  // ── submit ──────────────────────────────────────────────────────────
  pool
    .command("submit <goal>")
    .description("Submit a task to the agent pool")
    .option("-n, --name <name>", "Task name (defaults to auto-generated)")
    .option("--priority <priority>", "Task priority: low, normal, high, critical", "normal")
    .option("--timeout <ms>", "Task timeout in milliseconds", "300000")
    .option("--tag <tags...>", "Tags for the task")
    .action(async (goal: string, opts: { name?: string; priority?: string; timeout?: string; tag?: string[] }) => {
      const { agentPool } = await import("../../agent/agent-pool")

      const validPriorities = ["low", "normal", "high", "critical"]
      const priority = opts.priority ?? "normal"
      if (!validPriorities.includes(priority)) {
        console.log(theme.error(`  Invalid priority: ${priority}. Must be one of: ${validPriorities.join(", ")}`))
        process.exit(1)
      }

      const taskId = agentPool.submit(goal, {
        name: opts.name,
        priority: priority as any,
        timeoutMs: parseInt(opts.timeout ?? "300000", 10),
        tags: opts.tag,
      })

      console.log(theme.success(`  ✓ Task submitted`))
      console.log(`    id:       ${theme.dim(taskId)}`)
      console.log(`    priority: ${theme.accent(priority)}`)
      console.log(`    timeout:  ${theme.dim(`${Math.round(parseInt(opts.timeout ?? "300000", 10) / 1000)}s`)}`)
      console.log()
      console.log(theme.dim("  Use `aegis pool status <taskId>` to check progress"))
    })

  // ── status ──────────────────────────────────────────────────────────
  pool
    .command("status [taskId]")
    .description("Show pool status or specific task status")
    .action(async (taskId?: string) => {
      const { agentPool } = await import("../../agent/agent-pool")

      if (taskId) {
        // Show specific task status — poll for result
        console.log(theme.info(`  Waiting for task ${theme.dim(taskId)}…`))
        console.log()

        try {
          const result = await agentPool.waitForTask(taskId, 120_000)
          const emoji = result.success ? "✅" : "❌"
          console.log(`  ${emoji} ${theme.bold(result.taskId)}`)
          console.log(`    status:    ${result.success ? theme.success("completed") : theme.error("failed")}`)
          console.log(`    duration:  ${theme.dim(`${(result.durationMs / 1000).toFixed(1)}s`)}`)
          console.log(`    summary:   ${result.summary.slice(0, 200)}`)
          if (result.error) console.log(`    error:     ${theme.error(result.error)}`)
        } catch (err: unknown) {
          console.log(theme.error(`  ✗ Task did not complete in time: ${err instanceof Error ? err.message : String(err)}`))
        }
      } else {
        // Show pool summary
        const stats = agentPool.getStats()
        console.log(theme.heading("  Agent Pool Status"))
        console.log()
        console.log(`  ${theme.bold("Running:")}   ${stats.running}`)
        console.log(`  ${theme.bold("Queued:")}    ${stats.queued}`)
        console.log(`  ${theme.bold("Completed:")} ${stats.completed}`)
        console.log(`  ${theme.bold("Failed:")}    ${stats.failed}`)
        console.log(`  ${theme.bold("Max conc:")}  ${stats.maxConcurrency}`)
        console.log(`  ${theme.bold("Util:")}      ${stats.utilizationPercent}%`)
      }
    })

  // ── cancel ──────────────────────────────────────────────────────────
  pool
    .command("cancel <taskId>")
    .description("Cancel a queued or running task")
    .action(async (taskId: string) => {
      const { agentPool } = await import("../../agent/agent-pool")

      const cancelled = agentPool.cancel(taskId)
      if (cancelled) {
        console.log(theme.warn(`  ✗ Task ${theme.dim(taskId)} cancelled`))
      } else {
        console.log(theme.error(`  Task ${theme.dim(taskId)} not found in queue or running list`))
      }
    })

  // ── stats ───────────────────────────────────────────────────────────
  pool
    .command("stats")
    .description("Detailed pool statistics")
    .action(async () => {
      const { agentPool } = await import("../../agent/agent-pool")

      const stats = agentPool.getStats()

      console.log(theme.heading("  Agent Pool Statistics"))
      console.log()
      console.log(`  ${theme.bold("Concurrency:")}`)
      console.log(`    max:         ${stats.maxConcurrency}`)
      console.log(`    running:     ${stats.running}`)
      console.log(`    utilization: ${stats.utilizationPercent}%`)
      console.log()
      console.log(`  ${theme.bold("Queue:")}`)
      console.log(`    queued:      ${stats.queued}`)
      console.log()
      console.log(`  ${theme.bold("Throughput:")}`)
      console.log(`    completed:   ${stats.completed}`)
      console.log(`    failed:      ${stats.failed}`)
      const total = stats.completed + stats.failed
      const successRate = total > 0 ? Math.round((stats.completed / total) * 100) : 0
      console.log(`    success:     ${successRate}%`)
    })
}
