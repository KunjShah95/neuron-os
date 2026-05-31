import type { Command } from "commander"
import { theme } from "../theme"
import { addCronJob, removeCronJob, listActiveJobs, ensureHeartbeatFile, loadHeartbeatChecklist } from "../../cron"

export function registerCron(program: Command) {
  const cron = program
    .command("cron")
    .description("Manage scheduled jobs and heartbeat")

  cron
    .command("add <name> <schedule> <goal>")
    .description("Add a cron job (schedule: 30m, 1h, 6h, 12h, 1d)")
    .option("--type <type>", "Agent type to use")
    .action(async (name: string, schedule: string, goal: string, opts: { type?: string }) => {
      await addCronJob({ name, schedule, goal, agentType: opts.type })
      console.log(theme.success(`  ✓ Cron job "${name}" added (every ${schedule})`))
      console.log(theme.dim(`    Goal: ${goal.slice(0, 80)}`))
    })

  cron
    .command("remove <name>")
    .description("Remove a cron job")
    .action(async (name: string) => {
      const removed = await removeCronJob(name)
      if (removed) {
        console.log(theme.success(`  ✓ Cron job "${name}" removed`))
      } else {
        console.log(theme.error(`  ✗ Cron job "${name}" not found`))
      }
    })

  cron
    .command("list")
    .alias("ls")
    .description("List scheduled cron jobs")
    .action(async () => {
      const jobs = await listActiveJobs()
      if (jobs.length === 0) {
        console.log(theme.dim("  No cron jobs scheduled."))
        return
      }
      console.log(theme.heading("  Scheduled Jobs:"))
      console.log()
      for (const job of jobs) {
        const typeInfo = job.agentType ? theme.dim(` [${job.agentType}]`) : ""
        console.log(`  ${theme.accent(job.name.padEnd(20))} every ${theme.bold(job.schedule)}${typeInfo}`)
        console.log(`  ${theme.dim(job.goal.slice(0, 100))}`)
        console.log()
      }
    })

  cron
    .command("heartbeat")
    .description("Show heartbeat checklist")
    .action(async () => {
      await ensureHeartbeatFile()
      const checklist = await loadHeartbeatChecklist()
      console.log(theme.heading("  Heartbeat Checklist"))
      console.log()
      for (const line of checklist.split("\n")) {
        if (line.startsWith("#") && !line.startsWith("##")) {
          console.log(`  ${theme.bold(line.replace(/^#\s*/, ""))}`)
        } else if (line.startsWith("##")) {
          console.log(`\n  ${theme.accent(line.replace(/^##\s*/, ""))}`)
        } else if (line.trim().startsWith("- [")) {
          console.log(`    ${line.trim()}`)
        }
      }
      console.log()
      console.log(theme.dim("  Edit data/HEARTBEAT.md to customize your checklist"))
    })
}
