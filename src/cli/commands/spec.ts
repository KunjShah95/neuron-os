import type { Command } from "commander"
import { dirname, resolve } from "node:path"
import { theme } from "../theme"
import { showBanner } from "../banner"

export interface SpecCommandResult {
  ok: boolean
  code: number
  message: string
}

export interface SpecHashCheck {
  sessionId: string
  recordedHash: string
  currentHash: string
  match: boolean
  specName: string
  goal: string
  timestamp: string
}

function indent(text: string, spaces = 4): string {
  const pad = " ".repeat(spaces)
  return text
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n")
}

export function registerSpec(program: Command) {
  const spec = program
    .command("spec")
    .description("Declarative agent specs — validate, run, replay and list recorded runs")

  spec
    .command("validate")
    .description("Validate an agent spec file against the aegis/v1 schema")
    .argument("<file>", "Path to the spec YAML file")
    .action(handleSpecValidate)

  spec
    .command("run")
    .description("Run an agent spec")
    .argument("<file>", "Path to the spec YAML file")
    .requiredOption("--goal <goal>", "Goal handed to the agent")
    .action(handleSpecRun)

  spec
    .command("replay")
    .description("Replay a recorded spec run and verify the spec hash")
    .argument("<sessionId>", "Session id of the recorded run")
    .action(handleSpecReplay)

  spec.command("list").description("List recorded spec runs").action(handleSpecList)
}

async function handleSpecValidate(file: string) {
  await showBanner()
  const result = await validateSpecFile(file)
  if (!result.ok) process.exitCode = 1
}

async function handleSpecRun(file: string, opts: { goal: string }) {
  await showBanner()
  const result = await runSpecFile(file, opts.goal)
  if (!result.ok) process.exitCode = 1
}

async function handleSpecReplay(sessionId: string) {
  await showBanner()
  const result = await replaySpecRun(sessionId)
  if (!result.ok) process.exitCode = 1
}

async function handleSpecList() {
  await showBanner()
  const result = await listSpecRuns()
  if (!result.ok) process.exitCode = 1
}

export async function validateSpecFile(file: string): Promise<SpecCommandResult> {
  const { loadSpec, resolveSpecTools } = await import("../../agent/spec")
  const { hashSpec } = await import("../../agent/spec/hasher")

  let spec
  try {
    spec = loadSpec(file)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(theme.error(`\n  ✗ Invalid spec: ${file}\n`))
    console.log(theme.dim(indent(message)))
    console.log()
    return { ok: false, code: 1, message }
  }

  const tools = resolveSpecTools(spec)
  console.log(theme.heading(`\n  📋 Spec: ${file}\n`))
  console.log(`  ${theme.success("✓")} ${theme.bold("Valid")} ${theme.dim("(apiVersion aegis/v1, kind Agent)")}`)
  console.log(`  Name:      ${theme.bold(spec.metadata.name)}`)
  console.log(`  Type:      ${spec.spec.type}`)
  console.log(`  Model:     ${spec.spec.model.provider}/${spec.spec.model.name}`)
  console.log(`  Tools:     ${tools.length > 0 ? tools.join(", ") : theme.dim("(none)")}`)
  console.log(`  Memory:    ${spec.spec.memory?.namespace ?? "default"}`)
  if (spec.spec.budget?.usd) {
    console.log(`  Budget:    $${spec.spec.budget.usd}`)
  }
  if (spec.spec.budget?.tokens) {
    console.log(`  Tokens:    ${spec.spec.budget.tokens}`)
  }
  console.log(`  Hash:      ${theme.dim(hashSpec(spec))}`)
  console.log()

  return { ok: true, code: 0, message: "Spec is valid" }
}

