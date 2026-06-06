import { createLogger } from "../cli/logger"
import type { LeaderboardSubmission } from "./types"

const log = createLogger("leaderboard-client")

const LEADERBOARD_API = "https://aegis.bench/leaderboard/api"

export async function submitToLeaderboard(
  submission: LeaderboardSubmission,
  hmacKey?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (hmacKey) {
      headers["X-Aegis-Signature"] = hmacKey
    }

    const response = await fetch(`${LEADERBOARD_API}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(submission),
    })

    if (!response.ok) {
      const text = await response.text()
      log.warn(`Leaderboard submission failed (${response.status}): ${text}`)
      return { success: false, error: `HTTP ${response.status}: ${text}` }
    }

    log.info("Leaderboard submission successful")
    return { success: true }
  } catch (err) {
    log.warn(`Leaderboard submission network error: ${err}`)
    return { success: false, error: String(err) }
  }
}

export async function fetchLeaderboard(
  options?: { category?: string; provider?: string },
): Promise<Array<Record<string, unknown>>> {
  try {
    const params = new URLSearchParams()
    if (options?.category) params.set("category", options.category)
    if (options?.provider) params.set("provider", options.provider)

    const url = `${LEADERBOARD_API}/scores${params.toString() ? `?${params}` : ""}`
    const response = await fetch(url)

    if (!response.ok) {
      log.warn(`Leaderboard fetch failed (${response.status})`)
      return []
    }

    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    log.warn(`Leaderboard fetch error: ${err}`)
    return []
  }
}
