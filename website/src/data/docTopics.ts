// ── Website docs topics ──────────────────────────────────────────────
// Comprehensive documentation for all Neuron OS / Aegis CLI commands
// and features. Each topic maps to a sidebar nav item and renders
// terminal code blocks + reference tables.

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
    items: ["Installation", "Quickstart", "Configuration"],
  },
  {
    label: "AGENTS",
    items: ["Agent system", "Spawn & supervise", "Orchestration", "Reflection loop", "Adversarial self-play", "Debate topology"],
  },
  {
    label: "MEMORY & SESSIONS",
    items: ["Memory store", "Session replay", "Audit log", "Memory ACL"],
  },
  {
    label: "COMMANDS",
    items: ["Toolsets", "CI auto-fix", "Economy & pricing", "Benchmarks", "Insights", "Cost tracking"],
  },
  {
    label: "INTEGRATIONS",
    items: ["MCP server", "Webhooks", "REST API", "Skills & plugins", "Voice mode", "Chat adapters"],
  },
  {
    label: "CLI REFERENCE",
    items: ["Full command list", "Diagnostics"],
  },
]

export const docTopics: Record<string, DocTopic> = {
  // ── GETTING STARTED ──────────────────────────────────────────────────

  Installation: {
    id: "Installation",
    label: "Installation",
    navGroup: "GETTING STARTED",
    description:
      "Install Aegis in seconds. Works on macOS, Linux, and Windows via Bun. No Docker required for basic usage — just Bun and a terminal.",
    codeLines: [
      { tone: "comment", text: "# Install Bun (if you don't have it)" },
      { tone: "default", text: "curl -fsSL https://bun.sh/install | bash" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Clone and install Aegis" },
      { tone: "default", text: "git clone https://github.com/KunjShah95/neuron-os.git" },
      { tone: "default", text: "cd neuron-os" },
      { tone: "default", text: "bun install" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Set your API key and verify" },
      { tone: "default", text: "echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> .env" },
      { tone: "default", text: "bun run index.ts doctor" },
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
      { tone: "comment", text: "# Ask a read-only question" },
      { tone: "default", text: "aegis ask \"How does the agent system work?\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start interactive chat" },
      { tone: "default", text: "aegis chat" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Generate a plan" },
      { tone: "default", text: "aegis plan \"Add rate limiting to API\"" },
    ],
    tableRows: [
      row("wakeup", "Interactive mode picker"),
      row("chat", "Interactive AI chat session"),
      row("ask", "Ask read-only questions"),
      row("plan", "Generate implementation plans"),
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
      { tone: "comment", text: "# Configure via CLI" },
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

  // ── AGENTS ───────────────────────────────────────────────────────────

  "Agent system": {
    id: "Agent system",
    label: "Agent system",
    navGroup: "AGENTS",
    description:
      "Aegis ships with 14+ agent types. The `agent` command family manages agent lifecycle — spawn, list, inspect, kill and configure agents. Specialized commands like `plan`, `orchestrate`, and `research` compose multi-agent workflows.",
    codeLines: [
      { tone: "comment", text: "# List all available agent types" },
      { tone: "default", text: "aegis agent types" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Spawn a build agent" },
      { tone: "default", text: "aegis agent spawn builder --type build" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List all running agents" },
      { tone: "default", text: "aegis agent list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Inspect an agent" },
      { tone: "default", text: "aegis agent inspect builder" },
    ],
    tableRows: [
      row("agent types", "List all available agent types"),
      row("agent spawn", "Start a new agent process"),
      row("agent list", "List all spawned agents"),
      row("agent kill", "Stop a running agent"),
      row("agent inspect", "Show detailed agent info"),
      row("agent logs", "Stream agent log output"),
    ],
  },

  "Spawn & supervise": {
    id: "Spawn & supervise",
    label: "Spawn & supervise",
    navGroup: "AGENTS",
    description:
      "Agents run in isolated sandboxes with scoped tools and configurable recovery policies. Spawn multiple agents, supervise them with auto-restart, and view live status via the dashboard.",
    codeLines: [
      { tone: "comment", text: "# Spawn an agent with retry policy" },
      { tone: "default", text: "aegis agent spawn builder --type build --retries 3" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Supervise a long-running goal" },
      { tone: "default", text: "aegis supervise \"Refactor the auth module\" --max-restarts 5" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Submit a task to the pool" },
      { tone: "default", text: "aegis pool submit \"Fix all lint errors\" --priority high" },
    ],
    tableRows: [
      row("agent spawn", "Start a new agent"),
      row("agent list", "List running agents"),
      row("agent kill", "Stop a running agent"),
      row("agent logs", "Stream agent log output"),
      row("supervise", "Spawn and supervise an agent with auto-restart"),
      row("pool submit", "Submit a task to the execution pool"),
      row("pool status", "Check task status"),
    ],
  },

  Orchestration: {
    id: "Orchestration",
    label: "Orchestration",
    navGroup: "AGENTS",
    description:
      "Compose multiple agents to solve complex goals. Orchestrate parallel work with the mesh system, run autonomous research loops with safety ratchets, or break a task into step-by-step plans.",
    codeLines: [
      { tone: "comment", text: "# Generate a plan" },
      { tone: "default", text: "aegis plan \"Add rate limiting to /api/v1\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run multiple agents in parallel (mesh)" },
      { tone: "default", text: "aegis mesh run \"Migrate all cron jobs\" --agents 3" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Autonomous research loop with ratchet" },
      { tone: "default", text: "aegis research \"Find security issues in src/api\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Decompose and execute in parallel" },
      { tone: "default", text: "aegis orchestrate \"Set up CI/CD pipeline\"" },
    ],
    tableRows: [
      row("plan", "Generate a step-by-step plan"),
      row("orchestrate", "Decompose and execute in parallel"),
      row("mesh run", "Coordinate multi-agent swarms"),
      row("mesh list", "List running meshes"),
      row("mesh cancel", "Cancel a running mesh"),
      row("research", "Autonomous research with ratchet"),
      row("pool", "Manage the agent execution pool"),
    ],
  },

  "Reflection loop": {
    id: "Reflection loop",
    label: "Reflection loop",
    navGroup: "AGENTS",
    description:
      "Agents can reflect on their own output, review work, and improve iteratively. Use `reflect` after a session to score progress and suggest next steps. The ratification system can validate changes by running automated checks.",
    codeLines: [
      { tone: "comment", text: "# Reflect on a completed session" },
      { tone: "default", text: "aegis reflect session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run agent with git ratchet (revert on regression)" },
      { tone: "default", text: "aegis agent-run \"Fix all type errors\" --ratchet" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Evaluate with custom metrics" },
      { tone: "default", text: "aegis agent-run \"Optimize bundle\" --eval typecheck,tests-pass,lint-clean" },
    ],
    tableRows: [
      row("reflect", "Score progress and suggest next steps"),
      row("agent-run", "Full approval-based execution with ratchet"),
      { name: "--ratchet", type: "Flag", desc: "Git ratchet — revert agent changes on regression" },
      { name: "--eval", type: "Flag", desc: "Comma-separated eval metrics" },
    ],
  },

  "Adversarial self-play": {
    id: "Adversarial self-play",
    label: "Adversarial self-play",
    navGroup: "AGENTS",
    description:
      "Adversarial self-play pits a red-team agent against your system to find vulnerabilities, edge cases, and failure modes. Findings are stored in a registry, ranked by severity, and regressions are tracked over time.",
    codeLines: [
      { tone: "comment", text: "# Enable adversarial self-play" },
      { tone: "default", text: "aegis adversarial enable" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List recent findings" },
      { tone: "default", text: "aegis adversarial findings --severity high" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show status summary" },
      { tone: "default", text: "aegis adversarial status" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Manage ratcheted regression cases" },
      { tone: "default", text: "aegis adversarial ratchet" },
    ],
    tableRows: [
      row("adversarial enable", "Enable adversarial self-play"),
      row("adversarial disable", "Disable adversarial self-play"),
      row("adversarial findings", "List findings (filterable by severity, task, recency)"),
      row("adversarial status", "Show recent findings summary"),
      row("adversarial ratchet", "Manage ratcheted regression cases"),
    ],
  },

  "Debate topology": {
    id: "Debate topology",
    label: "Debate topology",
    navGroup: "AGENTS",
    description:
      "The debate system allows multiple agents to argue opposing positions. When agents disagree, an arbitrator (agent, human, or majority vote) resolves the conflict. All decisions are cryptographically signed and stored for audit.",
    codeLines: [
      { tone: "comment", text: "# List debate decisions" },
      { tone: "default", text: "aegis debate list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View a specific decision" },
      { tone: "default", text: "aegis debate show <decision-id>" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run with agent arbitrator" },
      { tone: "default", text: "aegis debate resolve --arbitrator agent" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run with human arbitrator" },
      { tone: "default", text: "aegis debate resolve --arbitrator human" },
    ],
    tableRows: [
      row("debate list", "List all signed debate decisions"),
      { name: "aegis debate show", type: "Command", desc: "View a specific decision record" },
      { name: "aegis debate resolve", type: "Command", desc: "Resolve a disagreement with an arbitrator" },
      { name: "--arbitrator", type: "Flag", desc: "Arbitrator strategy: agent, human, or majority" },
    ],
  },

  // ── MEMORY & SESSIONS ────────────────────────────────────────────────

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
      { tone: "comment", text: "# Browse extracted facts" },
      { tone: "default", text: "aegis memory facts --category project" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show vector store stats" },
      { tone: "default", text: "aegis memory vector" },
    ],
    tableRows: [
      row("memory search", "Search memory and logs"),
      row("memory add", "Add an entry to long-term memory"),
      row("memory show", "Show current MEMORY.md"),
      row("memory facts", "Show extracted facts"),
      row("memory stats", "Show memory system statistics"),
      row("memory vector", "Show vector store stats"),
    ],
  },

  "Session replay": {
    id: "Session replay",
    label: "Session replay",
    navGroup: "MEMORY & SESSIONS",
    description:
      "Every interaction is recorded in a session log. Inspect sessions, export them for sharing, search across all messages, and manage project-isolated workspaces.",
    codeLines: [
      { tone: "comment", text: "# List recent sessions" },
      { tone: "default", text: "aegis session list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View a session's messages" },
      { tone: "default", text: "aegis session view session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Search across all sessions" },
      { tone: "default", text: "aegis session search \"authentication\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Export a session" },
      { tone: "default", text: "aegis session export session-abc123" },
    ],
    tableRows: [
      row("session list", "List all saved sessions"),
      row("session view", "Show session details and messages"),
      row("session search", "Search messages across all sessions"),
      row("session export", "Export session data"),
      row("session delete", "Delete a session"),
      row("session resume", "Resume a paused session"),
      row("session prune", "Delete old sessions"),
    ],
  },

  "Audit log": {
    id: "Audit log",
    label: "Audit log",
    navGroup: "MEMORY & SESSIONS",
    description:
      "The audit log records every action an agent takes — every file read, write, shell command, and tool call. Full provenance tracking with timestamps and agent attribution. Replay sessions step-by-step from the audit trail.",
    codeLines: [
      { tone: "comment", text: "# View recent audit entries" },
      { tone: "default", text: "aegis audit recent --limit 20" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Replay a session step by step" },
      { tone: "default", text: "aegis audit replay session-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show audit statistics" },
      { tone: "default", text: "aegis audit stats" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show timeline of a session" },
      { tone: "default", text: "aegis audit timeline session-abc123" },
    ],
    tableRows: [
      row("audit recent", "View recent audit log entries"),
      row("audit replay", "Step-by-step session replay from audit log"),
      row("audit stats", "Audit store statistics"),
      row("audit timeline", "Compact timeline of a session"),
      row("audit policy", "List registered audit policies"),
    ],
  },

  "Memory ACL": {
    id: "Memory ACL",
    label: "Memory ACL",
    navGroup: "MEMORY & SESSIONS",
    description:
      "Access control lists for memory namespaces. Define allow/deny rules with path globs, tool filters, and expiry. Default-deny with owner bypass. All access attempts are audited to an append-only JSONL log.",
    codeLines: [
      { tone: "comment", text: "# Grant cross-team memory access" },
      { tone: "default", text: "aegis memory policy grant research-team read --namespace project-alpha" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List active grants" },
      { tone: "default", text: "aegis memory policy list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Revoke a grant" },
      { tone: "default", text: "aegis memory policy revoke grant-abc123" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Define a deny rule" },
      { tone: "default", text: "aegis memory policy deny --namespace secrets --tool read" },
    ],
    tableRows: [
      { name: "aegis memory policy grant", type: "Command", desc: "Grant access to a memory namespace" },
      { name: "aegis memory policy revoke", type: "Command", desc: "Revoke a grant by ID" },
      { name: "aegis memory policy list", type: "Command", desc: "List all active grants" },
      { name: "aegis memory policy deny", type: "Command", desc: "Add a deny rule to a namespace" },
      { name: "--namespace", type: "Flag", desc: "Memory namespace to scope the rule" },
      { name: "--expires-in", type: "Flag", desc: "TTL for grant (e.g. 24h, 7d)" },
    ],
  },

  // ── COMMANDS ─────────────────────────────────────────────────────────

  Toolsets: {
    id: "Toolsets",
    label: "Toolsets",
    navGroup: "COMMANDS",
    description:
      "Composable tool groups that bundle related capabilities. Define toolsets in YAML with includes and tool references, then assign them to agents for scoped permissions. Ships with 10 bundled toolsets including read-only, code execution, git, and Docker.",
    codeLines: [
      { tone: "comment", text: "# List all available toolsets" },
      { tone: "default", text: "aegis toolset list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show toolset definition" },
      { tone: "default", text: "aegis toolset show code-execution" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Create a custom toolset" },
      { tone: "default", text: "aegis toolset new my-tools --tools read,write,bash" },
    ],
    tableRows: [
      row("toolset list", "List all available toolsets"),
      row("toolset show", "Show details for a specific toolset"),
      row("toolset new", "Create a new custom toolset"),
      { name: "execute-code", type: "Tool", desc: "Run code in Bun subprocess (sandboxed)" },
    ],
  },

  "CI auto-fix": {
    id: "CI auto-fix",
    label: "CI auto-fix",
    navGroup: "COMMANDS",
    description:
      "The auto-fix CI system watches for CI failures and autonomously fixes them. It investigates the root cause, creates a PR with the fix, and auto-merges when validation passes. Uses HMAC-verified webhooks for secure GitHub integration.",
    codeLines: [
      { tone: "comment", text: "# Start the CI webhook server" },
      { tone: "default", text: "aegis ci watch --secret your-hmac-secret --github-token ghp_..." },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show CI configuration" },
      { tone: "default", text: "aegis ci status" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# All flags for full control" },
      { tone: "default", text: "aegis ci watch --secret <secret> --github-token <token>" },
      { tone: "default", text: "  --no-review       # Disable auto PR review" },
      { tone: "default", text: "  --no-fix          # Disable auto fix on push" },
    ],
    tableRows: [
      { name: "aegis ci watch", type: "Command", desc: "Start CI webhook server (HMAC-verified)" },
      { name: "aegis ci status", type: "Command", desc: "Show CI configuration and status" },
      { name: "--secret", type: "Flag", desc: "HMAC secret for webhook verification" },
      { name: "--github-token", type: "Flag", desc: "GitHub token for creating PRs" },
      { name: "config", type: "File", desc: "~/.aegis/ci.yaml — per-repo CI config" },
    ],
  },

  "Economy & pricing": {
    id: "Economy & pricing",
    label: "Economy & pricing",
    navGroup: "COMMANDS",
    description:
      "The tool-level economy system tracks cost per tool and routes tasks to the cheapest capable model. Set budgets, get dry-run estimates, and run leaderboards to compare provider price/quality tradeoffs.",
    codeLines: [
      { tone: "comment", text: "# Show pricing for all tools and models" },
      { tone: "default", text: "aegis pricing list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run a cost leaderboard" },
      { tone: "default", text: "aegis pricing leaderboard --threshold 0.05" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Benchmark model cost/quality" },
      { tone: "default", text: "aegis bench run --budget 0.10" },
    ],
    tableRows: [
      { name: "aegis pricing list", type: "Command", desc: "Show tool pricing table" },
      { name: "aegis pricing leaderboard", type: "Command", desc: "Run leaderboard comparing cost vs quality" },
      { name: "aegis pricing set", type: "Command", desc: "Set a custom tool price" },
      { name: "BudgetGuard", type: "System", desc: "In-loop budget enforcement (continue/skip/abort)" },
    ],
  },

  Benchmarks: {
    id: "Benchmarks",
    label: "Benchmarks",
    navGroup: "COMMANDS",
    description:
      "The benchmark suite evaluates agent performance across tasks. Run evals, compare results against baselines, track regressions over time, and export reports for CI consumption.",
    codeLines: [
      { tone: "comment", text: "# Run all benchmark tasks" },
      { tone: "default", text: "aegis benchmark run" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Run with baseline comparison" },
      { tone: "default", text: "aegis benchmark run --update-baseline" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Show current baseline status" },
      { tone: "default", text: "aegis benchmark status" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# View baseline scores by category" },
      { tone: "default", text: "aegis benchmark baseline" },
    ],
    tableRows: [
      { name: "aegis benchmark run", type: "Command", desc: "Run eval tasks with baseline comparison" },
      { name: "aegis benchmark status", type: "Command", desc: "Show last benchmark run and drift" },
      { name: "aegis benchmark baseline", type: "Command", desc: "Show/inspect current baseline scores" },
      { name: "--category", type: "Flag", desc: "Filter by category (coding, debugging, etc.)" },
      { name: "--threshold", type: "Flag", desc: "Fail if regression > X% (default: 10%)" },
      { name: "--json", type: "Flag", desc: "JSON output for CI consumption" },
    ],
  },

  Insights: {
    id: "Insights",
    label: "Insights",
    navGroup: "COMMANDS",
    description:
      "Cross-database intelligence that joins audit logs, billing, experience buffer, and telemetry. Get a unified view of system health, session costs, agent performance heatmaps, and failure root-cause analysis.",
    codeLines: [
      { tone: "comment", text: "# Show system-wide summary" },
      { tone: "default", text: "aegis insights summary" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Session report across all stores" },
      { tone: "default", text: "aegis insights sessions --limit 20" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Agent performance heatmap" },
      { tone: "default", text: "aegis insights agents" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Failure root cause analysis" },
      { tone: "default", text: "aegis insights failures" },
    ],
    tableRows: [
      { name: "aegis insights summary", type: "Command", desc: "High-level status across all databases" },
      { name: "aegis insights sessions", type: "Command", desc: "Unified session report" },
      { name: "aegis insights agents", type: "Command", desc: "Agent performance heatmap" },
      { name: "aegis insights failures", type: "Command", desc: "Root cause failure analysis" },
      { name: "aegis insights costs", type: "Command", desc: "Cost vs outcome analysis" },
      { name: "aegis insights timeline", type: "Command", desc: "Activity timeline across stores" },
      { name: "aegis insights export", type: "Command", desc: "Export unified data as JSON" },
    ],
  },

  "Cost tracking": {
    id: "Cost tracking",
    label: "Cost tracking",
    navGroup: "COMMANDS",
    description:
      "Track and manage AI spending across all sessions, models, and agents. Set budgets, view daily cost history, and generate attribution reports to understand where your budget goes.",
    codeLines: [
      { tone: "comment", text: "# Show total spend vs budget" },
      { tone: "default", text: "aegis cost total" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Cost breakdown by model" },
      { tone: "default", text: "aegis cost models" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Daily cost history" },
      { tone: "default", text: "aegis cost history --days 14" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Set a budget limit" },
      { tone: "default", text: "aegis cost budget 2.50" },
    ],
    tableRows: [
      { name: "aegis cost total", type: "Command", desc: "Show total spend vs budget" },
      { name: "aegis cost models", type: "Command", desc: "Cost breakdown by model" },
      { name: "aegis cost sessions", type: "Command", desc: "Cost by session" },
      { name: "aegis cost history", type: "Command", desc: "Daily cost history" },
      { name: "aegis cost budget", type: "Command", desc: "View or set budget limit" },
      { name: "aegis cost report", type: "Command", desc: "Full cost attribution report" },
    ],
  },

  // ── INTEGRATIONS ─────────────────────────────────────────────────────

  "MCP server": {
    id: "MCP server",
    label: "MCP server",
    navGroup: "INTEGRATIONS",
    description:
      "Model Context Protocol (MCP) support allows Aegis to connect with any MCP-compatible client (Claude Code, Cursor, VS Code) and expose its tools and agents as MCP resources. Supports HTTP and stdio transport.",
    codeLines: [
      { tone: "comment", text: "# Start the MCP server over HTTP" },
      { tone: "default", text: "aegis mcp serve --port 3100" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start with stdio transport" },
      { tone: "default", text: "aegis mcp serve --stdio" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Connect to external MCP servers" },
      { tone: "default", text: "aegis mcp connect" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List configured servers" },
      { tone: "default", text: "aegis mcp list" },
    ],
    tableRows: [
      row("mcp serve", "Expose Aegis as MCP server (HTTP/stdio)"),
      row("mcp connect", "Connect to external MCP servers"),
      row("mcp list", "List configured MCP servers and registered tools"),
    ],
  },

  Webhooks: {
    id: "Webhooks",
    label: "Webhooks",
    navGroup: "INTEGRATIONS",
    description:
      "Webhook support enables external services to trigger agents and receive events. Configure webhooks for GitHub pushes, pull requests, or any HTTP POST request with HMAC verification. The auto-fix CI system uses this to watch for failures.",
    codeLines: [
      { tone: "comment", text: "# Start the webhook server" },
      { tone: "default", text: "aegis webhook --secret your-hmac-secret" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Enable auto CI fix on push" },
      { tone: "default", text: "aegis webhook --secret <secret> --github-token ghp_..." },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Endpoints:" },
      { tone: "default", text: "#   POST /api/v1/webhook/github  — GitHub push/PR events" },
      { tone: "default", text: "#   POST /api/v1/webhook/generic — Generic JSON webhooks" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Test the webhook" },
      { tone: "default", text: "curl -X POST http://localhost:9090/api/v1/webhook/generic \\" },
      { tone: "default", text: "  -H \"Content-Type: application/json\" \\" },
      { tone: "default", text: "  -d '{\"event\":\"deploy\",\"payload\":{}}'" },
    ],
    tableRows: [
      row("webhook", "Start webhook server with HMAC verification"),
      { name: "POST /api/v1/webhook/github", type: "Endpoint", desc: "GitHub push/PR events" },
      { name: "POST /api/v1/webhook/generic", type: "Endpoint", desc: "Generic JSON webhooks" },
      { name: "HMAC", type: "Security", desc: "Signature verification" },
      { name: "--secret", type: "Flag", desc: "Webhook secret for payload verification" },
      { name: "--github-token", type: "Flag", desc: "GitHub token for PR comments and auto-fix" },
    ],
  },

  "REST API": {
    id: "REST API",
    label: "REST API",
    navGroup: "INTEGRATIONS",
    description:
      "RESTful API with WebSocket support for real-time agent monitoring. All agent operations are available via the API — spawn, list, inspect, and kill agents, plus session management and webhook endpoints. Secure with API key authentication.",
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
      row("serve", "Start REST API server"),
      { name: "GET /health", type: "Endpoint", desc: "Health check" },
      { name: "GET /agents", type: "Endpoint", desc: "List running agents" },
      { name: "POST /agents", type: "Endpoint", desc: "Spawn a new agent" },
      { name: "DELETE /agents/:id", type: "Endpoint", desc: "Kill an agent" },
      { name: "WS /ws", type: "Endpoint", desc: "Real-time event stream" },
    ],
  },

  "Skills & plugins": {
    id: "Skills & plugins",
    label: "Skills & plugins",
    navGroup: "INTEGRATIONS",
    description:
      "The plugin system allows packaging skills as plugins and publishing them to a local registry. Browse the marketplace, install skills, create your own, and retire underperforming ones. Skills can be published to agentskills.io for the community.",
    codeLines: [
      { tone: "comment", text: "# Browse the skills marketplace" },
      { tone: "default", text: "aegis skills browse" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Search for a skill" },
      { tone: "default", text: "aegis skills search \"code review\"" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Install a skill" },
      { tone: "default", text: "aegis skills install review-toolkit" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Publish a plugin to the local registry" },
      { tone: "default", text: "aegis plugin publish ./skills/my-skill" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# List installed plugins" },
      { tone: "default", text: "aegis plugin list" },
    ],
    tableRows: [
      row("skills browse", "Browse trending skills"),
      row("skills search", "Search the skills marketplace"),
      row("skills install", "Install a skill"),
      row("skills list", "List installed skills"),
      row("skills evolution", "Self-evolving skills loop"),
      { name: "aegis plugin publish", type: "Command", desc: "Package a skill into the local registry" },
      { name: "aegis plugin install", type: "Command", desc: "Install a plugin from local registry" },
      { name: "aegis plugin list", type: "Command", desc: "List plugins in the local registry" },
      { name: "aegis plugin remove", type: "Command", desc: "Remove a plugin from registry" },
    ],
  },

  "Voice mode": {
    id: "Voice mode",
    label: "Voice mode",
    navGroup: "INTEGRATIONS",
    description:
      "Voice-interactive agent mode with local STT/TTS. Speak or type to your agent, get spoken responses. Supports local whisper.cpp for speech recognition and local TTS engines. Falls back to text input if voice providers are unavailable.",
    codeLines: [
      { tone: "comment", text: "# Start voice-interactive mode from CLI" },
      { tone: "default", text: "aegis voice-local" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Or select Voice Mode from the menu" },
      { tone: "default", text: "aegis wakeup" },
      { tone: "comment", text: "# → Select \"Voice Mode\" from the list" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Use the Twilio voice call adapter" },
      { tone: "default", text: "aegis voice --account-sid <sid> --auth-token <token>" },
    ],
    tableRows: [
      { name: "aegis voice-local", type: "Command", desc: "Interactive local voice mode (STT/TTS)" },
      row("voice", "Start Twilio voice call adapter"),
      { name: "Voice Mode", type: "Mode", desc: "Menu option from aegis wakeup" },
      { name: "STT", type: "Provider", desc: "Speech-to-text (local whisper)" },
      { name: "TTS", type: "Provider", desc: "Text-to-speech (local engine)" },
    ],
  },

  "Chat adapters": {
    id: "Chat adapters",
    label: "Chat adapters",
    navGroup: "INTEGRATIONS",
    description:
      "Connect your agents to multiple chat platforms. Telegram, Discord, Slack, SMS (Twilio), WhatsApp (Twilio), Email (SMTP) — each adapter runs as a standalone process that bridges messages to the agent orchestrator.",
    codeLines: [
      { tone: "comment", text: "# Start a Telegram bot" },
      { tone: "default", text: "aegis telegram --token YOUR_BOT_TOKEN" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start a Discord bot" },
      { tone: "default", text: "aegis discord --token YOUR_DISCORD_TOKEN" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start Slack bot (Socket Mode)" },
      { tone: "default", text: "aegis slack --token <token> --app-token <token>" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Start Twilio SMS adapter" },
      { tone: "default", text: "aegis sms --account-sid <sid> --auth-token <token>" },
    ],
    tableRows: [
      row("telegram", "Start Telegram bot adapter"),
      row("discord", "Start Discord bot adapter"),
      row("slack", "Start Slack bot adapter"),
      row("sms", "Start SMS adapter (Twilio)"),
      row("whatsapp", "Start WhatsApp bot adapter (Twilio)"),
      row("email", "Start Email adapter (SMTP)"),
    ],
  },

  // ── CLI REFERENCE ────────────────────────────────────────────────────

  "Full command list": {
    id: "Full command list",
    label: "Full command list",
    navGroup: "CLI REFERENCE",
    description:
      "Complete list of all CLI commands grouped by category. Run any command with `--help` for detailed usage. Use `aegis wakeup` for the interactive mode picker, or `aegis status` for a live system overview.",
    codeLines: [
      { tone: "comment", text: "# Interactive command picker" },
      { tone: "default", text: "aegis wakeup" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Help for any command" },
      { tone: "default", text: "aegis --help" },
      { tone: "default", text: "aegis agent --help" },
      { tone: "default", text: "aegis memory --help" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Shell completions" },
      { tone: "default", text: "aegis completion bash  # or zsh, fish" },
    ],
    tableRows: [
      row("wakeup", "Interactive mode picker"),
      row("chat", "Interactive AI chat session"),
      row("ask", "Ask read-only questions"),
      row("plan", "Generate implementation plans"),
      row("status", "Live system overview"),
      row("doctor", "System diagnostics"),
      row("completion", "Generate shell completion scripts"),
      { name: "aegis <cmd> --help", type: "Help", desc: "Detailed help for any command" },
    ],
  },

  Diagnostics: {
    id: "Diagnostics",
    label: "Diagnostics",
    navGroup: "CLI REFERENCE",
    description:
      "System diagnostics and health checks. The `doctor` command verifies your installation, API keys, and provider connectivity. `status` shows a live dashboard of agents, memory, and runtime. `dashboard` renders a terminal UI.",
    codeLines: [
      { tone: "comment", text: "# Full system diagnostics" },
      { tone: "default", text: "aegis doctor --verbose" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Live system status" },
      { tone: "default", text: "aegis status" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Watch mode (live updates every 2s)" },
      { tone: "default", text: "aegis status --watch" },
      { tone: "blank", text: "" },
      { tone: "comment", text: "# Dashboard TUI" },
      { tone: "default", text: "aegis dashboard" },
    ],
    tableRows: [
      row("doctor", "Run system health diagnostics"),
      row("status", "System status overview"),
      row("dashboard", "Terminal UI dashboard"),
      row("telemetry status", "Show telemetry configuration"),
      { name: "aegis doctor --verbose", type: "Flag", desc: "Show detailed diagnostic info" },
      { name: "aegis status --watch", type: "Flag", desc: "Live-updating status every 2s" },
    ],
  },
}

export const defaultTopic: DocTopic = {
  id: "default",
  label: "Documentation",
  navGroup: "",
  description:
    "Select a topic from the sidebar to view its documentation. Each section includes usage examples, command references, and detailed explanations covering all Aegis features.",
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
