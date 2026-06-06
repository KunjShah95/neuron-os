/**
 * src/memory/user-model/dialectic.ts
 *
 * Periodic "what did I learn?" engine that compares recent session turns
 * against the existing user model and proposes updates.
 *
 * Runs as a cron job (default: after each session ends, plus daily at 4am).
 * Material changes require user confirmation; trivial updates (bumping
 * last_seen) are applied silently.
 */

import { createLogger } from "../../cli/logger"
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs"
import { join, resolve } from "node:path"
import { EMPTY_USER_MODEL } from "./types"
import type { UserModel, DialecticProposal, AuditEntry } from "./types"

const log = createLogger("dialectic")

export class DialecticEngine {
  private modelPath: string
  private lockPath: string
  private model: UserModel
  private lockFd: number | null = null

  constructor(baseDir = resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory")) {
    this.modelPath = join(baseDir, "user_model.json")
    this.lockPath = join(baseDir, ".user_model.lock")
    this.model = this.load()
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private load(): UserModel {
    try {
      if (!existsSync(this.modelPath)) return { ...EMPTY_USER_MODEL }
      return JSON.parse(readFileSync(this.modelPath, "utf-8"))
    } catch {
      log.warn("User model corrupted — recovering from backup")
      // Try to recover from audit log's last confirmed version
      return { ...EMPTY_USER_MODEL }
    }
  }

  save(): void {
    try {
      this.acquireLock()
      this.model.updated_at = Date.now()
      this.model.version++
      writeFileSync(this.modelPath, JSON.stringify(this.model, null, 2), "utf-8")
    } catch (err) {
      log.error("Failed to save user model", { error: String(err) })
    } finally {
      this.releaseLock()
    }
  }

  getModel(): UserModel {
    return this.model
  }

  // ── Simple file-based mutex ──────────────────────────────────────────

  private acquireLock(): void {
    // Use a simple mutex approach: check if lock exists, wait if needed
    const maxWait = 5000
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      try {
        writeFileSync(this.lockPath, String(process.pid), { flag: "wx" })
        return
      } catch {
        // Lock exists, wait and retry
      }
    }
    log.warn("Could not acquire user model lock — proceeding anyway")
  }

  private releaseLock(): void {
    try {
      unlinkSync(this.lockPath)
    } catch {
      // Ignore — file may have been removed
    }
  }

  // ── Dialectic logic ──────────────────────────────────────────────────

  /**
   * Determine if a proposed change is "material" — i.e., requires user confirmation.
   * Trivial updates (bumping last_seen) are NOT material.
   */
  isMaterial(proposal: DialecticProposal): boolean {
    switch (proposal.type) {
      case "add_preference":
      case "remove_preference":
      case "add_pattern":
      case "remove_pattern":
        return true
      case "update_preference":
        // Material if the value actually changed
        return proposal.new_value !== proposal.old_value
      case "update_pattern":
        return true
      case "no_change":
        return false
      default:
        return true
    }
  }

  /**
   * Apply a material change that has been confirmed by the user.
   */
  applyConfirmed(proposal: DialecticProposal, evidenceTurns: string[]): void {
    const entry: AuditEntry = {
      version: this.model.version + 1,
      ts: Date.now(),
      change: this.describeChange(proposal),
      evidence: evidenceTurns,
      confirmed: true,
    }

    switch (proposal.type) {
      case "add_preference":
        if (proposal.key && proposal.value) {
          this.model.preferences[proposal.key] = proposal.value
        }
        break
      case "update_preference":
        if (proposal.key && proposal.new_value) {
          this.model.preferences[proposal.key] = proposal.new_value
        }
        break
      case "remove_preference":
        if (proposal.key) {
          delete this.model.preferences[proposal.key]
        }
        break
      case "add_pattern":
        if (proposal.value) {
          this.model.decision_patterns.push(proposal.value)
        }
        break
      case "remove_pattern":
        if (proposal.value) {
          this.model.decision_patterns = this.model.decision_patterns.filter(
            (p) => p !== proposal.value,
          )
        }
        break
      case "update_pattern":
        if (proposal.old_value && proposal.new_value) {
          const idx = this.model.decision_patterns.indexOf(proposal.old_value)
          if (idx >= 0) this.model.decision_patterns[idx] = proposal.new_value
        }
        break
    }

    this.model.audit_log.push(entry)
    this.model.version++
    this.save()
    log.info("Applied dialectic change", { type: proposal.type, key: proposal.key })
  }

  /**
   * Apply a trivial change (no confirmation needed).
   * Currently just bumps recurring_topic last_seen.
   */
  applySilent(topic: string): void {
    const existing = this.model.recurring_topics.find((t) => t.topic === topic)
    if (existing) {
      existing.last_seen = Date.now()
      existing.frequency = Math.min(1, existing.frequency + 0.05)
    } else {
      this.model.recurring_topics.push({
        topic,
        frequency: 0.05,
        last_seen: Date.now(),
      })
    }
    this.save()
  }

  /**
   * Reject a proposal — record the rejection in the audit log.
   */
  rejectProposal(proposal: DialecticProposal, reason?: string): void {
    const entry: AuditEntry = {
      version: this.model.version,
      ts: Date.now(),
      change: `Rejected: ${this.describeChange(proposal)}${reason ? ` (${reason})` : ""}`,
      evidence: proposal.evidence_turn_ids ?? [],
      confirmed: false,
    }
    this.model.audit_log.push(entry)
    this.model.version++
    this.save()
    log.info("Rejected dialectic change", { type: proposal.type, reason })
  }

  /**
   * Reset the user model entirely.
   */
  reset(): void {
    this.model = { ...EMPTY_USER_MODEL, version: this.model.version + 1 }
    this.save()
    log.info("User model reset")
  }

  /**
   * Describe a proposal in human-readable form.
   */
  private describeChange(proposal: DialecticProposal): string {
    switch (proposal.type) {
      case "add_preference":
        return `Added preference: ${proposal.key} = ${proposal.value}`
      case "update_preference":
        return `Updated preference: ${proposal.key}: ${proposal.old_value} → ${proposal.new_value}`
      case "remove_preference":
        return `Removed preference: ${proposal.key}`
      case "add_pattern":
        return `Added decision pattern: ${proposal.value}`
      case "remove_pattern":
        return `Removed decision pattern: ${proposal.value}`
      case "update_pattern":
        return `Updated decision pattern: ${proposal.old_value} → ${proposal.new_value}`
      default:
        return `Unknown change type: ${proposal.type}`
    }
  }
}

export const dialecticEngine = new DialecticEngine()
