// ── Website docs topics ──────────────────────────────────────────────
// Hand-curated marketing copy for the website docs section. The
// `tableRows` reference real command names from shared/commands.json so
// that adding/removing a command in the CLI is reflected in the website
// (with a fallback desc for rows that don't have a JSON source).
// See: docs/superpowers/specs/2026-06-06-docs-section-update-design.md

import commandsJson from "../../../shared/commands.json"

interface ExtractedCommand {
  name: string
  parent?: string
  alias?: string
  description: string
}

const commandMap = new Map<string, ExtractedCommand>(
  (commandsJson.commands as ExtractedCommand[]).map((c) => [c.name, c]),
)

export interface CodeLine {
  tone: "comment" | "default" | "blank"
  text: string
}

export interface TableRow {
  name: string
  type: string
  desc: string
}

export interface DocTopic {
  id: string
  label: string
  navGroup: string
  description: string
  codeLines: CodeLine[]
  tableRows: TableRow[]
}

function row(name: string, fallbackDesc = ""): TableRow {
  const cmd = commandMap.get(name)
  return {
    name: `aegis ${name}`,
    type: "Command",
    desc: cmd?.description ?? fallbackDesc,
  }
}

export const navGroups: Array<{ label: string; items: string[] }> = [
  {
    label: "GETTING STARTED",
    items: ["Installation", "Quickstart", "Your first agent", "Configuration"],
  },
  {
    label: "AGENTS",
    items: ["Agent system", "Spawn & supervise", "Orchestration", "Reflection loop"],
  },
  {
    label: "MEMORY & SESSIONS",
    items: ["Memory store", "Session replay", "Audit log"],
  },
  {
    label: "INTEGRATIONS",
    items: ["MCP server", "CLI reference", "Webhooks", "API"],
  },
]

