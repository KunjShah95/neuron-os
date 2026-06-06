import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"

// ── Capability data ──────────────────────────────────────────────────

interface CapabilityDef {
  id: string
  name: string
  description: string
  category: string
  keywords: string[]
  complexity: number
  examples: string[]
  subCapabilities?: string[]
  requiresExternal?: string[]
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  code: { label: "Code", icon: "💻", color: "#3B82F6" },
  analysis: { label: "Analysis", icon: "🔬", color: "#8B5CF6" },
  architecture: { label: "Architecture", icon: "🏛️", color: "#7C3AED" },
  testing: { label: "Testing", icon: "🧪", color: "#10B981" },
  deployment: { label: "Deployment", icon: "🚀", color: "#F59E0B" },
  monitoring: { label: "Monitoring", icon: "📊", color: "#06B6D4" },
  research: { label: "Research", icon: "📚", color: "#EC4899" },
  integration: { label: "Integration", icon: "🔗", color: "#14B8A6" },
  security: { label: "Security", icon: "🛡️", color: "#EF4444" },
  documentation: { label: "Documentation", icon: "📝", color: "#84CC16" },
  communication: { label: "Communication", icon: "💬", color: "#F472B6" },
  automation: { label: "Automation", icon: "⚡", color: "#F97316" },
}

