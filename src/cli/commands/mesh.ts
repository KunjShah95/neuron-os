import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerMesh(program: Command) {
  const mesh = program.command("mesh").description("Multi-agent mesh — coordinate agent swarms")

  mesh
    .command("run")
    .description("Run a mesh topology")
    .argument("<topology>", "Topology type: sequential, fan-out, debate, ensemble, supervisor")
    .argument("<goal>", "The goal for the mesh to accomplish")
    .option("--agents <number>", "Number of agents in the mesh", "3")
    .option("--model <model>", "Model override for all agents")
    .option("--timeout <ms>", "Timeout per agent in ms", "300000")
    .action(handleMeshRun)

  mesh
    .command("eval")
    .description("Evaluate a completed mesh run")
    .argument("<runId>", "Mesh run ID to evaluate")
    .argument("<script>", "Evaluation script to run")
    .action(handleMeshEval)

  mesh.command("cancel <runId>").description("Cancel a running mesh").action(handleMeshCancel)

  mesh.command("list").description("List running meshes").action(handleMeshList)
}

async function handleMeshRun(
  topology: string,
  goal: string,
  opts: { agents?: string; model?: string; timeout?: string },
) {
  await showBanner()
  const count = Math.min(10, Math.max(1, parseInt(opts.agents ?? "3", 10) || 3))

  console.log(theme.heading(`\n  🔷 Mesh Run: ${topology}`))
  console.log(`  ${theme.dim(`Goal: ${goal}`)}`)
  console.log(`  ${theme.dim(`Agents: ${count}`)}`)
  console.log()

  try {
    const { MeshOrchestrator } = await import("../../mesh/orchestrator")
    const { randomUUID } = await import("node:crypto")

    const orchestrator = new MeshOrchestrator()

    // Build agents based on topology
    const agents = Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}-${randomUUID().slice(0, 8)}`,
      role: (topology === "supervisor" && i === 0 ? "coordinator" : "implementer") as string,
      goal,
      dependsOn: [] as string[],
      model: opts.model,
    }))

    // Set up dependencies for sequential
    if (topology === "sequential") {
      for (let i = 1; i < agents.length; i++) {
        const cur = agents[i]; const prev = agents[i - 1]; if (cur && prev) cur.dependsOn = [prev.id]
      }
    }

    let config: Record<string, unknown>

    switch (topology) {
      case "sequential":
        config = { topology: "sequential", agents }
        break
      case "fan-out":
        config = {
          topology: "fan-out",
          coordinator: agents[0] as (typeof agents)[0],
          workers: agents.slice(1),
          strategy: "all",
        }
        break
      case "debate":
        config = {
          topology: "debate",
          question: goal,
          debaters: agents.slice(0, Math.min(count, 3)),
          rounds: 2,
          synthesis: "vote",
        }
        break
      case "ensemble":
        config = {
          topology: "ensemble",
          task: goal,
          runs: agents.map((a, i) => ({
            agent: a,
            model: opts.model || (i % 2 === 0 ? "gpt-4o" : "claude-3-5-sonnet-latest"),
          })),
          aggregation: "vote",
        }
        break
      case "supervisor":
        config = {
          topology: "supervisor",
          supervisor: agents[0] as (typeof agents)[0],
          subAgents: agents.slice(1),
          reviewRequired: true,
        }
        break
      default:
        console.log(theme.error(`Unknown topology: ${topology}`))
        return
    }

    const result = await orchestrator.run(config)

    console.log(theme.success("  ✅ Mesh run completed\n"))
    console.log(
      `  Outcome: ${result.overallOutcome === "success" ? theme.success("success") : result.overallOutcome === "partial" ? theme.warn("partial") : theme.error("failed")}`,
    )
    console.log(`  Agents:  ${result.agentResults.length}`)
    console.log(`  Time:    ${(result.totalDurationMs / 1000).toFixed(1)}s`)
    console.log()
    console.log(theme.dim("  Agent Results:"))
    for (const ar of result.agentResults) {
      const icon = ar.outcome === "success" ? "✅" : "❌"
      console.log(`  ${icon} ${ar.role}: ${ar.summary.slice(0, 100)}`)
    }
    console.log()
  } catch (err: unknown) {
    console.error(theme.error(`\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`))
  }
}

async function handleMeshEval(runId: string, script: string) {
  await showBanner()
  console.log(theme.info(`\n  🔍 Evaluating mesh run ${runId}...\n`))

  try {
    const { Evaluator } = await import("../../mesh/evaluator")
    const evaluator = new Evaluator()
    const result = await evaluator.quickEval(runId, "mesh evaluation", script)

    console.log(theme.heading("  Evaluation Results\n"))
    console.log(
      `  Score:  ${result.overallPass ? theme.success("PASS") : theme.error("FAIL")} (${Math.round(result.overallScore * 100)}%)`,
    )
    console.log(`  ${result.summary}`)
    console.log()

    for (const r of result.results) {
      const icon = r.passed ? theme.success("✓") : theme.error("✗")
      console.log(`  ${icon} ${r.metric}: ${r.details || r.output.slice(0, 100)}`)
    }
    console.log()
  } catch (err: unknown) {
    console.error(theme.error(`\n  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`))
  }
}

async function handleMeshCancel(runId: string) {
  const { MeshOrchestrator } = await import("../../mesh/orchestrator")
  const orchestrator = new MeshOrchestrator()
  const cancelled = orchestrator.cancel(runId)
  if (cancelled) {
    console.log(theme.warn(`\n  ✋ Cancelled mesh run: ${runId}\n`))
  } else {
    console.log(theme.error(`\n  ✗ Run not found: ${runId}\n`))
  }
}

async function handleMeshList() {
  const { MeshOrchestrator } = await import("../../mesh/orchestrator")
  const orchestrator = new MeshOrchestrator()
  const running = orchestrator.listRunning()

  if (running.length === 0) {
    console.log(theme.dim("\n  No active mesh runs.\n"))
    return
  }

  console.log(theme.heading(`\n  🔷 Active Mesh Runs (${running.length})\n`))
  for (const id of running) {
    console.log(`  ⬡ ${id}`)
  }
  console.log()
}
