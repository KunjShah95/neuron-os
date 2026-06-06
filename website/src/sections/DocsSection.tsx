import { useState } from "react"
import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import GlassCard from "../components/GlassCard"

const navGroups = [
  {
    label: "GETTING STARTED",
    items: ["Installation", "Quickstart", "Your first agent", "Configuration"],
  },
  {
    label: "AGENTS",
    items: ["14 agent types", "Spawn & supervise", "Tool scoping", "Reflection loop"],
  },
  {
    label: "MEMORY & SESSIONS",
    items: ["Vector store", "Session replay", "Audit log", "Provenance"],
  },
  {
    label: "INTEGRATIONS",
    items: ["MCP server", "CLI reference", "Webhooks", "API"],
  },
]

interface DocContent {
  description: string
  codeLines: { tone: "comment" | "default" | "blank"; text: string }[]
  tableRows: { name: string; type: string; desc: string }[]
}

const docContent: Record<string, DocContent> = {
  Installation: {
    description:
      "Install Neuron OS in seconds with a single command. Works on macOS, Linux, and Windows via Bun. No Docker required for basic usage — just Bun and a terminal.",
    codeLines: [
      { tone: "comment", text: "# Install Bun (if you don't have it)" },
      { tone: "default", text: "curl -fsSL https://bun.sh/install | bash" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Clone and install Neuron OS" },
      { tone: "default", text: "git clone https://github.com/KunjShah95/neuron-os.git" },
      { tone: "default", text: "cd neuron-os" },
      { tone: "default", text: "bun install" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Set your API key and start" },
      { tone: "default", text: "echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> .env" },
      { tone: "default", text: "bun run index.ts" },
    ],
    tableRows: [
      { name: "bun install", type: "Command", desc: "Install all dependencies" },
      { name: ".env", type: "File", desc: "Environment variables for API keys" },
      { name: "aegis setup", type: "Command", desc: "Interactive setup wizard" },
      { name: "aegis doctor", type: "Command", desc: "Verify your installation" },
    ],
  },
  Quickstart: {
    description:
      "Get an AI agent running in under 60 seconds. No configuration needed — just pick a command and go. All modes are available from the interactive menu.",
    codeLines: [
      { tone: "comment", text: "# Launch the interactive menu" },
      { tone: "default", text: "bun run index.ts" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Or run a command directly" },
      { tone: "default", text: "bun run index.ts ask \"How does the agent system work?\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start the Telegram bot for mobile access" },
      { tone: "default", text: "bun run index.ts telegram" },
    ],
    tableRows: [
      { name: "wakeup", type: "Command", desc: "Interactive mode picker" },
      { name: "chat", type: "Command", desc: "Interactive AI chat session" },
      { name: "ask", type: "Command", desc: "Ask read-only questions" },
      { name: "plan", type: "Command", desc: "Generate implementation plans" },
    ],
  },
  "Your first agent": {
    description:
      "Spawn your first autonomous agent with a single command. The agent explores code, runs tools, and reports back — all with full audit trail and approval flow.",
    codeLines: [
      { tone: "comment", text: "# Spawn an ask agent to research your codebase" },
      { tone: "default", text: "bun run index.ts ask \"Explain the memory system\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run a plan agent to generate a feature spec" },
      { tone: "default", text: "bun run index.ts plan \"Add dark mode to dashboard\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Use agent-run for full approval flow" },
      { tone: "default", text: "bun run index.ts agent-run \"Refactor auth module\"" },
    ],
    tableRows: [
      { name: "ask", type: "Agent", desc: "Read-only research agent" },
      { name: "plan", type: "Agent", desc: "Structured plan generation" },
      { name: "agent-run", type: "Agent", desc: "Full approval-based execution" },
      { name: "session", type: "Command", desc: "Inspect and replay sessions" },
    ],
  },
  Configuration: {
    description:
      "Configure providers, models, and system behavior via environment variables or the interactive setup wizard. All settings can be changed at runtime per session.",
    codeLines: [
      { tone: "comment", text: "# Interactive setup wizard" },
      { tone: "default", text: "aegis setup" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Or configure via CLI" },
      { tone: "default", text: "aegis config set AEGIS_AI_PROVIDER openrouter" },
      { tone: "default", text: "aegis config set AEGIS_AI_MODEL openrouter/free" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Verify your setup" },
      { tone: "default", text: "aegis doctor" },
    ],
    tableRows: [
      { name: "aegis setup", type: "Command", desc: "Interactive configuration wizard" },
      { name: "aegis config", type: "Command", desc: "View and set config values" },
      { name: "aegis doctor", type: "Command", desc: "Diagnose your setup" },
      { name: ".env", type: "File", desc: "Environment variable overrides" },
    ],
  },
  "14 agent types": {
    description:
      "Neuron OS ships with 14 specialized agent types, each optimized for a specific task. Compose them together to build complex multi-agent workflows with supervision and reflection.",
    codeLines: [
      { tone: "comment", text: "# List all available agent types" },
      { tone: "default", text: "aegis agent list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Spawn a build agent" },
      { tone: "default", text: "aegis agent spawn build --name builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run a reflect agent to review changes" },
      { tone: "default", text: "aegis agent-run \"Review the latest commit\" --type review" },
    ],
    tableRows: [
      { name: "build", type: "Agent", desc: "Write and modify code" },
      { name: "plan", type: "Agent", desc: "Generate step-by-step plans" },
      { name: "review", type: "Agent", desc: "Review code changes" },
      { name: "reflect", type: "Agent", desc: "Self-reflection and improvement" },
      { name: "test", type: "Agent", desc: "Write and run tests" },
      { name: "debug", type: "Agent", desc: "Debug issues" },
      { name: "deploy", type: "Agent", desc: "Deploy to production" },
      { name: "monitor", type: "Agent", desc: "Monitor running systems" },
    ],
  },
  "Spawn & supervise": {
    description:
      "Agents run in isolated sandboxes with scoped tools. Spawn multiple agents, supervise their execution, and view a live dashboard of all running agents and their logs.",
    codeLines: [
      { tone: "comment", text: "# Spawn an agent with a specific type" },
      { tone: "default", text: "aegis agent spawn build --name builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View all running agents" },
      { tone: "default", text: "aegis agent list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Kill an agent by ID" },
      { tone: "default", text: "aegis agent kill builder-01" },
    ],
    tableRows: [
      { name: "spawn", type: "Command", desc: "Start a new agent" },
      { name: "list", type: "Command", desc: "List running agents" },
      { name: "kill", type: "Command", desc: "Stop a running agent" },
      { name: "dashboard", type: "Mode", desc: "Live agent monitoring TUI" },
    ],
  },
  "Tool scoping": {
    description:
      "Every agent gets a scoped set of tools based on its type. Build agents can write files, ask agents are read-only, and plan agents can search but not modify. Tool access is enforced at the sandbox level.",
    codeLines: [
      { tone: "comment", text: "# Check what tools an agent type has" },
      { tone: "default", text: "aegis agent types build" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run with sandbox restrictions" },
      { tone: "default", text: "AEGIS_SANDBOX=docker aegis agent-run \"Build feature\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View audit log of all tool calls" },
      { tone: "default", text: "aegis audit list" },
    ],
    tableRows: [
      { name: "read", type: "Tool Access", desc: "Codebase reading (ask, plan)" },
      { name: "write", type: "Tool Access", desc: "File modification (build, refactor)" },
      { name: "shell", type: "Tool Access", desc: "Command execution (debug, deploy)" },
      { name: "search", type: "Tool Access", desc: "Web and code search (research)" },
    ],
  },
  "Reflection loop": {
    description:
      "Agents can reflect on their own output, review their work, and improve it iteratively. The reflection loop runs until quality gates pass or max iterations are reached.",
    codeLines: [
      { tone: "comment", text: "# Run an agent with reflection enabled" },
      { tone: "default", text: "aegis agent-run \"Refactor auth module\" --ratchet" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# The ratchet checks for regressions" },
      { tone: "comment", text: "# and reverts if typecheck fails" },
      { tone: "default", text: "aegis agent-run \"Add feature\" --eval typecheck,tests-pass" },
    ],
    tableRows: [
      { name: "ratchet", type: "Option", desc: "Git-based regression guard" },
      { name: "eval", type: "Option", desc: "Evaluation metrics to pass" },
      { name: "reflect", type: "Mode", desc: "Self-review and improvement" },
      { name: "supervise", type: "Command", desc: "Multi-agent supervision" },
    ],
  },
  "Vector store": {
    description:
      "Semantic search across all your conversations, code, and facts. Uses TF-IDF indexing with cosine similarity. Query with natural language and get ranked results with relevance scores.",
    codeLines: [
      { tone: "comment", text: "# Search memory semantically" },
      { tone: "default", text: "aegis memory search \"deployment configuration\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View recent memory entries" },
      { tone: "default", text: "aegis memory list --limit 20" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Add a note to memory" },
      { tone: "default", text: "aegis memory add \"The API uses port 8080\"" },
    ],
    tableRows: [
      { name: "search", type: "Command", desc: "Semantic search across memory" },
      { name: "add", type: "Command", desc: "Add entries to memory" },
      { name: "list", type: "Command", desc: "Browse recent memory" },
      { name: "forget", type: "Command", desc: "Remove memory entries" },
    ],
  },
  "Session replay": {
    description:
      "Every interaction is recorded in a session log. Replay sessions step-by-step, inspect every tool call and LLM response, and export sessions for sharing or debugging.",
    codeLines: [
      { tone: "comment", text: "# List recent sessions" },
      { tone: "default", text: "aegis session list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Replay a session" },
      { tone: "default", text: "aegis session replay --id session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Export as JSON" },
      { tone: "default", text: "aegis session export --id session-abc123 --format json" },
    ],
    tableRows: [
      { name: "list", type: "Command", desc: "List all saved sessions" },
      { name: "replay", type: "Command", desc: "Replay a session step by step" },
      { name: "export", type: "Command", desc: "Export session data" },
      { name: "resume", type: "Command", desc: "Continue a previous session" },
    ],
  },
  "Audit log": {
    description:
      "The audit log records every action an agent takes — every file read, write, shell command, and tool call. Full provenance tracking with timestamps and agent attribution.",
    codeLines: [
      { tone: "comment", text: "# View the audit trail" },
      { tone: "default", text: "aegis audit list --limit 50" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Filter by agent" },
      { tone: "default", text: "aegis audit list --agent builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Policy violations" },
      { tone: "default", text: "aegis audit policy --violations" },
    ],
    tableRows: [
      { name: "list", type: "Command", desc: "View audit log entries" },
      { name: "policy", type: "Command", desc: "Manage audit policies" },
      { name: "check", type: "Command", desc: "Check policy compliance" },
      { name: "export", type: "Command", desc: "Export audit trail" },
    ],
  },
  Provenance: {
    description:
      "Every result is traceable back to its source — which agent generated it, what tools it used, what context it had, and which model powered it. Full DAG of dependencies.",
    codeLines: [
      { tone: "comment", text: "# Check provenance of a file" },
      { tone: "default", text: "aegis provenance check src/app.ts" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show the decision tree" },
      { tone: "default", text: "aegis provenance tree --session session-abc" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Verify integrity" },
      { tone: "default", text: "aegis provenance verify --all" },
    ],
    tableRows: [
      { name: "check", type: "Command", desc: "Check provenance of a file" },
      { name: "tree", type: "Command", desc: "Show decision provenance tree" },
      { name: "verify", type: "Command", desc: "Verify data integrity" },
      { name: "export", type: "Command", desc: "Export provenance graph" },
    ],
  },
  "MCP server": {
    description:
      "Model Context Protocol (MCP) support allows Neuron OS to connect with any MCP-compatible client (Claude Code, Cursor, VS Code) and expose its tools and agents as MCP resources.",
    codeLines: [
      { tone: "comment", text: "# Start the MCP server" },
      { tone: "default", text: "aegis mcp serve" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Connect to external MCP servers" },
      { tone: "default", text: "aegis mcp connect --server filesystem" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List configured MCP servers" },
      { tone: "default", text: "aegis mcp list" },
    ],
    tableRows: [
      { name: "serve", type: "Command", desc: "Expose Neuron OS as MCP server" },
      { name: "connect", type: "Command", desc: "Connect to external MCP servers" },
      { name: "list", type: "Command", desc: "List configured MCP servers" },
      { name: "config", type: "Command", desc: "Configure MCP endpoints" },
    ],
  },
  "CLI reference": {
    description:
      "Full CLI reference for all commands and modes. Run any command with --help for detailed usage, or use the interactive wakeup menu to discover available options.",
    codeLines: [
      { tone: "comment", text: "# Interactive menu (also run with no args)" },
      { tone: "default", text: "aegis wakeup" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Help for any command" },
      { tone: "default", text: "aegis chat --help" },
      { tone: "default", text: "aegis agent-run --help" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# System status" },
      { tone: "default", text: "aegis status" },
      { tone: "default", text: "aegis doctor --verbose" },
    ],
    tableRows: [
      { name: "wakeup", type: "Mode", desc: "Interactive command picker" },
      { name: "chat", type: "Mode", desc: "Interactive AI chat" },
      { name: "serve", type: "Mode", desc: "HTTP API server" },
      { name: "telegram", type: "Mode", desc: "Telegram bot" },
      { name: "status", type: "Mode", desc: "System status dashboard" },
    ],
  },
  Webhooks: {
    description:
      "Webhook support enables external services to trigger agents and receive events. Configure webhooks for GitHub pushes, pull requests, or any HTTP POST request with HMAC verification.",
    codeLines: [
      { tone: "comment", text: "# Start the webhook server" },
      { tone: "default", text: "aegis webhook --secret your-webhook-secret" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Webhook endpoints:" },
      { tone: "default", text: "#   POST /api/v1/webhook/github" },
      { tone: "default", text: "#   POST /api/v1/webhook/generic" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Test the webhook" },
      { tone: "default", text: "curl -X POST http://localhost:8080/api/v1/webhook/generic \\" },
      { tone: "default", text: '  -H "Content-Type: application/json" \\' },
      { tone: "default", text: '  -d \'{"event":"deploy","payload":{}}\'' },
    ],
    tableRows: [
      { name: "webhook", type: "Command", desc: "Start webhook server" },
      { name: "github", type: "Endpoint", desc: "GitHub push/PR events" },
      { name: "generic", type: "Endpoint", desc: "Generic HTTP webhooks" },
      { name: "hmac", type: "Security", desc: "HMAC signature verification" },
    ],
  },
  API: {
    description:
      "RESTful API with WebSocket support for real-time agent monitoring. All agent operations are available via the API. Secure with API key authentication and rate limiting.",
    codeLines: [
      { tone: "comment", text: "# Start the API server" },
      { tone: "default", text: "aegis serve --port 8080 --key your-api-key" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Query endpoints" },
      { tone: "default", text: "curl http://localhost:8080/api/v1/health" },
      { tone: "default", text: "curl -H \"X-API-Key: your-key\" http://localhost:8080/api/v1/agents" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# WebSocket for real-time events" },
      { tone: "default", text: "ws://localhost:8080/api/v1/ws" },
    ],
    tableRows: [
      { name: "serve", type: "Command", desc: "Start REST API server" },
      { name: "GET /health", type: "Endpoint", desc: "Health check" },
      { name: "GET /agents", type: "Endpoint", desc: "List running agents" },
      { name: "POST /agents", type: "Endpoint", desc: "Spawn a new agent" },
      { name: "WS /ws", type: "Endpoint", desc: "Real-time event stream" },
    ],
  },
}

const defaultContent: DocContent = {
  description:
    "Select a topic from the sidebar to view its documentation. Each section includes usage examples, command references, and detailed explanations.",
  codeLines: [
    { tone: "comment", text: "# Browse available docs" },
    { tone: "default", text: "aegis docs list" },
    { tone: "blank", text: "" },
    { tone: "comment", text: "# Read specific docs" },
    { tone: "default", text: "aegis docs read agents" },
    { tone: "blank", text: "" },
    { tone: "comment", text: "# Launch the interactive menu" },
    { tone: "default", text: "aegis wakeup" },
  ],
  tableRows: [
    { name: "docs", type: "Command", desc: "Browse documentation from CLI" },
    { name: "wakeup", type: "Command", desc: "Interactive mode picker" },
    { name: "help", type: "Command", desc: "Show help for any command" },
    { name: "doctor", type: "Command", desc: "System diagnostics" },
  ],
}

const toneClass: Record<"comment" | "default" | "blank", string> = {
  comment: "text-ink-500",
  default: "text-white",
  blank: "",
}

export default function DocsSection() {
  const [activeNav, setActiveNav] = useState<string>("Quickstart")
  const content = docContent[activeNav] ?? defaultContent

  // Compute breadcrumb trail
  const group = navGroups.find((g) => g.items.includes(activeNav))
  const breadcrumb = group ? `DOCS / ${group.label.replace(" & ", " / ")} / ${activeNav.toUpperCase()}` : `DOCS / ${activeNav.toUpperCase()}`

  return (
    <section id="docs" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— DOCS"
        tone="cyan"
        title="Documentation that gets out of your way."
        body="A full reference, type-safe guides, and searchable API docs — generated from the same source your agents use."
      />

      <motion.div
        className="mt-14 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6"
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        <motion.div variants={fadeUp}>
          <GlassCard className="p-5">
            <div
              className="flex items-center gap-2 px-3 py-2 mb-5 font-mono text-ink-400"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: "#8b5cf6" }}>⌕</span>
              <span>Search docs</span>
              <span
                className="ml-auto text-ink-500"
                style={{ fontSize: 10, border: "1px solid rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}
              >
                ⌘K
              </span>
            </div>

            <nav className="flex flex-col gap-5">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <div
                    className="font-mono text-ink-500 mb-2"
                    style={{ fontSize: 10, letterSpacing: "0.18em" }}
                  >
                    {group.label}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <li key={item}>
                        <button
                          onClick={() => setActiveNav(item)}
                          className="w-full text-left px-2 py-1.5 rounded-md transition-colors text-[13px]"
                          style={{
                            background: activeNav === item ? "rgba(139,92,246,0.12)" : "transparent",
                            color: activeNav === item ? "#fff" : "rgba(255,255,255,0.55)",
                            borderLeft: activeNav === item ? "2px solid #8b5cf6" : "2px solid transparent",
                            paddingLeft: 8,
                          }}
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </GlassCard>
        </motion.div>

        <motion.div variants={fadeUp} key={activeNav}>
          <GlassCard className="p-6 md:p-8" glow="purple">
            <div
              className="flex items-center gap-2 mb-2 font-mono text-ink-500"
              style={{ fontSize: 10, letterSpacing: "0.18em" }}
            >
              <span>{breadcrumb}</span>
            </div>
            <h3 className="serif-italic text-white" style={{ fontSize: 32, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              {activeNav}
            </h3>
            <p className="text-ink-300 mt-3" style={{ fontSize: 14, lineHeight: 1.6 }}>
              {content.description}
            </p>

            <div
              className="mt-6 rounded-xl overflow-hidden"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="px-4 py-2 font-mono text-ink-500"
                style={{ fontSize: 10, background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                $ shell · aegis-cli
              </div>
              <pre className="px-5 py-4 font-mono" style={{ fontSize: 12.5, lineHeight: 1.75, color: "#e5e5e5", overflowX: "auto" }}>
                {content.codeLines.map((line, i) => (
                  <div key={i} className={toneClass[line.tone]}>
                    {line.tone === "comment" ? line.text : line.text || "\u00A0"}
                  </div>
                ))}
              </pre>
            </div>

            <h4 className="text-white mt-8 mb-3" style={{ fontSize: 16, fontWeight: 500 }}>
              Reference
            </h4>
            <div className="overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-left">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <th className="px-4 py-2.5 font-mono text-ink-400" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 500 }}>COMMAND</th>
                    <th className="px-4 py-2.5 font-mono text-ink-400" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 500 }}>KIND</th>
                    <th className="px-4 py-2.5 font-mono text-ink-400" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 500 }}>DESCRIPTION</th>
                  </tr>
                </thead>
                <tbody>
                  {content.tableRows.map((row, i) => (
                    <tr key={row.name} style={{ borderBottom: i < content.tableRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td className="px-4 py-2.5 font-mono text-white" style={{ fontSize: 12.5 }}>{row.name}</td>
                      <td className="px-4 py-2.5 font-mono text-ink-300" style={{ fontSize: 12 }}>{row.type}</td>
                      <td className="px-4 py-2.5 text-ink-300" style={{ fontSize: 13 }}>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <a
                href="#"
                className="btn-landing-gradient inline-flex items-center gap-2"
                style={{ padding: "8px 14px", fontSize: 12 }}
              >
                Read full guide →
              </a>
              <a
                href="https://github.com/KunjShah95/neuron-os"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-landing-outline inline-flex items-center gap-2"
                style={{ padding: "8px 14px", fontSize: 12 }}
              >
                View on GitHub ↗
              </a>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </section>
  )
}
