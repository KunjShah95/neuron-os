/**
 * src/harness/hitl-review.ts
 *
 * HITLReviewManager — Human-in-the-Loop review workflow for regressions.
 *
 * When the CI gate detects a regression, a review ticket is created.
 * A human reviewer can approve it (accept the regression), reject it
 * (mark as false positive), or escalate it for further investigation.
 */

import type { BaselineComparison } from "./types"

// ── Types ─────────────────────────────────────────────────────────

export type ReviewType = "regression" | "improvement" | "new-failure" | "flaky"
export type ReviewSeverity = "minor" | "major" | "critical"
export type ReviewStatus = "pending" | "approved" | "rejected" | "escalated"
export type ReviewResolution = "accepted-regression" | "false-positive" | "needs-fix" | "flaky-test"

export interface ReviewTicket {
  id: string
  testId: string
  testName: string
  type: ReviewType
  baselineScore: number
  currentScore: number
  delta: number
  severity: ReviewSeverity
  baselineTrace?: string
  currentTrace?: string
  failureReason?: string
  status: ReviewStatus
  reviewedBy?: string
  reviewedAt?: string
  comment?: string
  resolution?: ReviewResolution
  actionItem?: string
  createdAt: string
}

export interface HITLConfig {
  autoApproveImprovements: boolean
  requireReviewFor: "all" | "critical-only" | "major-only"
  reviewTimeoutHours: number
  reviewers: string[]
}

export const DEFAULT_HITL_CONFIG: HITLConfig = {
  autoApproveImprovements: true,
  requireReviewFor: "major-only",
  reviewTimeoutHours: 48,
  reviewers: [],
}

// ── HITL Review Manager ─────────────────────────────────────────

export class HITLReviewManager {
  private tickets: ReviewTicket[] = []
  private config: HITLConfig

  constructor(config?: Partial<HITLConfig>) {
    this.config = { ...DEFAULT_HITL_CONFIG, ...config }
  }

  /**
   * Create review tickets from a baseline comparison.
   */
  createTickets(comparison: BaselineComparison): ReviewTicket[] {
    const now = new Date().toISOString()

    // Auto-approve improvements
    if (this.config.autoApproveImprovements) {
      for (const imp of comparison.improvements) {
        this.tickets.push({
          id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          testId: imp.testId,
          testName: imp.testName,
          type: "improvement",
          baselineScore: imp.baselineScore,
          currentScore: imp.currentScore,
          delta: Math.abs(imp.drop),
          severity: "minor",
          status: "approved",
          reviewedBy: "auto",
          reviewedAt: now,
          resolution: "accepted-regression",
          createdAt: now,
        })
      }
    }

    // Filter regressions by severity threshold
    const relevantRegressions = comparison.regressions.filter((r) => {
      if (this.config.requireReviewFor === "all") return true
      if (this.config.requireReviewFor === "major-only") return r.severity !== "minor"
      if (this.config.requireReviewFor === "critical-only") return r.severity === "critical"
      return true
    })

    for (const reg of relevantRegressions) {
      this.tickets.push({
        id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        testId: reg.testId,
        testName: reg.testName,
        type: "regression",
        baselineScore: reg.baselineScore,
        currentScore: reg.currentScore,
        delta: reg.drop,
        severity: reg.severity,
        status: "pending",
        createdAt: now,
      })
    }

    return this.getPendingTickets()
  }

  /**
   * Approve a regression — marks it as accepted.
   */
  approve(ticketId: string, reviewer: string, comment?: string): void {
    const ticket = this.findTicket(ticketId)
    if (!ticket) return
    ticket.status = "approved"
    ticket.reviewedBy = reviewer
    ticket.reviewedAt = new Date().toISOString()
    ticket.comment = comment
    ticket.resolution = "accepted-regression"
  }

  /**
   * Reject as false positive — adjusts the calibration dataset.
   */
  rejectAsFalsePositive(ticketId: string, reviewer: string, reason: string): void {
    const ticket = this.findTicket(ticketId)
    if (!ticket) return
    ticket.status = "rejected"
    ticket.reviewedBy = reviewer
    ticket.reviewedAt = new Date().toISOString()
    ticket.resolution = "false-positive"
    ticket.comment = reason
  }

  /**
   * Reject as flaky test.
   */
  rejectAsFlaky(ticketId: string, reviewer: string, comment?: string): void {
    const ticket = this.findTicket(ticketId)
    if (!ticket) return
    ticket.status = "rejected"
    ticket.reviewedBy = reviewer
    ticket.reviewedAt = new Date().toISOString()
    ticket.resolution = "flaky-test"
    ticket.comment = comment
  }

  /**
   * Mark as needs fix — creates an action item.
   */
  markNeedsFix(ticketId: string, reviewer: string, actionItem: string): void {
    const ticket = this.findTicket(ticketId)
    if (!ticket) return
    ticket.status = "escalated"
    ticket.reviewedBy = reviewer
    ticket.reviewedAt = new Date().toISOString()
    ticket.resolution = "needs-fix"
    ticket.actionItem = actionItem
  }

  /**
   * Get all pending tickets.
   */
  getPendingTickets(): ReviewTicket[] {
    return this.tickets.filter((t) => t.status === "pending")
  }

  /**
   * Get all tickets.
   */
  getAllTickets(): ReviewTicket[] {
    return [...this.tickets]
  }

  /**
   * Get a summary of review status.
   */
  getSummary(): { pending: number; approved: number; rejected: number; escalated: number; total: number } {
    return {
      total: this.tickets.length,
      pending: this.tickets.filter((t) => t.status === "pending").length,
      approved: this.tickets.filter((t) => t.status === "approved").length,
      rejected: this.tickets.filter((t) => t.status === "rejected").length,
      escalated: this.tickets.filter((t) => t.status === "escalated").length,
    }
  }

  /**
   * Get tickets that have exceeded the review timeout.
   */
  getOverdueTickets(): ReviewTicket[] {
    const cutoff = Date.now() - this.config.reviewTimeoutHours * 3600000
    return this.tickets.filter((t) => t.status === "pending" && new Date(t.createdAt).getTime() < cutoff)
  }

  /**
   * Auto-escalate overdue tickets.
   */
  autoEscalate(): ReviewTicket[] {
    const overdue = this.getOverdueTickets()
    for (const ticket of overdue) {
      ticket.status = "escalated"
    }
    return overdue
  }

  /**
   * Reset the manager (clear all tickets).
   */
  reset(): void {
    this.tickets = []
  }

  // ── Private ──────────────────────────────────────────────────

  private findTicket(id: string): ReviewTicket | undefined {
    return this.tickets.find((t) => t.id === id)
  }
}
