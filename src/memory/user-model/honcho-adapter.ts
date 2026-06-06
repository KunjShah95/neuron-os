/**
 * src/memory/user-model/honcho-adapter.ts
 *
 * Optional Honcho integration — syncs the local user model to Honcho's
 * hosted service. The local file is always the source of truth; Honcho
 * is a read-cache + cross-device sync target.
 *
 * No-op if HONCHO_API_KEY is not set.
 */

import { createLogger } from "../../cli/logger"
import type { UserModel, HonchoSyncResult } from "./types"

const log = createLogger("honcho")

export class HonchoAdapter {
  private apiKey: string | null
  private workspace: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.HONCHO_API_KEY ?? null
    this.workspace = process.env.HONCHO_WORKSPACE ?? "default"
    this.baseUrl = process.env.HONCHO_BASE_URL ?? "https://api.honcho.dev/v1"
  }

  get isAvailable(): boolean {
    return this.apiKey !== null
  }

  /**
   * Sync the local user model to Honcho.
   * Returns sync result with push/pull details.
   */
  async sync(userId: string, model: UserModel): Promise<HonchoSyncResult> {
    if (!this.apiKey) {
      return { success: false, pushed: false, pulled: 0, error: "HONCHO_API_KEY not set" }
    }

    try {
      // Push the latest user model
      const pushResponse = await fetch(
        `${this.baseUrl}/workspaces/${this.workspace}/users/${userId}/representations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model_version: model.version,
            preferences: model.preferences,
            decision_patterns: model.decision_patterns,
            updated_at: model.updated_at,
          }),
        },
      )

      if (!pushResponse.ok) {
        throw new Error(`Honcho push failed: ${pushResponse.status} ${pushResponse.statusText}`)
      }

      log.info(`Pushed user model v${model.version} to Honcho`)
      return { success: true, pushed: true, pulled: 0 }
    } catch (err) {
      log.warn("Honcho sync failed — local model is still authoritative", {
        error: String(err),
      })
      return { success: false, pushed: false, pulled: 0, error: String(err) }
    }
  }

  /**
   * Get sync status information.
   */
  async getStatus(userId: string): Promise<{
    connected: boolean
    lastSync?: string
    remoteVersion?: number
  }> {
    if (!this.apiKey) {
      return { connected: false }
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/workspaces/${this.workspace}/users/${userId}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      )

      if (!response.ok) throw new Error("Not found")

      const data = await response.json() as Record<string, unknown>
      return {
        connected: true,
        lastSync: data.updated_at as string | undefined,
        remoteVersion: data.model_version as number | undefined,
      }
    } catch {
      return { connected: false }
    }
  }
}

export const honchoAdapter = new HonchoAdapter()
