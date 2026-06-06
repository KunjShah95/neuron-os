import { createLogger } from "../cli/logger"
import { agentManager } from "../agent/manager"
import { storeFindings } from "./findings-store"
import type { AdversarialConfig } from "./types"
import type { Finding } from "./types"

const log = createLogger("adversarial")

export function getDefaultAdversarialConfig(): AdversarialConfig {
  return {
    enabled: false,
    red_team_agent_type: "adversarial",
    red_team_model: "claude-opus-4-6",
    cost_budget_ratio: 0.2,
    ratchet: true,
    classify_severity_threshold: "medium",
    notify_severity: "high",
  }
}

export function shouldRunAdversarial(config: Partial<AdversarialConfig>, mainCostUsd: number): boolean {
  if (!config.enabled) return false
  if (config.cost_budget_ratio && mainCostUsd * config.cost_budget_ratio < 0.001) return false
  return true
}

function parseFindingsFromOutput(
  output: string,
  meta: { taskId: string; sessionId: string; agentId: string; model: string },
): Finding[] {
  const findings: Finding[] = []
  const lines = output.split("\n")
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.trim())
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.finding_type && item.severity) {
            findings.push({
              id: item.id || `${meta.taskId}-${findings.length}`,
              task_id: meta.taskId,
              session_id: meta.sessionId,
              finding_type: item.finding_type,
              severity: item.severity,
              description: item.description || "",
              reproduction: item.reproduction || "",
              reproduction_verified: item.reproduction_verified ?? false,
              suggested_fix: item.suggested_fix,
              red_team_agent_id: meta.agentId,
              red_team_model: meta.model,
              ts: Date.now(),
              ratcheted: false,
              incomplete: false,
              parse_error: false,
            })
          }
        }
      }
    } catch {
      // not JSON, skip
    }
  }
  return findings
}

export async function runAdversarial(params: {
  taskId: string
  sessionId: string
  taskDescription: string
  result: string
  trajectoryUrl?: string
  config?: Partial<AdversarialConfig>
  mainCostUsd?: number
}): Promise<Finding[]> {
  const config = { ...getDefaultAdversarialConfig(), ...params.config }
  log.info(`Running adversarial for task ${params.taskId}`)

  const agentId = `red-team-${params.taskId}-${Date.now()}`
  const agentName = agentId

  let resolved = false
  const resultPromise = new Promise<Finding[]>((resolve) => {
    const handler = (event: { type: string; agentId: string; data?: unknown }) => {
      if (event.agentId !== agentId) return
      if (event.type === "agent:result" && event.data) {
        resolved = true
        agentManager.offEvent(handler)
        const data = event.data as { output?: string; taskId?: string }
        const findings = parseFindingsFromOutput(data.output || "", {
          taskId: params.taskId,
          sessionId: params.sessionId,
          agentId,
          model: config.red_team_model,
        })

        const levels = ["low", "medium", "high", "critical"]
        const minIdx = levels.indexOf(config.classify_severity_threshold)
        const filtered = findings.filter((f) => levels.indexOf(f.severity) >= minIdx)

        if (filtered.length > 0) {
          storeFindings(params.taskId, filtered)
          log.info(`Stored ${filtered.length} findings for task ${params.taskId}`)
        }
        resolve(filtered)
      }
      if (event.type === "agent:exit" && !resolved) {
        agentManager.offEvent(handler)
        const logs = agentManager.getLogs(agentId, { tail: 50 })
        const output = logs.map((l) => l.text).join("\n")
        const findings = parseFindingsFromOutput(output, {
          taskId: params.taskId,
          sessionId: params.sessionId,
          agentId,
          model: config.red_team_model,
        })
        if (findings.length > 0) storeFindings(params.taskId, findings)
        resolve(findings)
      }
    }
    agentManager.onEvent(handler)
  })

  try {
    const spawnedId = await agentManager.spawn({
      name: agentName,
      agentType: "adversarial",
      script: "src/agent/agent-worker.ts",
      env: {
        AEGIS_ADVERSARIAL_TASK: params.taskDescription,
        AEGIS_ADVERSARIAL_RESULT: params.result.slice(0, 5000),
        AEGIS_ADVERSARIAL_TASK_ID: params.taskId,
        AEGIS_ADVERSARIAL_SESSION_ID: params.sessionId,
        AEGIS_ADVERSARIAL_TRAJECTORY: params.trajectoryUrl ?? "",
        AEGIS_MAX_TURNS: "10",
      },
    })

    agentManager.sendIpc(spawnedId, {
      type: "run-task",
      id: `adversarial-${params.taskId}`,
      payload: {
        goal: `You are a red-team agent. Attack the following task result for flaws.

Task: ${params.taskId}
Description: ${params.taskDescription}

Result to attack:
${params.result.slice(0, 5000)}

Analyze the result for:
1. Correctness bugs (off-by-one, edge cases, wrong output)
2. Security vulnerabilities (injection, path traversal, unsanitized input)
3. Performance issues (unbounded loops, memory leaks)
4. Completeness (missing cases, not handling all inputs)
5. Code quality/style issues

Return your findings as a JSON array. Each finding must have:
- id: string
- finding_type: "correctness" | "security" | "performance" | "completeness" | "style"
- severity: "low" | "medium" | "high" | "critical"
- description: string (what's wrong)
- reproduction: string (minimal command to reproduce)
- reproduction_verified: boolean
- suggested_fix: string (optional)

If you find nothing wrong, return []`,
      },
      timestamp: Date.now(),
    })

    const budget = Math.max(5000, (params.mainCostUsd ?? 0.01) * (config.cost_budget_ratio ?? 0.2) * 60_000)
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        agentManager.kill(agentId).catch(() => {})
        log.warn(`Adversarial agent timed out after ${budget}ms`)
      }
    }, budget)

    const findings = await resultPromise
    clearTimeout(timeout)
    return findings
  } catch (err) {
    log.warn(`Adversarial agent failed: ${err}`)
    if (!resolved) {
      resolved = true
      try { await agentManager.kill(agentId) } catch {}
    }
    return []
  }
}
