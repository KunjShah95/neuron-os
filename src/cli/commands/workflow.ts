/**
 * cli/commands/workflow — Workflow Builder TUI commands.
 *
 * Provides interactive workflow building, validation, and execution
 * through the CLI. Uses @clack/prompts for the TUI experience.
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { resetStdin } from "../stdin"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import type { AgentTypeName } from "../../agent/agent-types"
import type { WorkflowConfig, WorkflowNode } from "../../workflow/types"

// ── Constants ──────────────────────────────────────────────────────────

const WORKFLOWS_DIR = resolve(process.cwd(), "workflows")
const AGENT_TYPES = [
  { value: "build", label: "Build — Full-access development agent" },
  { value: "plan", label: "Plan — Architecture and planning" },
  { value: "read", label: "Read — Codebase exploration" },
  { value: "write", label: "Write — File creation and editing" },
  { value: "test", label: "Test — Run tests and analyze failures" },
  { value: "validate", label: "Validate — Type checking and linting" },
  { value: "review", label: "Review — Code review for security/patterns" },
  { value: "debug", label: "Debug — Systematic debugging" },
  { value: "document", label: "Document — Generate documentation" },
  { value: "refactor", label: "Refactor — Code restructuring" },
  { value: "deploy", label: "Deploy — Deployment and CI/CD" },
  { value: "monitor", label: "Monitor — Watch files and health checks" },
  { value: "explore", label: "Explore — Lightweight search" },
  { value: "adversarial", label: "Adversarial — Red-team agent" },
] as const

const TOPOLOGIES = [
  { value: "sequential", label: "Sequential — Agents run one after another" },
  { value: "fan-out", label: "Fan-out — Parallel with coordination" },
  { value: "debate", label: "Debate — Multiple agents on same problem" },
  { value: "ensemble", label: "Ensemble — Same task, different models" },
  { value: "supervisor", label: "Supervisor — Hierarchical delegation" },
] as const

// ── Register ───────────────────────────────────────────────────────────

export function registerWorkflow(program: Command) {
  const workflow = program
    .command("workflow")
    .description("Workflow builder — design and execute agent pipelines")

  workflow
    .command("build")
    .description("Interactive TUI workflow builder")
    .action(handleWorkflowBuild)

  workflow
    .command("run")
    .description("Execute a workflow file")
    .argument("<file>", "Path to workflow YAML file")
    .action(handleWorkflowRun)

  workflow.command("list").description("List saved workflows").action(handleWorkflowList)

  workflow
    .command("validate")
    .description("Validate a workflow file")
    .argument("<file>", "Path to workflow YAML file")
    .action(handleWorkflowValidate)
}

// ── Build (Interactive TUI) ────────────────────────────────────────────

async function handleWorkflowBuild() {
  await showBanner()

  const { text, select, multiselect, confirm, spinner } = await import("@clack/prompts")

  console.log(theme.heading("\n  🔷 Workflow Builder\n"))

  // Workflow metadata
  const name = await text({
    message: "Workflow name:",
    placeholder: "my-workflow",
    validate: (v) => (v && v.length > 0 ? undefined : "Name is required"),
  })

  if (typeof name === "symbol") return

  const description = await text({
    message: "Description (optional):",
    placeholder: "What does this workflow do?",
  })

  if (typeof description === "symbol") return

  // Topology
  const topology = await select({
    message: "Select workflow topology:",
    options: TOPOLOGIES.map((t) => ({ value: t.value, label: t.label })),
  })

  if (typeof topology === "symbol") return

  // Budget
  const budgetStr = await text({
    message: "Total budget in USD (0 for unlimited):",
    placeholder: "0",
    initialValue: "0",
    validate: (v) => {
      const n = parseFloat(v ?? "")
      return isNaN(n) || n < 0 ? "Must be a non-negative number" : undefined
    },
  })

  if (typeof budgetStr === "symbol") return
  const budget_usd = parseFloat(budgetStr) || undefined

  // Timeout
  const timeoutStr = await text({
    message: "Timeout in minutes (0 for no timeout):",
    placeholder: "30",
    initialValue: "30",
    validate: (v) => {
      const n = parseInt(v ?? "", 10)
      return isNaN(n) || n < 0 ? "Must be a non-negative integer" : undefined
    },
  })

  if (typeof timeoutStr === "symbol") return
  const timeout_minutes = parseInt(timeoutStr, 10) || undefined

  // Add nodes
  const nodes: Array<{
    id: string
    type: AgentTypeName
    prompt_template: string
    model?: string
    depends_on: string[]
  }> = []

  let addMore = true
  while (addMore) {
    console.log(theme.info(`\n  ── Add Node (${nodes.length + 1}) ──\n`))

    const nodeId = await text({
      message: "Node ID:",
      placeholder: `agent-${nodes.length + 1}`,
      validate: (v) => {
        if (!v) return "ID is required"
        if (nodes.some((n) => n.id === v)) return "ID already exists"
        return undefined
      },
    })

    if (typeof nodeId === "symbol") return

    const nodeType = await select({
      message: `Agent type for "${nodeId}":`,
      options: AGENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
    })

    if (typeof nodeType === "symbol") return

    const promptTemplate = await text({
      message: "Prompt template for this agent:",
      placeholder: `Execute ${nodeType} task`,
    })

    if (typeof promptTemplate === "symbol") return

    // Dependencies
    const depOptions = nodes.map((n) => ({ value: n.id, label: n.id }))
    const dependsOn =
      depOptions.length > 0
        ? await multiselect({
            message: "Dependencies (which nodes must complete first):",
            options: depOptions,
            required: false,
          })
        : []

    if (typeof dependsOn === "symbol") return

    nodes.push({
      id: nodeId,
      type: nodeType as AgentTypeName,
      prompt_template: promptTemplate,
      depends_on: Array.isArray(dependsOn) ? dependsOn : [],
    })

    const moreResult = await confirm({
      message: "Add another node?",
      initialValue: true,
    })

    if (typeof moreResult === "symbol") return
    addMore = moreResult
  }

  // Build edges from dependencies
  const edges: Array<{ from: string; to: string }> = []
  for (const node of nodes) {
    for (const dep of node.depends_on) {
      edges.push({ from: dep, to: node.id })
    }
  }

  // Build config
  const configNodes: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    prompt_template: n.prompt_template,
    model: n.model,
    depends_on: n.depends_on.length > 0 ? n.depends_on : undefined,
  }))

  const config: WorkflowConfig = {
    name,
    description: description || undefined,
    topology: topology as WorkflowConfig["topology"],
    budget_usd,
    timeout_minutes,
    nodes: configNodes,
    edges: edges.length > 0 ? edges : undefined,
  }

  // Preview
  console.log(theme.heading("\n  ── Workflow Preview ──\n"))
  console.log(`  Name:       ${config.name}`)
  console.log(`  Topology:   ${config.topology}`)
  console.log(`  Nodes:      ${config.nodes.length}`)
  if (config.budget_usd) console.log(`  Budget:     $${config.budget_usd}`)
  if (config.timeout_minutes) console.log(`  Timeout:    ${config.timeout_minutes}m`)
  console.log()

  // Validate
  const { validateWorkflow } = await import("../../workflow/validator")
  const validation = validateWorkflow(config)

  if (validation.errors.length > 0) {
    console.log(theme.error("  Validation Errors:"))
    for (const err of validation.errors) {
      console.log(`    ✗ ${err.message}`)
    }
    console.log()
  }

  if (validation.warnings.length > 0) {
    console.log(theme.warn("  Warnings:"))
    for (const warn of validation.warnings) {
      console.log(`    ⚠ ${warn.message}`)
    }
    console.log()
  }

  if (!validation.valid) {
    console.log(theme.error("  Cannot export workflow with validation errors.\n"))
    return
  }

  const shouldExport = await confirm({
    message: "Export to workflows/" + name + ".yaml?",
    initialValue: true,
  })

  if (typeof shouldExport === "symbol" || !shouldExport) return

  // Export
  const s = spinner()
  s.start("Exporting workflow...")

  try {
    if (!existsSync(WORKFLOWS_DIR)) {
      mkdirSync(WORKFLOWS_DIR, { recursive: true })
    }

    const yamlContent = stringifyYaml(config)

    const filePath = join(WORKFLOWS_DIR, `${name}.yaml`)
    writeFileSync(filePath, yamlContent, "utf-8")

    s.stop(`Exported to ${filePath}`)
    console.log(theme.success(`\n  ✅ Workflow "${name}" created successfully\n`))
  } catch (err: unknown) {
    s.stop("Export failed")
    console.error(theme.error(`\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`))
  } finally {
    resetStdin()
  }
}

// ── Run ────────────────────────────────────────────────────────────────

async function handleWorkflowRun(file: string) {
  await showBanner()
  console.log(theme.heading(`\n  🔷 Running Workflow: ${file}\n`))

  try {
    const { executeWorkflowFile } = await import("../../workflow/executor")
    const result = await executeWorkflowFile(file)

    console.log(theme.success("  ✅ Workflow completed\n"))
    console.log(
      `  Status:  ${result.status === "completed" ? theme.success("completed") : theme.error("failed")}`,
    )
    console.log(`  Nodes:   ${result.nodeResults.length}`)
    console.log(`  Time:    ${(result.totalDurationMs / 1000).toFixed(1)}s`)
    console.log(`  Summary: ${result.summary}`)
    console.log()

    console.log(theme.dim("  Node Results:"))
    for (const nr of result.nodeResults) {
      const icon = nr.status === "completed" ? "✅" : "❌"
      console.log(`  ${icon} ${nr.nodeId}: ${nr.output?.slice(0, 100) ?? nr.error ?? "no output"}`)
    }
    console.log()
  } catch (err: unknown) {
    console.error(theme.error(`\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`))
  }
}

// ── List ───────────────────────────────────────────────────────────────

async function handleWorkflowList() {
  await showBanner()

  if (!existsSync(WORKFLOWS_DIR)) {
    console.log(theme.dim("\n  No workflows directory found.\n"))
    return
  }

  const { readdirSync } = await import("node:fs")
  const files = readdirSync(WORKFLOWS_DIR).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  )

  if (files.length === 0) {
    console.log(theme.dim("\n  No workflow files found in workflows/\n"))
    return
  }

  console.log(theme.heading(`\n  🔷 Saved Workflows (${files.length})\n`))

  for (const file of files) {
    try {
      const content = readFileSync(join(WORKFLOWS_DIR, file), "utf-8")
      const config = parseYaml(content) as WorkflowConfig
      const nodeCount = config.nodes?.length ?? 0
      console.log(`  📄 ${file}`)
      console.log(`     ${config.name ?? "unnamed"} — ${config.topology ?? "unknown"} (${nodeCount} nodes)`)
    } catch {
      console.log(`  📄 ${file} ${theme.error("(invalid YAML)")}`)
    }
  }

  console.log()
}

// ── Validate ───────────────────────────────────────────────────────────

async function handleWorkflowValidate(file: string) {
  await showBanner()
  console.log(theme.heading(`\n  🔷 Validating: ${file}\n`))

  try {
    const { parseWorkflowFile } = await import("../../workflow/executor")
    const { validateWorkflow } = await import("../../workflow/validator")

    const config = parseWorkflowFile(file)
    const result = validateWorkflow(config)

    if (result.valid) {
      console.log(theme.success("  ✅ Workflow is valid\n"))
    } else {
      console.log(theme.error("  ✗ Workflow has errors:\n"))
      for (const err of result.errors) {
        console.log(`    ✗ ${err.message}`)
      }
    }

    if (result.warnings.length > 0) {
      console.log(theme.warn("\n  Warnings:"))
      for (const warn of result.warnings) {
        console.log(`    ⚠ ${warn.message}`)
      }
    }

    console.log()
  } catch (err: unknown) {
    console.error(theme.error(`\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`))
  }
}
