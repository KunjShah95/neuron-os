/**
 * capability-registry — Dynamic agent capability discovery and task routing.
 *
 * Agents register what they can do. The registry matches tasks to the best
 * agent based on capability scoring. Capabilities are composable — complex
 * tasks can be decomposed into sub-capabilities.
 *
 * Architecture:
 *   register(agentId, capabilities) → registry
 *     ↓
 *   findBestMatch(task) → scored capabilities
 *     ↓
 *   routeTask(task) → agent with best score
 *     ↓
 *   composeComplexTask(task) → multiple agents
 */

import { type AgentTypeName } from "./agent-types"

// ── Types ─────────────────────────────────────────────────────────────

export type CapabilityCategory =
  | "code"           // Writing, reading, editing code
  | "analysis"       // Analyzing, reviewing, auditing
  | "architecture"   // Designing, planning, structuring
  | "testing"        // Testing, validating, verifying
  | "deployment"     // Deploying, releasing, rolling back
  | "monitoring"     // Monitoring, alerting, observability
  | "research"       // Researching, searching, gathering info
  | "integration"    // Integrating, connecting, wiring services
  | "security"       // Security auditing, vulnerability scanning
  | "documentation"  // Writing docs, generating reports
  | "communication"  // Messaging, notifications, collaboration
  | "automation"     // Automating workflows, pipelines

export interface Capability {
  id: string
  name: string
  description: string
  category: CapabilityCategory
  /** Keywords for fuzzy matching when routing tasks */
  keywords: string[]
  /** Estimated complexity: 1 (trivial) to 10 (extremely complex) */
  complexity: number
  /** Whether this capability requires external services */
  requiresExternal?: string[]
  /** Sub-capabilities that compose this capability */
  subCapabilities?: string[]
  /** Example tasks that demonstrate this capability */
  examples: string[]
}

export interface AgentCapabilityRegistration {
  agentId: string
  agentType: AgentTypeName | string
  capabilities: string[]  // Capability IDs
  registeredAt: number
  /** Current load factor (0-1) — how busy this agent is */
  loadFactor: number
  /** Tags for filtering */
  tags: string[]
}

export interface CapabilityMatch {
  capability: Capability
  agentId: string
  score: number
  matchReasons: string[]
}

export interface TaskRoute {
  taskDescription: string
  primaryAgentId: string
  primaryCapability: Capability
  score: number
  /** For complex tasks: sub-tasks routed to different agents */
  subRoutes?: Array<{
    subTask: string
    agentId: string
    capability: Capability
    score: number
  }>
}

// ── Built-in capabilities catalog ─────────────────────────────────────

