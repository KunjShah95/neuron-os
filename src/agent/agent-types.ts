export type AgentTypeName =
  | "build"
  | "plan"
  | "read"
  | "write"
  | "test"
  | "validate"
  | "review"
  | "debug"
  | "document"
  | "refactor"
  | "deploy"
  | "monitor"
  | "explore"

export interface ToolPermission {
  name: string
  allow: boolean
  patterns?: string[]
}

export interface AgentType {
  name: AgentTypeName
  mode: "primary" | "subagent"
  description: string
  tools: ToolPermission[]
  systemPrompt: string
  modelHint?: string
  maxTurns?: number
  temperature?: number
}

const ALL_TOOLS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
  { name: "write", allow: true },
  { name: "edit", allow: true },
  { name: "bash", allow: true },
  { name: "grep", allow: true },
  { name: "glob", allow: true },
  { name: "web_fetch", allow: true },
  { name: "web_search", allow: true },
  { name: "computer", allow: true },
]

const READ_ONLY_TOOLS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
  { name: "grep", allow: true },
  { name: "glob", allow: true },
]

const WRITE_TOOLS: ToolPermission[] = [
  { name: "write", allow: true },
  { name: "edit", allow: true },
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
]

const TEST_TOOLS: ToolPermission[] = [
  { name: "bash", allow: true, patterns: ["npm test", "npm run test", "pytest", "jest", "bun test", "vitest", "cargo test", "go test"] },
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
]

const VALIDATE_TOOLS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
  { name: "bash", allow: true, patterns: ["npm run lint", "tsc --noEmit", "eslint", "prettier --check", "bun run lint", "bun run typecheck"] },
]

const DEPLOY_TOOLS: ToolPermission[] = [
  { name: "bash", allow: true, patterns: ["npm run deploy", "docker", "kubectl", "terraform", "git push", "bun run deploy"] },
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
]

const MONITOR_TOOLS: ToolPermission[] = [
  { name: "bash", allow: true },
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
]

export const AGENT_TYPES: Record<AgentTypeName, AgentType> = {
  build: {
    name: "build",
    mode: "primary",
    description: "Full-access development agent (all tools)",
    tools: ALL_TOOLS,
    systemPrompt: "You are a full-access development agent. You can read, write, edit, and execute code to complete tasks. Follow best practices and existing code patterns.",
  },

  plan: {
    name: "plan",
    mode: "primary",
    description: "Architecture and planning (read-only, opus model)",
    tools: READ_ONLY_TOOLS,
    systemPrompt: "You are a planning agent. Analyze requirements, design architecture, and create implementation plans. You cannot modify files — only read and analyze.",
    modelHint: "claude-opus-4",
    temperature: 0.3,
  },

  read: {
    name: "read",
    mode: "subagent",
    description: "Fast codebase exploration (read, grep, glob)",
    tools: READ_ONLY_TOOLS,
    systemPrompt: "You are a codebase exploration agent. Search and read files to answer questions. Be thorough and cite file paths with line numbers.",
    maxTurns: 20,
  },

  write: {
    name: "write",
    mode: "subagent",
    description: "File creation and editing (write, edit, read)",
    tools: WRITE_TOOLS,
    systemPrompt: "You are a code writing agent. Create and modify files based on specifications. Follow existing code patterns and conventions.",
    maxTurns: 30,
  },

  test: {
    name: "test",
    mode: "subagent",
    description: "Run tests and analyze failures (bash, read)",
    tools: TEST_TOOLS,
    systemPrompt: "You are a testing agent. Run test suites, analyze failures, and report coverage. Use bash to execute test commands.",
  },

  validate: {
    name: "validate",
    mode: "subagent",
    description: "Type checking and linting (read, bash)",
    tools: VALIDATE_TOOLS,
    systemPrompt: "You are a validation agent. Run linters, type checkers, and formatters. Report issues without fixing them.",
  },

  review: {
    name: "review",
    mode: "subagent",
    description: "Code review for security and patterns (read, opus)",
    tools: READ_ONLY_TOOLS,
    systemPrompt: "You are a code review agent. Analyze code for security vulnerabilities, anti-patterns, and bugs. Provide actionable feedback with file:line references.",
    modelHint: "claude-opus-4",
    temperature: 0.2,
  },

  debug: {
    name: "debug",
    mode: "subagent",
    description: "Systematic debugging (all tools, opus)",
    tools: ALL_TOOLS,
    systemPrompt: "You are a debugging agent. Use systematic debugging: reproduce, isolate, diagnose, fix, verify. Maintain state across steps.",
    modelHint: "claude-opus-4",
    maxTurns: 50,
  },

  document: {
    name: "document",
    mode: "subagent",
    description: "Generate documentation (read, write)",
    tools: [
      { name: "read", allow: true },
      { name: "read_skill", allow: true },
      { name: "write", allow: true },
    ],
    systemPrompt: "You are a documentation agent. Read code and generate clear, accurate documentation. Update existing docs when code changes.",
  },

  refactor: {
    name: "refactor",
    mode: "subagent",
    description: "Code restructuring (read, write, edit)",
    tools: WRITE_TOOLS,
    systemPrompt: "You are a refactoring agent. Improve code structure, rename variables, extract functions. Preserve behavior — do not add features.",
  },

  deploy: {
    name: "deploy",
    mode: "subagent",
    description: "Deployment and CI/CD (bash, read)",
    tools: DEPLOY_TOOLS,
    systemPrompt: "You are a deployment agent. Execute deployment scripts, manage infrastructure, run CI/CD pipelines.",
  },

  monitor: {
    name: "monitor",
    mode: "subagent",
    description: "Watch files and health checks (bash, read)",
    tools: MONITOR_TOOLS,
    systemPrompt: "You are a monitoring agent. Watch for file changes, check system health, alert on issues.",
  },

  explore: {
    name: "explore",
    mode: "subagent",
    description: "Lightweight search (read, grep, glob)",
    tools: READ_ONLY_TOOLS,
    systemPrompt: "You are a search agent. Quickly find files and content. Return concise results with file paths.",
    maxTurns: 10,
  },
}

export function getAgentType(name: AgentTypeName): AgentType | undefined {
  return AGENT_TYPES[name]
}

export function getAllAgentTypes(): AgentType[] {
  return Object.values(AGENT_TYPES)
}

export function getPrimaryAgentTypes(): AgentType[] {
  return getAllAgentTypes().filter((t) => t.mode === "primary")
}

export function getSubagentTypes(): AgentType[] {
  return getAllAgentTypes().filter((t) => t.mode === "subagent")
}

export function isValidAgentType(name: string): name is AgentTypeName {
  return name in AGENT_TYPES
}
