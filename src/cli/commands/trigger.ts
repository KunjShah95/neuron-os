/**
 * trigger — CLI commands for managing the trigger registry.
 *
 * Usage:
 *   aegis trigger list                          — List all triggers
 *   aegis trigger add <type> <name>             — Add a new trigger
 *   aegis trigger remove <id>                   — Remove a trigger
 *   aegis trigger set-enabled <id> <bool>       — Enable/disable a trigger
 *   aegis trigger fire <id>                     — Manually fire a trigger
 */

import type { Command } from "commander"


export function registerTrigger(program: Command): void {
  const trigger = program
    .command("trigger")
    .description("Manage event-driven triggers")

  trigger
    .command("list")
    .description("List all registered triggers")
    .option("-t, --type <type>", "Filter by trigger type (cron, file_watch, webhook, condition, gateway_command)")
    .option("--tag <tag>", "Filter by tag")
    .option("--enabled", "Show only enabled triggers")
    .option("--disabled", "Show only disabled triggers")
    .action(async (opts) => {
      const { triggerEngine } = await import("../../triggers/registry")
      const list = triggerEngine.list({
        type: opts.type as any,
        tag: opts.tag,
        enabled: opts.enabled ? true : opts.disabled ? false : undefined,
      })

      if (list.length === 0) {
        console.log("No triggers registered.")
        return
      }

      console.log(`\n  ${list.length} trigger(s) registered:\n`)
      for (const t of list) {
        const status = t.enabled ? "✓" : "✗"
        const lastFired = t.lastFiredAt ? ` (last: ${new Date(t.lastFiredAt).toLocaleString()})` : ""
        console.log(`  ${status} ${t.name}`)
        console.log(`     ID:        ${t.id}`)
        console.log(`     Type:      ${t.type}`)
        console.log(`     Goal:      ${t.action.goal}`)
        console.log(`     Mode:      ${t.action.mode}`)
        console.log(`     Fires:     ${t.fireCount}${lastFired}`)
        if (t.tags?.length) console.log(`     Tags:      ${t.tags.join(", ")}`)
        console.log()
      }
    })

  trigger
    .command("add")
    .description("Register a new trigger")
    .argument("<type>", "Trigger type: cron, file_watch, webhook, condition, gateway_command")
    .argument("<name>", "Human-readable trigger name")
    .requiredOption("-g, --goal <goal>", "Goal or command to execute when the trigger fires")
    .option("-m, --mode <mode>", "Action mode: spawn-agent (default), queue-task, run-command", "spawn-agent")
    .option("--agent-type <type>", "Agent type hint (for spawn-agent mode)")
    .option("--priority <priority>", "Task priority: low, normal, high, critical", "normal")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--schedule <interval>", "Cron schedule (e.g. 30m, 1h, 6h, 1d)")
    .option("--hours-start <h>", "Cron during-hours start (0-23)")
    .option("--hours-end <h>", "Cron during-hours end (0-23)")
    .option("--dir <path>", "File watch directory path")
    .option("--pattern <glob>", "File watch glob pattern")
    .option("--events <events>", "File watch events: change,create,delete (comma-separated)")
    .option("--debounce <ms>", "File watch debounce in ms", "1000")
    .option("--webhook-path <path>", "Webhook path (e.g. /webhook/custom)")
    .option("--metric <metric>", "Condition metric: cpu, memory, disk, git-changes, custom")
    .option("--threshold <n>", "Condition threshold", parseFloat)
    .option("--operator <op>", "Condition operator: gt, lt, gte, lte, eq")
    .option("--poll-ms <ms>", "Condition poll interval in ms", parseInt)
    .option("--cmd <command>", "Gateway command pattern (e.g. review, deploy)")
    .option("--platform <platform>", "Gateway platform filter (e.g. telegram, discord)")
    .action(async (type: string, name: string, opts) => {
      const { triggerEngine } = await import("../../triggers/registry")

      const action = {
        mode: opts.mode as "spawn-agent" | "queue-task" | "run-command",
        goal: opts.goal,
        agentType: opts.agentType,
        priority: opts.priority as "low" | "normal" | "high" | "critical",
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any
      switch (type) {
        case "cron":
          if (!opts.schedule) throw new Error("--schedule is required for cron triggers")
          config = { schedule: opts.schedule }
          if (opts.hoursStart !== undefined && opts.hoursEnd !== undefined) {
            config.duringHours = [parseInt(opts.hoursStart), parseInt(opts.hoursEnd)]
          }
          break
        case "file_watch":
          if (!opts.dir) throw new Error("--dir is required for file_watch triggers")
          config = {
            dir: opts.dir,
            pattern: opts.pattern,
            events: opts.events ? opts.events.split(",") : undefined,
            debounceMs: parseInt(opts.debounce),
          }
          break
        case "webhook":
          if (!opts.webhookPath) throw new Error("--webhook-path is required for webhook triggers")
          config = { path: opts.webhookPath }
          break
        case "condition":
          if (!opts.metric) throw new Error("--metric is required for condition triggers")
          config = {
            metric: opts.metric,
            threshold: opts.threshold ?? 80,
            operator: opts.operator ?? "gt",
            pollMs: opts.pollMs ?? 60_000,
          }
          break
        case "gateway_command":
          if (!opts.cmd) throw new Error("--cmd is required for gateway_command triggers")
          config = { command: opts.cmd, platform: opts.platform }
          break
        default:
          throw new Error(`Unknown trigger type: ${type}. Valid: cron, file_watch, webhook, condition, gateway_command`)
      }

      const trigger = triggerEngine.register({
        name,
        type: type as any,
        config,
        action,
        tags: opts.tags ? opts.tags.split(",").map((s: string) => s.trim()) : undefined,
        enabled: true,
      })

      console.log(`\n  ✅ Trigger registered: "${trigger.name}" (${trigger.id})\n`)
    })

  trigger
    .command("remove")
    .description("Remove a trigger by ID")
    .argument("<id>", "Trigger ID to remove")
    .action(async (id: string) => {
      const { triggerEngine } = await import("../../triggers/registry")
      const removed = triggerEngine.unregister(id)
      if (removed) {
        console.log(`\n  ✅ Trigger ${id} removed.\n`)
      } else {
        console.log(`\n  ❌ Trigger not found: ${id}\n`)
      }
    })

  trigger
    .command("set-enabled")
    .description("Enable or disable a trigger")
    .argument("<id>", "Trigger ID")
    .argument("<enabled>", "true or false")
    .action(async (id: string, enabled: string) => {
      const { triggerEngine } = await import("../../triggers/registry")
      const val = enabled === "true" || enabled === "1"
      const updated = triggerEngine.setEnabled(id, val)
      if (updated) {
        console.log(`\n  ✅ Trigger ${id} ${val ? "enabled" : "disabled"}.\n`)
      } else {
        console.log(`\n  ❌ Trigger not found: ${id}\n`)
      }
    })

  trigger
    .command("fire")
    .description("Manually fire a trigger by ID")
    .argument("<id>", "Trigger ID to fire")
    .action(async (id: string) => {
      const { triggerEngine } = await import("../../triggers/registry")
      const result = await triggerEngine.fireById(id)
      if (result.success) {
        console.log(`\n  ✅ Trigger fired: ${result.result || "ok"}\n`)
      } else {
        console.log(`\n  ❌ ${result.error}\n`)
      }
    })
}