const BUILTIN_CAPABILITIES: Capability[] = [
  // Code capabilities
  {
    id: "code.write",
    name: "Write Code",
    description: "Create new source files and implement features",
    category: "code",
    keywords: ["write", "create", "implement", "add", "feature", "source"],
    complexity: 5,
    examples: ["Implement a new API endpoint", "Create a React component", "Add a database migration"],
  },
  {
    id: "code.edit",
    name: "Edit Code",
    description: "Modify existing code to fix bugs or add functionality",
    category: "code",
    keywords: ["edit", "modify", "update", "change", "fix", "patch"],
    complexity: 4,
    examples: ["Fix a bug in the login flow", "Update error handling", "Refactor a function"],
  },
  {
    id: "code.refactor",
    name: "Refactor Code",
    description: "Restructure code without changing external behavior",
    category: "code",
    keywords: ["refactor", "restructure", "clean up", "improve", "optimize"],
    complexity: 6,
    subCapabilities: ["code.read", "code.write"],
    examples: ["Extract a shared utility function", "Rename symbols across files", "Split a large module"],
  },
  {
    id: "code.read",
    name: "Read & Understand Code",
    description: "Explore codebases and understand existing patterns",
    category: "code",
    keywords: ["read", "find", "search", "explore", "understand", "navigate"],
    complexity: 2,
    examples: ["Find where a function is defined", "Understand the authentication flow", "Map data flow through the system"],
  },

  // Analysis capabilities
  {
    id: "analysis.review",
    name: "Code Review",
    description: "Review code for bugs, security issues, and anti-patterns",
    category: "analysis",
    keywords: ["review", "audit", "inspect", "check", "analyze"],
    complexity: 5,
    subCapabilities: ["code.read"],
    examples: ["Review a pull request", "Security audit of authentication code", "Check for performance issues"],
  },
  {
    id: "analysis.debug",
    name: "Debugging",
    description: "Systematic diagnosis and resolution of bugs",
    category: "analysis",
    keywords: ["debug", "diagnose", "troubleshoot", "root cause", "fix bug"],
    complexity: 7,
    subCapabilities: ["code.read", "code.edit"],
    examples: ["Debug a production crash", "Find the cause of a memory leak", "Fix a race condition"],
  },
  {
    id: "analysis.architecture",
    name: "Architecture Analysis",
    description: "Analyze system architecture and design patterns",
    category: "analysis",
    keywords: ["architecture", "design", "structure", "pattern", "diagram"],
    complexity: 8,
    examples: ["Document system architecture", "Identify architectural debt", "Design a new service boundary"],
  },

  // Architecture capabilities
  {
    id: "architecture.plan",
    name: "Planning & Design",
    description: "Create implementation plans and architectural designs",
    category: "architecture",
    keywords: ["plan", "design", "architect", "roadmap", "strategy", "proposal"],
    complexity: 7,
    examples: ["Design a new feature architecture", "Create a migration plan", "Design an API contract"],
  },
  {
    id: "architecture.estimate",
    name: "Estimation & Scoping",
    description: "Estimate effort, complexity, and risks for tasks",
    category: "architecture",
    keywords: ["estimate", "scope", "effort", "timeline", "sizing"],
    complexity: 5,
    examples: ["Estimate implementation effort", "Identify risks in a proposal", "Scope a new project"],
  },

  // Testing capabilities
  {
    id: "test.unit",
    name: "Unit Testing",
    description: "Write and run unit tests",
    category: "testing",
    keywords: ["unit test", "spec", "jest", "vitest", "pytest", "coverage"],
    complexity: 4,
    examples: ["Write unit tests for a service", "Increase test coverage", "Fix flaky tests"],
  },
  {
    id: "test.integration",
    name: "Integration Testing",
    description: "Write and run integration and end-to-end tests",
    category: "testing",
    keywords: ["integration test", "e2e", "end to end", "cypress", "playwright"],
    complexity: 6,
    subCapabilities: ["test.unit"],
    examples: ["Set up E2E tests for the login flow", "Write API integration tests"],
  },
  {
    id: "test.validate",
    name: "Validation & Linting",
    description: "Run type checks, linters, and validators",
    category: "testing",
    keywords: ["validate", "lint", "typecheck", "tsc", "eslint", "prettier"],
    complexity: 2,
    examples: ["Run the type checker", "Fix lint errors", "Format code"],
  },

  // Deployment capabilities
  {
    id: "deploy.build",
    name: "Build & Package",
    description: "Build, package, and prepare artifacts for deployment",
    category: "deployment",
    keywords: ["build", "compile", "bundle", "package", "artifact"],
    complexity: 4,
    examples: ["Build the production bundle", "Create a Docker image", "Package a release"],
  },
  {
    id: "deploy.release",
    name: "Release & Deploy",
    description: "Deploy applications to environments",
    category: "deployment",
    keywords: ["deploy", "release", "publish", "ship", "rollout"],
    complexity: 7,
    subCapabilities: ["deploy.build", "test.validate"],
    examples: ["Deploy to production", "Roll back a bad release", "Set up a staging environment"],
  },
  {
    id: "deploy.infra",
    name: "Infrastructure",
    description: "Manage infrastructure and cloud resources",
    category: "deployment",
    keywords: ["infrastructure", "terraform", "docker", "kubernetes", "cloud", "aws"],
    complexity: 8,
    examples: ["Provision a new server", "Update Kubernetes manifests", "Set up CI/CD pipeline"],
  },

  // Monitoring capabilities
  {
    id: "monitor.health",
    name: "Health Monitoring",
    description: "Monitor system health, uptime, and performance",
    category: "monitoring",
    keywords: ["monitor", "health", "uptime", "alert", "dashboard"],
    complexity: 4,
    examples: ["Check system health", "Set up monitoring alerts", "Investigate performance degradation"],
  },
  {
    id: "monitor.analyze",
    name: "Log Analysis",
    description: "Analyze logs and metrics for insights",
    category: "monitoring",
    keywords: ["log", "metric", "analyze", "trend", "pattern", "observability"],
    complexity: 5,
    examples: ["Analyze error logs", "Identify usage patterns", "Correlate metrics with incidents"],
  },

  // Research capabilities
  {
    id: "research.search",
    name: "Web Search & Research",
    description: "Search the web and gather information",
    category: "research",
    keywords: ["search", "research", "find", "look up", "documentation", "api"],
    complexity: 2,
    examples: ["Find documentation for a library", "Research best practices", "Look up API usage"],
  },
  {
    id: "research.learn",
    name: "Technology Learning",
    description: "Learn new technologies and frameworks",
    category: "research",
    keywords: ["learn", "tutorial", "guide", "how to", "introduction"],
    complexity: 5,
    examples: ["Learn a new framework's patterns", "Understand a protocol", "Read migration guides"],
  },

  // Integration capabilities
  {
    id: "integration.api",
    name: "API Integration",
    description: "Integrate with external APIs and services",
    category: "integration",
    keywords: ["api", "integrate", "connect", "webhook", "rest", "graphql"],
    complexity: 6,
    subCapabilities: ["code.write", "research.search"],
    examples: ["Integrate with Stripe payments", "Add OAuth2 authentication", "Connect to a third-party API"],
  },
  {
    id: "integration.messaging",
    name: "Messaging Integration",
    description: "Send messages and notifications through various channels",
    category: "integration",
    keywords: ["message", "notification", "email", "slack", "discord", "telegram"],
    complexity: 3,
    examples: ["Send a notification to Slack", "Format an email digest", "Post a status update to Discord"],
  },

  // Security capabilities
  {
    id: "security.audit",
    name: "Security Audit",
    description: "Audit code and configurations for security vulnerabilities",
    category: "security",
    keywords: ["security", "vulnerability", "cve", "audit", "threat"],
    complexity: 8,
    subCapabilities: ["code.read"],
    examples: ["Audit dependencies for CVEs", "Review auth implementation", "Check for injection vulnerabilities"],
  },
  {
    id: "security.secrets",
    name: "Secrets Management",
    description: "Manage secrets, keys, and credentials securely",
    category: "security",
    keywords: ["secret", "key", "credential", "vault", "encrypt", "token"],
    complexity: 6,
    examples: ["Rotate API keys", "Set up credential vault", "Audit secret usage"],
  },

  // Documentation capabilities
  {
    id: "docs.write",
    name: "Write Documentation",
    description: "Create and update documentation",
    category: "documentation",
    keywords: ["document", "readme", "docs", "wiki", "guide", "changelog"],
    complexity: 3,
    subCapabilities: ["code.read"],
    examples: ["Write API documentation", "Update the README", "Create a contribution guide"],
  },
  {
    id: "docs.generate",
    name: "Generate Reports",
    description: "Generate structured reports and summaries",
    category: "documentation",
    keywords: ["report", "summary", "generate", "export", "markdown"],
    complexity: 3,
    examples: ["Generate a monthly activity report", "Create a changelog", "Export a summary of changes"],
  },

  // Communication capabilities
  {
    id: "communication.chat",
    name: "Chat & Discuss",
    description: "Engage in conversation, answer questions, provide guidance",
    category: "communication",
    keywords: ["chat", "discuss", "answer", "explain", "guide", "help"],
    complexity: 3,
    examples: ["Answer a technical question", "Explain a concept", "Guide through a troubleshooting process"],
  },
  {
    id: "communication.coordinate",
    name: "Multi-Agent Coordination",
    description: "Coordinate work across multiple agents and systems",
    category: "communication",
    keywords: ["coordinate", "delegate", "orchestrate", "distribute", "parallel"],
    complexity: 9,
    subCapabilities: ["communication.chat", "architecture.plan"],
    examples: ["Split a large task across agents", "Coordinate parallel workstreams", "Merge results from multiple agents"],
  },

  // Automation capabilities
  {
    id: "automation.workflow",
    name: "Workflow Automation",
    description: "Automate repetitive workflows and processes",
    category: "automation",
    keywords: ["automate", "workflow", "pipeline", "script", "cron", "schedule"],
    complexity: 5,
    examples: ["Create a deployment pipeline", "Set up a daily report cron", "Automate a repetitive task"],
  },
  {
    id: "automation.test",
    name: "Test Automation",
    description: "Automate testing workflows and CI pipelines",
    category: "automation",
    keywords: ["ci", "cd", "pipeline", "automated test", "github actions"],
    complexity: 6,
    subCapabilities: ["test.unit", "deploy.build"],
    examples: ["Set up CI for a project", "Automate regression testing", "Create a test matrix pipeline"],
  },
]