const CAPABILITIES: CapabilityDef[] = [
  { id: "code.write", name: "Write Code", description: "Create new source files and implement features", category: "code", keywords: ["write", "create", "implement", "add", "feature"], complexity: 5, examples: ["Implement a new API endpoint", "Create a React component", "Add a database migration"] },
  { id: "code.edit", name: "Edit Code", description: "Modify existing code to fix bugs or add functionality", category: "code", keywords: ["edit", "modify", "update", "change", "fix", "patch"], complexity: 4, examples: ["Fix a bug in the login flow", "Update error handling", "Refactor a function"] },
  { id: "code.refactor", name: "Refactor Code", description: "Restructure code without changing external behavior", category: "code", keywords: ["refactor", "restructure", "clean up", "improve", "optimize"], complexity: 6, subCapabilities: ["code.read", "code.write"], examples: ["Extract a shared utility function", "Rename symbols across files", "Split a large module"] },
  { id: "code.read", name: "Read & Understand Code", description: "Explore codebases and understand existing patterns", category: "code", keywords: ["read", "find", "search", "explore", "understand", "navigate"], complexity: 2, examples: ["Find where a function is defined", "Understand the authentication flow", "Map data flow through the system"] },
  { id: "analysis.review", name: "Code Review", description: "Review code for bugs, security issues, and anti-patterns", category: "analysis", keywords: ["review", "audit", "inspect", "check", "analyze"], complexity: 5, subCapabilities: ["code.read"], examples: ["Review a pull request", "Security audit of authentication code", "Check for performance issues"] },
  { id: "analysis.debug", name: "Debugging", description: "Systematic diagnosis and resolution of bugs", category: "analysis", keywords: ["debug", "diagnose", "troubleshoot", "root cause", "fix bug"], complexity: 7, subCapabilities: ["code.read", "code.edit"], examples: ["Debug a production crash", "Find the cause of a memory leak", "Fix a race condition"] },
  { id: "analysis.architecture", name: "Architecture Analysis", description: "Analyze system architecture and design patterns", category: "analysis", keywords: ["architecture", "design", "structure", "pattern", "diagram"], complexity: 8, examples: ["Document system architecture", "Identify architectural debt", "Design a new service boundary"] },
  { id: "architecture.plan", name: "Planning & Design", description: "Create implementation plans and architectural designs", category: "architecture", keywords: ["plan", "design", "architect", "roadmap", "strategy", "proposal"], complexity: 7, examples: ["Design a new feature architecture", "Create a migration plan", "Design an API contract"] },
  { id: "test.unit", name: "Unit Testing", description: "Write and run unit tests", category: "testing", keywords: ["unit test", "spec", "jest", "vitest", "pytest", "coverage"], complexity: 4, examples: ["Write unit tests for a service", "Increase test coverage", "Fix flaky tests"] },
  { id: "test.integration", name: "Integration Testing", description: "Write and run integration and end-to-end tests", category: "testing", keywords: ["integration test", "e2e", "end to end", "cypress", "playwright"], complexity: 6, subCapabilities: ["test.unit"], examples: ["Set up E2E tests for the login flow", "Write API integration tests"] },
  { id: "test.validate", name: "Validation & Linting", description: "Run type checks, linters, and validators", category: "testing", keywords: ["validate", "lint", "typecheck", "tsc", "eslint", "prettier"], complexity: 2, examples: ["Run the type checker", "Fix lint errors", "Format code"] },
  { id: "deploy.build", name: "Build & Package", description: "Build, package, and prepare artifacts for deployment", category: "deployment", keywords: ["build", "compile", "bundle", "package", "artifact"], complexity: 4, examples: ["Build the production bundle", "Create a Docker image", "Package a release"] },
  { id: "deploy.release", name: "Release & Deploy", description: "Deploy applications to environments", category: "deployment", keywords: ["deploy", "release", "publish", "ship", "rollout"], complexity: 7, subCapabilities: ["deploy.build", "test.validate"], examples: ["Deploy to production", "Roll back a bad release", "Set up a staging environment"] },
  { id: "deploy.infra", name: "Infrastructure", description: "Manage infrastructure and cloud resources", category: "deployment", keywords: ["infrastructure", "terraform", "docker", "kubernetes", "cloud", "aws"], complexity: 8, examples: ["Provision a new server", "Update Kubernetes manifests", "Set up CI/CD pipeline"] },
  { id: "monitor.health", name: "Health Monitoring", description: "Monitor system health, uptime, and performance", category: "monitoring", keywords: ["monitor", "health", "uptime", "alert", "dashboard"], complexity: 4, examples: ["Check system health", "Set up monitoring alerts", "Investigate performance degradation"] },
  { id: "monitor.analyze", name: "Log Analysis", description: "Analyze logs and metrics for insights", category: "monitoring", keywords: ["log", "metric", "analyze", "trend", "pattern", "observability"], complexity: 5, examples: ["Analyze error logs", "Identify usage patterns", "Correlate metrics with incidents"] },
  { id: "research.search", name: "Web Search & Research", description: "Search the web and gather information", category: "research", keywords: ["search", "research", "find", "look up", "documentation", "api"], complexity: 2, examples: ["Find documentation for a library", "Research best practices", "Look up API usage"] },
  { id: "integration.api", name: "API Integration", description: "Integrate with external APIs and services", category: "integration", keywords: ["api", "integrate", "connect", "webhook", "rest", "graphql"], complexity: 6, subCapabilities: ["code.write", "research.search"], examples: ["Integrate with Stripe payments", "Add OAuth2 authentication", "Connect to a third-party API"] },
  { id: "integration.messaging", name: "Messaging Integration", description: "Send messages and notifications through various channels", category: "integration", keywords: ["message", "notification", "email", "slack", "discord", "telegram"], complexity: 3, examples: ["Send a notification to Slack", "Format an email digest", "Post a status update to Discord"] },
  { id: "security.audit", name: "Security Audit", description: "Audit code and configurations for security vulnerabilities", category: "security", keywords: ["security", "vulnerability", "cve", "audit", "threat"], complexity: 8, subCapabilities: ["code.read"], examples: ["Audit dependencies for CVEs", "Review auth implementation", "Check for injection vulnerabilities"] },
  { id: "security.secrets", name: "Secrets Management", description: "Manage secrets, keys, and credentials securely", category: "security", keywords: ["secret", "key", "credential", "vault", "encrypt", "token"], complexity: 6, examples: ["Rotate API keys", "Set up credential vault", "Audit secret usage"] },
  { id: "docs.write", name: "Write Documentation", description: "Create and update documentation", category: "documentation", keywords: ["document", "readme", "docs", "wiki", "guide", "changelog"], complexity: 3, subCapabilities: ["code.read"], examples: ["Write API documentation", "Update the README", "Create a contribution guide"] },
  { id: "docs.generate", name: "Generate Reports", description: "Generate structured reports and summaries", category: "documentation", keywords: ["report", "summary", "generate", "export", "markdown"], complexity: 3, examples: ["Generate a monthly activity report", "Create a changelog", "Export a summary of changes"] },
  { id: "communication.chat", name: "Chat & Discuss", description: "Engage in conversation, answer questions, provide guidance", category: "communication", keywords: ["chat", "discuss", "answer", "explain", "guide", "help"], complexity: 3, examples: ["Answer a technical question", "Explain a concept", "Guide through a troubleshooting process"] },
  { id: "communication.coordinate", name: "Multi-Agent Coordination", description: "Coordinate work across multiple agents and systems", category: "communication", keywords: ["coordinate", "delegate", "orchestrate", "distribute", "parallel"], complexity: 9, subCapabilities: ["communication.chat", "architecture.plan"], examples: ["Split a large task across agents", "Coordinate parallel workstreams", "Merge results from multiple agents"] },
  { id: "automation.workflow", name: "Workflow Automation", description: "Automate repetitive workflows and processes", category: "automation", keywords: ["automate", "workflow", "pipeline", "script", "cron", "schedule"], complexity: 5, examples: ["Create a deployment pipeline", "Set up a daily report cron", "Automate a repetitive task"] },
  { id: "automation.test", name: "Test Automation", description: "Automate testing workflows and CI pipelines", category: "automation", keywords: ["ci", "cd", "pipeline", "automated test", "github actions"], complexity: 6, subCapabilities: ["test.unit", "deploy.build"], examples: ["Set up CI for a project", "Automate regression testing", "Create a test matrix pipeline"] },
]

