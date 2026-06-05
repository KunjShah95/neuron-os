/**
 * plan/types — structured plan types inspired by chaicodeclaw-build.
 */

export interface PlanStep {
  id: string
  title: string
  description: string
  hints?: string[]
  complexity?: "low" | "medium" | "high"
}

export interface Plan {
  goal: string
  researchSummary?: string
  steps: PlanStep[]
}
