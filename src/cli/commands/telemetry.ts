import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { createLogger } from "../logger"

const log = createLogger("cli:telemetry")

export function registerTelemetry(program: Command) {
  const telemetry = program
    .command("telemetry")
    .alias("tel")
    .description("Manage opt-in usage telemetry (no PII)")

  // ── status ─────────────────────────────────────────────────────────

  telemetry
    .command("status")
    .alias("stats")
    .description("Show current telemetry configuration")
    .action(async () => {
      const { getTelemetryStats } = await import("../../telemetry/index")
      const stats = getTelemetryStats()

      showBanner()
      console.log()
      console.log(`  ${theme.heading("Telemetry")}`)
      console.log()
      console.log(`  ${theme.bold("Status:")}       ${stats.optedIn ? theme.success("Enabled") : theme.warn("Disabled")}`)
      console.log(`  ${theme.bold("Queue size:")}   ${theme.muted(String(stats.queueSize))}`)
      console.log(`  ${theme.bold("Endpoint:")}     ${theme.muted(stats.endpoint)}`)
      console.log()
      console.log(`  ${theme.muted("What's tracked: command name, duration, success/failure, timestamp, version")}`)
      console.log(`  ${theme.muted("No PII:       no IP, machine ID, file paths, or environment variables")}`)
      console.log()
    })

  // ── opt-in ─────────────────────────────────────────────────────────

  telemetry
    .command("opt-in")
    .description("Enable usage telemetry")
    .action(async () => {
      const { setOptedIn } = await import("../../telemetry/index")
      setOptedIn(true)
      console.log(`  ${theme.success(" ✓ Telemetry enabled")}`)
      console.log(`  ${theme.muted("   Command usage data will be collected (no PII)")}`)
      log.info("Telemetry opted in")
    })

  // ── opt-out ────────────────────────────────────────────────────────

  telemetry
    .command("opt-out")
    .description("Disable usage telemetry")
    .action(async () => {
      const { setOptedIn } = await import("../../telemetry/index")
      setOptedIn(false)
      console.log(`  ${theme.success(" ✓ Telemetry disabled")}`)
      log.info("Telemetry opted out")
    })

  // ── flush ──────────────────────────────────────────────────────────

  telemetry
    .command("flush")
    .description("Send any queued telemetry events now")
    .action(async () => {
      const { flush, getTelemetryStats, isOptedIn: checkOptedIn } = await import("../../telemetry/index")
      if (!checkOptedIn()) {
        console.log(`  ${theme.warn("Telemetry is disabled — no events to flush")}`)
        return
      }
      const before = getTelemetryStats().queueSize
      await flush()
      console.log(`  ${theme.success(` ✓ Flushed ${before} event(s)`)}`)
      log.info("Telemetry flushed", { count: before })
    })

  // Default: show status
  telemetry.action(async () => {
    // Forward to status subcommand
    const { getTelemetryStats } = await import("../../telemetry/index")
    const stats = getTelemetryStats()

    showBanner()
    console.log()
    console.log(`  ${theme.heading("Telemetry")}`)
    console.log()
    console.log(`  ${theme.bold("Status:")}       ${stats.optedIn ? theme.success("Enabled") : theme.warn("Disabled")}`)
    console.log(`  ${theme.bold("Queue size:")}   ${theme.muted(String(stats.queueSize))}`)
    console.log()
    console.log(`  ${theme.muted("Subcommands:")}`)
    console.log(`  ${theme.muted("  telemetry opt-in     Enable telemetry")}`)
    console.log(`  ${theme.muted("  telemetry opt-out    Disable telemetry")}`)
    console.log(`  ${theme.muted("  telemetry status     Show configuration")}`)
    console.log(`  ${theme.muted("  telemetry flush      Send queued events")}`)
    console.log(`  ${theme.muted("  AEGIS_TELEMETRY=1    Env var override (session-only)")}`)
    console.log()
  })
}