export const docTopics: Record<string, DocTopic> = {
  Installation: {
    id: "Installation",
    label: "Installation",
    navGroup: "GETTING STARTED",
    description:
      "Install Neuron OS in seconds. Works on macOS, Linux, and Windows via Bun. No Docker required for basic usage — just Bun and a terminal.",
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
      { tone: "default", text: "bun run index.ts wakeup" },
    ],
    tableRows: [
      row("setup", "Interactive setup wizard"),
      row("setup-keys", "Configure API keys for providers"),
      row("doctor", "Verify your installation"),
      { name: ".env", type: "File", desc: "Environment variables for API keys" },
    ],
  },
  Quickstart: {
    id: "Quickstart",
    label: "Quickstart",
    navGroup: "GETTING STARTED",
    description:
      "Get an AI agent running in under 60 seconds. No configuration needed — just pick a command and go. All modes are available from the interactive menu.",
    codeLines: [
      { tone: "comment", text: "# Launch the interactive menu" },
      { tone: "default", text: "aegis wakeup" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Or run a command directly" },
      { tone: "default", text: "aegis ask \"How does the agent system work?\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start the Telegram bot for mobile access" },
      { tone: "default", text: "aegis telegram" },
    ],
    tableRows: [
      row("wakeup", "Interactive mode picker"),
      row("chat", "Interactive AI chat session"),
      row("ask", "Ask read-only questions"),
      row("plan", "Generate implementation plans"),
    ],
  },
  "Your first agent": {
    id: "Your first agent",
    label: "Your first agent",
    navGroup: "GETTING STARTED",
    description:
      "Spawn your first autonomous agent with a single command. The agent explores code, runs tools, and reports back — all with full audit trail and approval flow.",
    codeLines: [
      { tone: "comment", text: "# Spawn an ask agent to research your codebase" },
      { tone: "default", text: "aegis ask \"Explain the memory system\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run a plan agent to generate a feature spec" },
      { tone: "default", text: "aegis plan \"Add dark mode to dashboard\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Use agent-run for full approval flow" },
      { tone: "default", text: "aegis agent-run \"Refactor auth module\"" },
    ],
    tableRows: [
      row("ask", "Read-only research agent"),
      row("plan", "Structured plan generation"),
      row("agent-run", "Full approval-based execution"),
      row("session", "Inspect and replay sessions"),
    ],
  },
  Configuration: {
    id: "Configuration",
    label: "Configuration",
    navGroup: "GETTING STARTED",
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
      row("setup", "Interactive configuration wizard"),
      row("setup-keys", "API key configuration"),
      row("config", "View and set config values"),
      row("doctor", "Diagnose your setup"),
      { name: ".env", type: "File", desc: "Environment variable overrides" },
    ],
  },
  "Agent system": {
    id: "Agent system",
    label: "Agent system",
    navGroup: "AGENTS",
    description:
      "Neuron OS ships with a rich agent system. The `agent` command family manages agent lifecycle, while specialized commands like `plan`, `orchestrate`, and `research` compose multi-agent workflows.",
    codeLines: [
      { tone: "comment", text: "# List all available agent types" },
      { tone: "default", text: "aegis agent types" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Spawn a build agent" },
      { tone: "default", text: "aegis agent spawn build --name builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run a reflect agent to review a session" },
      { tone: "default", text: "aegis reflect session-abc123" },
    ],
    tableRows: [
      row("agent types", "List all available agent types"),
      row("agent spawn", "Start a new agent process"),
      row("agent list", "List all spawned agents"),
      row("agent kill", "Stop a running agent"),
      row("agent inspect", "Show detailed agent info"),
      row("reflect", "Reflect on a session and suggest next steps"),
    ],
  },
  "Spawn & supervise": {
    id: "Spawn & supervise",
    label: "Spawn & supervise",
    navGroup: "AGENTS",
    description:
      "Agents run in isolated sandboxes with scoped tools. Spawn multiple agents, supervise their execution, and view a live dashboard of all running agents and their logs.",
    codeLines: [
      { tone: "comment", text: "# Spawn an agent with a specific type" },
      { tone: "default", text: "aegis agent spawn build --name builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View all running agents" },
      { tone: "default", text: "aegis agent list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Kill an agent by name" },
      { tone: "default", text: "aegis agent kill builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Spawn and supervise a long-running goal" },
      { tone: "default", text: "aegis supervise \"Index the entire docs site\"" },
    ],
    tableRows: [
      row("agent spawn", "Start a new agent"),
      row("agent list", "List running agents"),
      row("agent kill", "Stop a running agent"),
      row("agent logs", "Stream agent log output"),
      row("supervise", "Spawn and supervise an agent"),
      { name: "aegis dashboard", type: "Mode", desc: "Live agent monitoring TUI" },
    ],
  },
  Orchestration: {
    id: "Orchestration",
    label: "Orchestration",
    navGroup: "AGENTS",
    description:
      "Compose multiple agents to solve complex goals. Orchestrate parallel work, run research loops with safety ratchets, or break a task into a step-by-step plan.",
    codeLines: [
      { tone: "comment", text: "# Generate a plan" },
      { tone: "default", text: "aegis plan \"Add rate limiting to /api/v1\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run multiple agents in parallel" },
      { tone: "default", text: "aegis orchestrate \"Migrate all cron jobs\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Autonomous research loop with ratchet" },
      { tone: "default", text: "aegis research \"Find all security issues in src/api\"" },
    ],
    tableRows: [
      row("plan", "Generate a step-by-step plan"),
      row("orchestrate", "Decompose and execute in parallel"),
      row("mesh", "Coordinate multi-agent swarms"),
      row("research", "Autonomous research with ratchet"),
      row("pool", "Manage the agent execution pool"),
      row("ask", "Ask a read-only question"),
    ],
  },
  "Reflection loop": {
    id: "Reflection loop",
    label: "Reflection loop",
    navGroup: "AGENTS",
    description:
      "Agents can reflect on their own output, review their work, and improve it iteratively. Use `reflect` after a session to score progress and suggest next steps.",
    codeLines: [
      { tone: "comment", text: "# Reflect on a completed session" },
      { tone: "default", text: "aegis reflect session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show session log" },
      { tone: "default", text: "aegis session show session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Spawn and supervise an agent that self-corrects" },
      { tone: "default", text: "aegis supervise \"Refactor auth module\"" },
    ],
    tableRows: [
      row("reflect", "Score progress and suggest next steps"),
      row("supervise", "Spawn and supervise an agent"),
      row("session show", "Inspect a saved session"),
      row("agent inspect", "Show agent metadata"),
    ],
  },
  "Memory store": {
    id: "Memory store",
    label: "Memory store",
    navGroup: "MEMORY & SESSIONS",
    description:
      "Semantic search across all your conversations, code, and facts. Uses TF-IDF indexing with cosine similarity. Query with natural language and get ranked results with relevance scores.",
    codeLines: [
      { tone: "comment", text: "# Search memory semantically" },
      { tone: "default", text: "aegis memory search \"deployment configuration\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Add a note to memory" },
      { tone: "default", text: "aegis memory add \"The API uses port 8080\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Browse facts extracted from conversations" },
      { tone: "default", text: "aegis memory facts" },
    ],
    tableRows: [
      row("memory search", "Search memory and logs"),
      row("memory add", "Add an entry to long-term memory"),
      row("memory show", "Show current MEMORY.md"),
      row("memory facts", "Show extracted facts"),
      row("memory vector", "Show vector store stats"),
      row("agentmemory search", "Semantic search across agentmemory"),
    ],
  },
  "Session replay": {
    id: "Session replay",
    label: "Session replay",
    navGroup: "MEMORY & SESSIONS",
    description:
      "Every interaction is recorded in a session log. Inspect sessions, export them for sharing, and project-manage isolated workspaces.",
    codeLines: [
      { tone: "comment", text: "# List recent sessions" },
      { tone: "default", text: "aegis session list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show a session's events" },
      { tone: "default", text: "aegis session show session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Export a session" },
      { tone: "default", text: "aegis session export session-abc123" },
    ],
    tableRows: [
      row("session list", "List all saved sessions"),
      row("session show", "Show events from a session"),
      row("session export", "Export session data"),
      row("session delete", "Delete a session"),
      row("project", "Manage project workspaces"),
    ],
  },
  "Audit log": {
    id: "Audit log",
    label: "Audit log",
    navGroup: "MEMORY & SESSIONS",
    description:
      "The audit log records every action an agent takes — every file read, write, shell command, and tool call. Full provenance tracking with timestamps and agent attribution.",
    codeLines: [
      { tone: "comment", text: "# View the audit trail" },
      { tone: "default", text: "aegis audit list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Filter by agent" },
      { tone: "default", text: "aegis audit list --agent builder-01" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Check policy compliance" },
      { tone: "default", text: "aegis audit check" },
    ],
    tableRows: [
      row("audit list", "View audit log entries"),
      row("audit check", "Check policy compliance"),
      row("audit export", "Export audit trail"),
      row("audit policy", "Manage audit policies"),
    ],
  },
  "MCP server": {
    id: "MCP server",
    label: "MCP server",
    navGroup: "INTEGRATIONS",
    description:
      "Model Context Protocol (MCP) support allows Neuron OS to connect with any MCP-compatible client (Claude Code, Cursor, VS Code) and expose its tools and agents as MCP resources.",
    codeLines: [
      { tone: "comment", text: "# Start the MCP server" },
      { tone: "default", text: "aegis mcp serve" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Connect to external MCP servers" },
      { tone: "default", text: "aegis mcp connect" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List configured MCP servers" },
      { tone: "default", text: "aegis mcp list" },
    ],
    tableRows: [
      row("mcp serve", "Expose Neuron OS as MCP server"),
      row("mcp connect", "Connect to external MCP servers"),
      row("mcp list", "List configured MCP servers"),
    ],
  },
  "CLI reference": {
    id: "CLI reference",
    label: "CLI reference",
    navGroup: "INTEGRATIONS",
    description:
      "Full CLI reference for all commands and modes. Run any command with --help for detailed usage, or use the interactive wakeup menu to discover available options.",
    codeLines: [
      { tone: "comment", text: "# Interactive menu" },
      { tone: "default", text: "aegis wakeup" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Help for any command" },
      { tone: "default", text: "aegis chat --help" },
      { tone: "default", text: "aegis agent spawn --help" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# System status" },
      { tone: "default", text: "aegis status" },
      { tone: "default", text: "aegis doctor" },
    ],
    tableRows: [
      row("wakeup", "Interactive command picker"),
      row("chat", "Interactive AI chat"),
      row("serve", "HTTP API server"),
      row("telegram", "Telegram bot"),
      row("status", "System status dashboard"),
    ],
  },
  Webhooks: {
    id: "Webhooks",
    label: "Webhooks",
    navGroup: "INTEGRATIONS",
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
      { tone: "default", text: 'curl -X POST http://localhost:8080/api/v1/webhook/generic \\' },
      { tone: "default", text: '  -H "Content-Type: application/json" \\' },
      { tone: "default", text: '  -d \'{"event":"deploy","payload":{}}\'' },
    ],
    tableRows: [
      row("webhook", "Start webhook server"),
      { name: "POST /api/v1/webhook/github", type: "Endpoint", desc: "GitHub push/PR events" },
      { name: "POST /api/v1/webhook/generic", type: "Endpoint", desc: "Generic HTTP webhooks" },
      { name: "HMAC", type: "Security", desc: "Signature verification" },
    ],
  },
  API: {
    id: "API",
    label: "API",
    navGroup: "INTEGRATIONS",
    description:
      "RESTful API with WebSocket support for real-time agent monitoring. All agent operations are available via the API. Secure with API key authentication and rate limiting.",
    codeLines: [
      { tone: "comment", text: "# Start the API server" },
      { tone: "default", text: "aegis serve --port 8080 --key your-api-key" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Query endpoints" },
      { tone: "default", text: "curl http://localhost:8080/api/v1/health" },
      { tone: "default", text: 'curl -H "X-API-Key: your-key" http://localhost:8080/api/v1/agents' },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# WebSocket for real-time events" },
      { tone: "default", text: "ws://localhost:8080/api/v1/ws" },
    ],
    tableRows: [
      row("serve", "Start REST API server"),
      { name: "GET /health", type: "Endpoint", desc: "Health check" },
      { name: "GET /agents", type: "Endpoint", desc: "List running agents" },
      { name: "POST /agents", type: "Endpoint", desc: "Spawn a new agent" },
      { name: "WS /ws", type: "Endpoint", desc: "Real-time event stream" },
    ],
  },
}

export const defaultTopic: DocTopic = {
  id: "default",
  label: "Documentation",
  navGroup: "",
  description:
    "Select a topic from the sidebar to view its documentation. Each section includes usage examples, command references, and detailed explanations.",
  codeLines: [
    { tone: "comment", text: "# Browse available docs" },
    { tone: "default", text: "aegis wakeup" },
    { tone: "blank", text: "" },
    { tone: "comment", text: "# Read specific help" },
    { tone: "default", text: "aegis <command> --help" },
    { tone: "blank", text: "" },
    { tone: "comment", text: "# Launch the interactive menu" },
    { tone: "default", text: "aegis wakeup" },
  ],
  tableRows: [
    row("wakeup", "Interactive mode picker"),
    row("status", "Quick system status"),
    row("doctor", "System diagnostics"),
  ],
}
