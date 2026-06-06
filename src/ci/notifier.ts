import { createLogger } from "../cli/logger"
import { gateway } from "../adapters/gateway"

const log = createLogger("ci-notifier")

export async function notify(params: {
  channels: string[]
  repo: string
  runId: string
  status: string
  prUrl?: string
  costUsd?: number
  error?: string
}): Promise<void> {
  if (params.channels.length === 0) return

  let message: string
  if (params.status === "pr_created" && params.prUrl) {
    message = `[Aegis CI] Fix proposed for ${params.repo} run #${params.runId}\nPR: ${params.prUrl}\nCost: $${params.costUsd?.toFixed(3) ?? "?"}`
  } else if (params.status === "merged") {
    message = `[Aegis CI] Fix merged for ${params.repo} run #${params.runId}\n${params.prUrl ?? ""}`
  } else if (params.status === "failed") {
    message = `[Aegis CI] Fix failed for ${params.repo} run #${params.runId}\nError: ${params.error ?? "unknown"}`
  } else {
    message = `[Aegis CI] ${params.status} for ${params.repo} run #${params.runId}`
  }

  for (const channel of params.channels) {
    try {
      const [adapter, ...rest] = channel.split(":")
      const target = rest.join(":")

      if (!adapter || !target) {
        log.warn(`Invalid channel format: ${channel}`)
        continue
      }

      // Match adapter type to registered gateway platform
      const platform = gateway as unknown as Record<string, { send: (text: string) => Promise<void> }>
      if (platform[adapter]) {
        await platform[adapter].send(message)
        log.info(`Notified ${channel}`)
      } else {
        log.warn(`No adapter registered for: ${adapter}`)
      }
    } catch (err) {
      log.warn(`Failed to notify ${channel}: ${err}`)
    }
  }
}