export async function runSpecFile(file: string, goal: string): Promise<SpecCommandResult> {
  const { loadSpec, runSpec } = await import("../../agent/spec")
  const { resolveApiKey } = await import("../../ai")

  let spec
  try {
    spec = loadSpec(file)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(theme.error(`\n  ✗ Invalid spec: ${file}\n`))
    console.log(theme.dim(indent(message)))
    console.log()
    return { ok: false, code: 1, message }
  }

  const provider = spec.spec.model.provider
  if (!resolveApiKey(provider)) {
    const message = `No API key configured for provider "${provider}". Set the matching provider key before running a spec.`
    console.log(theme.error(`\n  ✗ ${message}\n`))
    return { ok: false, code: 1, message }
  }

  console.log(theme.heading(`\n  ▶ Running spec "${spec.metadata.name}"\n`))
  console.log(`  ${theme.dim("Goal:")} ${goal}`)

  try {
    const result = await runSpec(spec, { goal, baseDir: dirname(resolve(file)) })
    console.log(theme.success("\n  ✅ Run complete\n"))
    console.log(`  Session:   ${theme.bold(result.sessionId)}`)
    console.log(`  Hash:      ${theme.dim(result.specHash)}`)
    console.log(`  Tools:     ${result.tools.length > 0 ? result.tools.join(", ") : theme.dim("(none)")}`)
    console.log(`  Cost:      $${result.costUsd.toFixed(6)}`)
    console.log(`  Budget:    ${result.budgetStatus}`)
    console.log(`  Tokens:    ~${result.estimatedTokens}`)
    if (result.namespace) {
      console.log(`  Namespace: ${result.namespace}`)
    }
    if (result.overTokenBudget) {
      console.log(theme.warn("  ⚠ Token budget exceeded"))
    }
    console.log()
    if (result.text) {
      console.log(theme.heading("  Output"))
      console.log(result.text)
      console.log()
    }
    return { ok: true, code: 0, message: result.text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(theme.error(`\n  ✗ Run failed: ${message}\n`))
    return { ok: false, code: 1, message }
  }
}

export async function checkSpecHash(sessionId: string): Promise<SpecHashCheck | null> {
  const { getRunRecord } = await import("../../agent/spec")
  const { hashSpec } = await import("../../agent/spec/hasher")
  const record = getRunRecord(sessionId)
  if (!record) return null
  return {
    sessionId: record.sessionId,
    recordedHash: record.specHash,
    currentHash: hashSpec(record.spec),
    match: hashSpec(record.spec) === record.specHash,
    specName: record.spec?.metadata?.name ?? "unnamed",
    goal: record.input?.goal ?? "",
    timestamp: record.timestamp ?? "",
  }
}

export async function replaySpecRun(sessionId: string): Promise<SpecCommandResult> {
  const check = await checkSpecHash(sessionId)
  if (!check) {
    const message = `No run record found for session: ${sessionId}`
    console.log(theme.error(`\n  ✗ ${message}\n`))
    return { ok: false, code: 1, message }
  }

  console.log(theme.heading(`\n  ↻ Replaying spec run ${check.sessionId}\n`))
  console.log(`  Spec:      ${theme.bold(check.specName)}`)
  console.log(`  Goal:      ${check.goal}`)
  console.log(`  Recorded:  ${theme.dim(check.recordedHash)}`)
  console.log(`  Current:   ${theme.dim(check.currentHash)}`)
  console.log(
    `  Hash:      ${check.match ? theme.success("✓ match") : theme.error("✗ mismatch — the recorded spec changed")}`,
  )
  console.log()

  if (!check.match) {
    return { ok: false, code: 1, message: "Spec hash mismatch" }
  }

  const { replaySession } = await import("../../agent/spec/replayer")
  try {
    const replay = await replaySession(sessionId)
    console.log(theme.success("  ✅ Replay complete\n"))
    console.log(`  Replay id: ${theme.bold(replay.replay)}`)
    console.log(`  Match:     ${replay.match ? theme.success("✓ yes") : theme.warn("✗ no")}`)
    console.log()
    return { ok: true, code: 0, message: `Replayed ${sessionId}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(theme.error(`\n  ✗ Replay failed: ${message}\n`))
    return { ok: false, code: 1, message }
  }
}

export async function listSpecRuns(): Promise<SpecCommandResult> {
  const { listRunRecords, getRunsDir } = await import("../../agent/spec")
  const records = listRunRecords()

  if (records.length === 0) {
    console.log(theme.dim(`\n  No spec runs recorded in ${getRunsDir()}\n`))
    return { ok: true, code: 0, message: "No recorded runs" }
  }

  console.log(theme.heading(`\n  📋 Spec Runs (${records.length})\n`))
  for (const record of records) {
    const time = record.timestamp ? record.timestamp.slice(0, 19).replace("T", " ") : ""
    console.log(`  ${theme.bold(record.sessionId)} ${theme.dim(time)}`)
    console.log(`     ${record.spec?.metadata?.name ?? "unnamed"} — ${(record.input?.goal ?? "").slice(0, 70)}`)
  }
  console.log()

  return { ok: true, code: 0, message: `${records.length} recorded run(s)` }
}
