import { createLogger } from "../cli/logger"
import { agentManager } from "../agent/manager"

const log = createLogger("ci-investigator")

export interface InvestigationResult {
  success: boolean
  fix_branch?: string
  fix_description?: string
  diff?: string
  cost_usd: number
  error?: string
}

export async function investigate(params: {
  repo: string
  runId: string
  headSha?: string
  logsUrl?: string
  budgetUsd: number
  model?: string
}): Promise<InvestigationResult> {
  const agentId = `ci-fix-${params.repo.replace("/", "-")}-${params.runId}`
  const startTime = Date.now()

  log.info(`Starting CI investigation for ${params.repo} #${params.runId}`)

  let resolved = false
  const resultPromise = new Promise<InvestigationResult>((resolve) => {
    const handler = (event: { type: string; agentId: string; data?: unknown }) => {
      if (event.agentId !== agentId) return
      if (event.type === "agent:result" && event.data) {
        resolved = true
        agentManager.offEvent(handler)
        const data = event.data as { output?: string }
        const output = data.output || ""
        const cost = (Date.now() - startTime) / 60_000 * 0.003 // rough cost estimate

        // Parse fix description from output
        const fixMatch = output.match(/FIX_DESCRIPTION:\s*(.+)/)
        const branchMatch = output.match(/FIX_BRANCH:\s*(.+)/)
        const diffMatch = output.match(/```diff\n([\s\S]*?)```/)

        resolve({
          success: !!branchMatch,
          fix_branch: branchMatch?.[1],
          fix_description: fixMatch?.[1],
          diff: diffMatch?.[1],
          cost_usd: cost,
        })
      }
      if (event.type === "agent:exit" && !resolved) {
        agentManager.offEvent(handler)
        resolve({ success: false, cost_usd: (Date.now() - startTime) / 60_000 * 0.003, error: "Agent exited without result" })
      }
    }
    agentManager.onEvent(handler)
  })

  try {
    const spawnedId = await agentManager.spawn({
      name: agentId,
      agentType: "debug",
      script: "src/agent/agent-worker.ts",
      env: {
        AEGIS_CI_REPO: params.repo,
        AEGIS_CI_RUN_ID: params.runId,
        AEGIS_CI_HEAD_SHA: params.headSha ?? "",
        AEGIS_CI_LOGS_URL: params.logsUrl ?? "",
        AEGIS_CI_BUDGET: String(params.budgetUsd),
        AEGIS_MAX_TURNS: "30",
      },
    })

    agentManager.sendIpc(spawnedId, {
      type: "run-task",
      id: `ci-fix-${params.runId}`,
      payload: {
        goal: `A CI run failed in ${params.repo} (run #${params.runId}).
${params.headSha ? `Head SHA: ${params.headSha}` : ""}
${params.logsUrl ? `Logs URL: ${params.logsUrl}` : ""}
Budget: $${params.budgetUsd}

Your job:
1. Investigate the failure. Check the failing output, look at the diff on the CI branch.
2. Identify the root cause.
3. Propose a fix by creating a branch and committing the fix.
4. When done, print:
   FIX_DESCRIPTION: <one-line description>
   FIX_BRANCH: <branch-name>
   \`\`\`diff
   <the diff of your changes>
   \`\`\``,
      },
      timestamp: Date.now(),
    })

    const budgetMs = params.budgetUsd * 60_000 * 5 // rough: $1 = ~5min
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        agentManager.kill(agentId).catch(() => {})
        log.warn(`CI investigation timed out for ${params.runId}`)
      }
    }, Math.min(budgetMs, 300_000)) // cap at 5min

    const result = await resultPromise
    clearTimeout(timeout)

    if (!result.success) {
      log.warn(`CI investigation failed for ${params.runId}: ${result.error}`)
    } else {
      log.info(`CI investigation succeeded for ${params.runId}, branch: ${result.fix_branch}`)
    }

    return result
  } catch (err) {
    log.warn(`CI investigation error: ${err}`)
    if (!resolved) {
      resolved = true
      try { await agentManager.kill(agentId) } catch {}
    }
    return { success: false, cost_usd: (Date.now() - startTime) / 60_000 * 0.003, error: String(err) }
  }
}