// ── Capability Registry ───────────────────────────────────────────────

export class CapabilityRegistry {
  private capabilities = new Map<string, Capability>()
  private registrations = new Map<string, AgentCapabilityRegistration>()

  constructor() {
    // Register built-in capabilities
    for (const cap of BUILTIN_CAPABILITIES) {
      this.capabilities.set(cap.id, cap)
    }
  }

  // ── Capability management ──────────────────────────────────────────

  /**
   * Register a new capability.
   */
  registerCapability(cap: Capability): void {
    this.capabilities.set(cap.id, cap)
  }

  /**
   * Get a capability by ID.
   */
  getCapability(id: string): Capability | undefined {
    return this.capabilities.get(id)
  }

  /**
   * List all registered capabilities, optionally filtered by category.
   */
  listCapabilities(category?: CapabilityCategory): Capability[] {
    const all = Array.from(this.capabilities.values())
    return category ? all.filter((c) => c.category === category) : all
  }

  /**
   * Search capabilities by keyword.
   */
  searchCapabilities(query: string): Capability[] {
    const q = query.toLowerCase()
    return Array.from(this.capabilities.values()).filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q)) ||
      c.examples.some((e) => e.toLowerCase().includes(q)),
    )
  }

  /**
   * Get all capability categories.
   */
  getCategories(): CapabilityCategory[] {
    const cats = new Set<CapabilityCategory>()
    for (const cap of this.capabilities.values()) {
      cats.add(cap.category)
    }
    return Array.from(cats)
  }

  // ── Agent registration ─────────────────────────────────────────────

  /**
   * Register an agent with its capabilities.
   */
  registerAgent(agentId: string, agentType: string, capabilityIds: string[], tags?: string[]): boolean {
    // Validate all capability IDs exist
    for (const id of capabilityIds) {
      if (!this.capabilities.has(id)) {
        console.warn(`CapabilityRegistry: Unknown capability "${id}" for agent ${agentId}`)
      }
    }

    this.registrations.set(agentId, {
      agentId,
      agentType,
      capabilities: capabilityIds,
      registeredAt: Date.now(),
      loadFactor: 0,
      tags: tags || [],
    })
    return true
  }

  /**
   * Unregister an agent.
   */
  unregisterAgent(agentId: string): boolean {
    return this.registrations.delete(agentId)
  }

  /**
   * Update an agent's load factor.
   */
  updateLoadFactor(agentId: string, loadFactor: number): void {
    const reg = this.registrations.get(agentId)
    if (reg) {
      reg.loadFactor = Math.max(0, Math.min(1, loadFactor))
    }
  }

  /**
   * Get all registered agents.
   */
  listAgents(): AgentCapabilityRegistration[] {
    return Array.from(this.registrations.values())
  }

  /**
   * Get an agent's registration.
   */
  getAgentRegistration(agentId: string): AgentCapabilityRegistration | undefined {
    return this.registrations.get(agentId)
  }

  // ── Task routing ───────────────────────────────────────────────────

  /**
   * Find the best agent match for a task description.
   * Returns top N matches sorted by score.
   */
  findBestMatch(taskDescription: string, limit = 3): CapabilityMatch[] {
    const q = taskDescription.toLowerCase()
    const matches: CapabilityMatch[] = []

    // Score each capability
    for (const cap of this.capabilities.values()) {
      let score = 0
      const reasons: string[] = []

      // Exact name match
      if (cap.name.toLowerCase().includes(q)) {
        score += 50
        reasons.push("name match")
      }

      // Keyword matches
      for (const kw of cap.keywords) {
        if (q.includes(kw.toLowerCase())) {
          score += 15
          reasons.push(`keyword: ${kw}`)
        }
      }

      // Description match
      if (cap.description.toLowerCase().includes(q)) {
        score += 10
        reasons.push("description match")
      }

      // Example match
      for (const ex of cap.examples) {
        if (q.includes(ex.toLowerCase().slice(0, 20))) {
          score += 8
          reasons.push("example match")
        }
      }

      if (score > 0) {
        matches.push({ capability: cap, agentId: "", score, matchReasons: reasons })
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score)

    // Assign best agents for each matched capability
    for (const match of matches) {
      const bestAgent = this.findBestAgentForCapability(match.capability.id)
      match.agentId = bestAgent || "unassigned"
    }

    return matches.slice(0, limit)
  }

  /**
   * Route a task to the best agent.
   * For complex tasks, returns sub-routes to multiple agents.
   */
  routeTask(taskDescription: string): TaskRoute | null {
    const matches = this.findBestMatch(taskDescription, 1)
    if (matches.length === 0) return null

    const best = matches[0]!

    // Check if the capability has sub-capabilities (complex task)
    const subRoutes: TaskRoute["subRoutes"] = []
    if (best.capability.subCapabilities) {
      for (const subCapId of best.capability.subCapabilities) {
        const subCap = this.capabilities.get(subCapId)
        if (subCap) {
          const subAgent = this.findBestAgentForCapability(subCapId)
          subRoutes.push({
            subTask: subCap.name,
            agentId: subAgent || "unassigned",
            capability: subCap,
            score: 30,
          })
        }
      }
    }

    return {
      taskDescription,
      primaryAgentId: best.agentId,
      primaryCapability: best.capability,
      score: best.score,
      subRoutes: subRoutes.length > 0 ? subRoutes : undefined,
    }
  }

  /**
   * Decompose a complex task into sub-tasks based on capability composition.
   */
  decomposeTask(taskDescription: string): Array<{ subTask: string; targetCapability: string }> {
    const matches = this.findBestMatch(taskDescription, 5)
    const decomposition: Array<{ subTask: string; targetCapability: string }> = []

    for (const match of matches) {
      decomposition.push({
        subTask: match.capability.name,
        targetCapability: match.capability.id,
      })
    }

    return decomposition
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private findBestAgentForCapability(capabilityId: string): string | undefined {
    let bestAgent: string | undefined
    let lowestLoad = 1

    for (const [agentId, reg] of this.registrations) {
      if (reg.capabilities.includes(capabilityId) && reg.loadFactor < lowestLoad) {
        lowestLoad = reg.loadFactor
        bestAgent = agentId
      }
    }

    return bestAgent
  }

  /**
   * Get overall registry statistics.
   */
  getStats(): {
    totalCapabilities: number
    totalCategories: number
    totalRegisteredAgents: number
    byCategory: Record<string, number>
    topCapabilities: Array<{ id: string; name: string; matchedCount: number }>
  } {
    const byCategory: Record<string, number> = {}
    for (const cap of this.capabilities.values()) {
      byCategory[cap.category] = (byCategory[cap.category] || 0) + 1
    }

    const topCaps = Array.from(this.capabilities.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, matchedCount: 0 }))

    return {
      totalCapabilities: this.capabilities.size,
      totalCategories: Object.keys(byCategory).length,
      totalRegisteredAgents: this.registrations.size,
      byCategory,
      topCapabilities: topCaps,
    }
  }
}

/** Singleton capability registry instance */
export const capabilityRegistry = new CapabilityRegistry()
