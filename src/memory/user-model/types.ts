/**
 * src/memory/user-model/types.ts
 *
 * Types for the dialectic user modeling system.
 * The user model tracks preferences, recurring topics, and decision patterns
 * discovered through periodic "what did I learn?" diffs.
 */

export interface UserPreference {
  key: string
  value: string
}

export interface RecurringTopic {
  topic: string
  frequency: number
  last_seen: number
}

export interface AuditEntry {
  version: number
  ts: number
  change: string
  evidence: string[]
  confirmed: boolean
}

export interface UserModel {
  version: number
  updated_at: number
  preferences: Record<string, string>
  recurring_topics: RecurringTopic[]
  decision_patterns: string[]
  audit_log: AuditEntry[]
}

export type DialecticChangeType =
  | "add_preference"
  | "update_preference"
  | "remove_preference"
  | "add_pattern"
  | "update_pattern"
  | "remove_pattern"
  | "no_change"

export interface DialecticProposal {
  type: DialecticChangeType
  key?: string
  value?: string
  new_value?: string
  old_value?: string
  reason?: string
  evidence_turn_ids?: string[]
}

export interface DialecticResult {
  proposal: DialecticProposal | null
  requiresConfirmation: boolean
}

export interface HonchoSyncResult {
  success: boolean
  pushed: boolean
  pulled: number
  error?: string
}

export const EMPTY_USER_MODEL: UserModel = {
  version: 1,
  updated_at: Date.now(),
  preferences: {},
  recurring_topics: [],
  decision_patterns: [],
  audit_log: [],
}
