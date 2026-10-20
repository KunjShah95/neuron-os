import { createLogger } from "../cli/logger"
import { agentManager } from "../agent/manager"
import type { AgentEvent } from "../agent/types"

const log = createLogger("ci-investigator")

export interface InvestigationResult {
  success: boolean
  fix_branch?: string
  fix_description?: string
  diff?: string
  cost_usd: number
  error?: string
}

export interface ParsedFix {
  fix_branch?: string
  fix_description?: string
  diff?: string
}

/**
 * Parse the fix markers the CI agent is instructed to print.
 */
export function parseFixOutput(output: string): ParsedFix {
  const fixMatch = output.match(/FIX_DESCRIPTION:\s*(.+)/)
  const branchMatch = output.match(/FIX_BRANCH:\s*(.+)/)
  const diffMatch = output.match(/```diff\n([\s\S]*?)```/)

  return {
    fix_branch: branchMatch?.[1],
    fix_description: fixMatch?.[1],
    diff: diffMatch?.[1],
  }
}

/**
 * Pull the task output out of an "agent:result" event payload.
 * Returns null for handshake/keep-alive results (the agent readiness
 * message carries no output and must not be treated as a finished task).
 */
export function extractAgentResultOutput(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const record = data as { output?: unknown; payload?: { status?: unknown; output?: unknown } }
  if (record.payload?.status === "ready") return null
  const output = record.payload?.output ?? record.output
  return typeof output === "string" ? output : null
}

export async function investigate(params: {
  repo: string
  runId: string
  headSha?: string
  logsUrl?: string
  budgetUsd: number
  model?: string
}): Promise<InvestigationResult> {
  const agentName = `ci-fix-${params.repo.replace("/", "-")}-${params.runId}`
  const startTime = Date.now()

  log.info(`Starting CI investigation for ${params.repo} #${params.runId}`)

  let resolved = false
  let resolveResult!: (result: InvestigationResult) => void
  const buffered: AgentEvent[] = []

  const resultPromise = new Promise<InvestigationResult>((resolve) => {
    resolveResult = resolve
  })

  const costSoFar = (): number => ((Date.now() - startTime) / 60_000) * 0.003

  let spawnedId: string | null = null

  const handler = (event: AgentEvent) => {
    if (!spawnedId) {
      buffered.push(event)
      return
    }
    if (event.agentId !== spawnedId) return

    if (event.type === "agent:result") {
      const output = extractAgentResultOutput(event.data)
      if (output === null) return

      resolved = true
      agentManager.offEvent(handler)
      const parsed = parseFixOutput(output)

      resolveResult({
        success: !!parsed.fix_branch,
        fix_branch: parsed.fix_branch,
        fix_description: parsed.fix_description,
        diff: parsed.diff,
        cost_usd: costSoFar(),
      })
      return
    }

    if (event.type === "agent:error" && !resolved) {
      resolved = true
      agentManager.offEvent(handler)
      const message = (event.data as { message?: string } | undefined)?.message
      resolveResult({
        success: false,
        cost_usd: costSoFar(),
        error: message || "Agent reported an error",
      })
      return
    }

    if (event.type === "agent:exit" && !resolved) {
      resolved = true
      agentManager.offEvent(handler)
      resolveResult({
        success: false,
        cost_usd: costSoFar(),
        error: "Agent exited without result",
      })
    }
  }

  try {
    agentManager.onEvent(handler)

    const agentId = await agentManager.spawn({
      name: agentName,
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
    spawnedId = agentId

    const pending = buffered.splice(0, buffered.length)
    for (const event of pending) {
      handler(event)
    }

    await agentManager.sendIpc(agentId, {
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
    const timeout = setTimeout(
      () => {
        if (!resolved) {
          resolved = true
          agentManager.offEvent(handler)
          agentManager.kill(agentId).catch(() => {})
          log.warn(`CI investigation timed out for ${params.runId}`)
          resolveResult({
            success: false,
            cost_usd: costSoFar(),
            error: "CI investigation timed out",
          })
        }
      },
      Math.min(budgetMs, 300_000),
    ) // cap at 5min

    const result = await resultPromise
    clearTimeout(timeout)

    if (spawnedId) {
      try {
        await agentManager.kill(spawnedId)
      } catch {
        /* agent already gone */
      }
    }

    if (!result.success) {
      log.warn(`CI investigation failed for ${params.runId}: ${result.error}`)
    } else {
      log.info(`CI investigation succeeded for ${params.runId}, branch: ${result.fix_branch}`)
    }

    return result
  } catch (err) {
    log.warn(`CI investigation error: ${err}`)
    agentManager.offEvent(handler)
    if (!resolved) {
      resolved = true
      try {
        if (spawnedId) await agentManager.kill(spawnedId)
      } catch {}
      resolveResult({ success: false, cost_usd: costSoFar(), error: String(err) })
    }
    return { success: false, cost_usd: costSoFar(), error: String(err) }
  }
}