// ── Complexity badge ─────────────────────────────────────────────────

function ComplexityBadge({ level }: { level: number }) {
  const color = level <= 3 ? "#10B981" : level <= 6 ? "#F59E0B" : "#EF4444"
  const label = level <= 3 ? "Simple" : level <= 6 ? "Moderate" : "Complex"
  return (
    <span
      className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      {label} ({level}/10)
    </span>
  )
}

// ── Capability card ──────────────────────────────────────────────────

function CapabilityCard({ cap }: { cap: CapabilityDef }) {
  const meta = CATEGORY_META[cap.category]
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      layout
      className="glass rounded-2xl overflow-hidden border border-surface-700/30"
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{meta?.icon || "📦"}</span>
            <div>
              <h3 className="text-xs font-medium text-surface-100">{cap.name}</h3>
              <span className="text-[8px] text-surface-600 font-mono uppercase tracking-wider">{cap.id}</span>
            </div>
          </div>
          <ComplexityBadge level={cap.complexity} />
        </div>

        <p className="text-[10px] text-surface-400 leading-relaxed mb-3">{cap.description}</p>

        {/* Keywords */}
        <div className="flex flex-wrap gap-1 mb-2">
          {cap.keywords.slice(0, 4).map((kw) => (
            <span key={kw} className="px-1.5 py-0.5 rounded bg-surface-800/60 text-[7px] text-surface-500 font-mono">
              {kw}
            </span>
          ))}
          {cap.keywords.length > 4 && (
            <span className="text-[7px] text-surface-600 font-mono">+{cap.keywords.length - 4}</span>
          )}
        </div>

        {/* Category badge */}
        <span
          className="inline-block px-2 py-0.5 rounded text-[7px] font-mono uppercase tracking-wider"
          style={{ background: `${meta?.color}15`, color: meta?.color, border: `1px solid ${meta?.color}30` }}
        >
          {meta?.label || cap.category}
        </span>
      </div>

      {/* Expand for examples & sub-capabilities */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 overflow-hidden"
          >
            {/* Examples */}
            <div className="py-3 border-t border-surface-700/20">
              <h4 className="text-[8px] text-surface-500 uppercase tracking-wider font-mono mb-1.5">Examples</h4>
              <ul className="space-y-0.5">
                {cap.examples.map((ex, i) => (
                  <li key={i} className="text-[9px] text-surface-400 flex items-start gap-1.5">
                    <span className="text-surface-600 mt-0.5">→</span>
                    {ex}
                  </li>
                ))}
              </ul>
            </div>

            {/* Sub-capabilities */}
            {cap.subCapabilities && cap.subCapabilities.length > 0 && (
              <div className="py-3 border-t border-surface-700/20">
                <h4 className="text-[8px] text-surface-500 uppercase tracking-wider font-mono mb-1.5">Composed Of</h4>
                <div className="flex flex-wrap gap-1">
                  {cap.subCapabilities.map((sub) => {
                    const subCap = CAPABILITIES.find((c) => c.id === sub)
                    const subMeta = subCap ? CATEGORY_META[subCap.category] : undefined
                    return (
                      <span
                        key={sub}
                        className="px-1.5 py-0.5 rounded text-[8px] font-mono"
                        style={{ background: `${subMeta?.color}12`, color: subMeta?.color || "#666" }}
                      >
                        {sub}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {cap.requiresExternal && cap.requiresExternal.length > 0 && (
              <div className="py-3 border-t border-surface-700/20 mb-3">
                <h4 className="text-[8px] text-surface-500 uppercase tracking-wider font-mono mb-1.5">Requires</h4>
                <div className="flex flex-wrap gap-1">
                  {cap.requiresExternal.map((dep) => (
                    <span key={dep} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[8px] text-amber-400/70 font-mono">
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full py-2 text-[8px] text-surface-600 hover:text-surface-400 transition-colors uppercase tracking-wider border-t border-surface-700/20"
      >
        {expanded ? "Less" : `${cap.examples.length} examples · More`}
      </button>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export default function Capabilities() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [complexityFilter, setComplexityFilter] = useState<number | null>(null)

  const categories = useMemo(() => Object.keys(CATEGORY_META), [])

  const filtered = useMemo(() => {
    let result = CAPABILITIES
    if (selectedCategory) {
      result = result.filter((c) => c.category === selectedCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.toLowerCase().includes(q))
      )
    }
    if (complexityFilter !== null) {
      result = result.filter((c) => c.complexity <= complexityFilter)
    }
    return result
  }, [selectedCategory, searchQuery, complexityFilter])

  const stats = useMemo(() => ({
    total: CAPABILITIES.length,
    categories: categories.length,
    avgComplexity: Math.round(CAPABILITIES.reduce((s, c) => s + c.complexity, 0) / CAPABILITIES.length),
    withSubCaps: CAPABILITIES.filter((c) => c.subCapabilities && c.subCapabilities.length > 0).length,
  }), [categories])

  return (
    <AnimatedPage className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">Capability Registry</h1>
          <p className="text-xs text-surface-500 mt-1">
            {stats.total} capabilities across {stats.categories} categories — agents dynamically register their capabilities for intelligent task routing
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6">
        {[
          { label: "Total Capabilities", value: stats.total, icon: "⚡" },
          { label: "Categories", value: stats.categories, icon: "📂" },
          { label: "Avg Complexity", value: stats.avgComplexity, icon: "📊" },
          { label: "Composable", value: stats.withSubCaps, icon: "🔗" },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-xl px-4 py-3 flex items-center gap-3 border border-surface-700/20">
            <span className="text-lg text-surface-500">{stat.icon}</span>
            <div>
              <div className="text-lg font-display text-surface-100">{stat.value}</div>
              <div className="text-[8px] text-surface-600 uppercase tracking-wider font-mono">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-surface-500">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search capabilities..."
            className="w-full bg-surface-900/60 border border-surface-700/30 rounded-xl pl-8 pr-3 py-2 text-xs text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono transition-all border ${
              !selectedCategory
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat]
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-mono transition-all border ${
                  selectedCategory === cat
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
                }`}
              >
                {meta?.icon} {meta?.label}
              </button>
            )
          })}
        </div>

        {/* Complexity slider */}
        <div className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 border border-surface-700/20">
          <span className="text-[8px] text-surface-600 uppercase tracking-wider font-mono">Max:</span>
          <input
            type="range"
            min={1}
            max={10}
            value={complexityFilter ?? 10}
            onChange={(e) => setComplexityFilter(parseInt(e.target.value) === 10 ? null : parseInt(e.target.value))}
            className="w-20 accent-amber-400"
          />
          <span className="text-[10px] text-surface-400 font-mono w-4 text-right">{complexityFilter ?? 10}</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((cap) => (
            <motion.div
              key={cap.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <CapabilityCard cap={cap} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-20">🔍</div>
          <p className="text-surface-600 text-xs">No capabilities match your filters.</p>
        </div>
      )}
    </AnimatedPage>
  )
}
