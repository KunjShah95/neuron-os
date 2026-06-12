export interface AgentProfile {
  id: string
  name: string
  agentType: string
  systemPromptOverride?: string
  model?: string
  temperature?: number
  skills: string[]
  budgetUsdPerTask?: number
  createdAt: string
  updatedAt: string
}
