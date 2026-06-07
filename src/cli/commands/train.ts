import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerTrain(program: Command) {
  const train = program.command("train").description("Training trajectory management — export and manage training data")

  train
    .command("export")
    .description("Export training trajectories to file")
    .option("-f, --format <format>", "Output format: atropos or jsonl", "atropos")
    .option("-s, --since <days>", "Days to look back (default: 7)", "7")
    .option("-o, --output <path>", "Output file path", "./trajectories-export.jsonl")
    .option("--session <id>", "Export only this session ID")
    .action(handleTrainExport)
}

async function handleTrainExport(opts: { format?: string; since?: string; output?: string; session?: string }) {
  showBanner()

  const { TrajectoryExporter } = await import("../../training/exporter")
  const exporter = new TrajectoryExporter()

  const format = opts.format === "jsonl" ? "jsonl" : "atropos"
  const sinceDays = parseInt(opts.since ?? "7", 10) || 7
  const output = opts.output ?? "./trajectories-export.jsonl"

  console.log(theme.heading("\n  🏋️ Training Export\n"))
  console.log(`  Format:  ${theme.bold(format)}`)
  console.log(`  Since:   ${theme.bold(`${sinceDays} days`)}`)
  console.log(`  Output:  ${theme.bold(output)}`)
  if (opts.session) {
    console.log(`  Session: ${theme.bold(opts.session)}`)
  }
  console.log()

  exporter.export({ format, sinceDays, output, sessionId: opts.session })

  console.log(theme.success(`  ✓ Export complete\n`))
}
