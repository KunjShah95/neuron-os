export interface SkillCandidate {
  id: string
  name: string
  description: string
  sourcePattern: string
  confidence: number
  derivedFrom: string[]
  avgReward: number
  invocationCount: number
  successRate: number
  createdAt: string
  status: "candidate" | "validated" | "published" | "rejected"
}

export interface FailureCluster {
  id: string
  name: string
  description: string
  experiences: string[]
  count: number
  commonPattern: string
  suggestedFix: string
  severity: "low" | "medium" | "high" | "critical"
  createdAt: string
}

export interface SelfPlayConfig {
  agentTypes: string[]
  scenarioCount: number
  maxRounds: number
  parallelAgents: number
  budget_usd: number
}

export interface SelfPlayResult {
  id: string
  scenario: string
  attackerId: string
  defenderId: string
  winner: "attacker" | "defender" | "draw"
  rounds: number
  findings: string[]
  attackerExperienceId?: string
  defenderExperienceId?: string
  createdAt: string
}
