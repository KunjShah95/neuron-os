import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"

interface CommandGroup {
  name: string
  icon: string
  tags: string[]
  commands: CommandDef[]
}

interface CommandDef {
  name: string
  sub?: string
  desc: string
  usage: string
  options?: { flag: string; desc: string }[]
}

const commandGroups: CommandGroup[] = [
  {
    name: "wakeup", icon: "◈", tags: ["system", "tui"],
    commands: [
      { name: "wakeup", desc: "Show mode launcher (interactive TUI)", usage: "aegis wakeup", sub: "w" },
    ],
  },
  {
    name: "setup", icon: "⚡", tags: ["system", "config"],
    commands: [
      { name: "setup", desc: "Configure and initialize Aegis workspace via interactive flow", usage: "aegis setup" },
    ],
  },
  {
    name: "agent", icon: "⬡", tags: ["agent", "process"],
    commands: [
      { name: "agent types", desc: "List all available agent types (primary + subagents)", usage: "aegis agent types" },
      { name: "agent list", desc: "List all spawned agents with status, pid, uptime", usage: "aegis agent list", sub: "ls",
        options: [
          { flag: "--status <status>", desc: "Filter by status (running, idle, stopped, error)" },
          { flag: "--tag <tag>", desc: "Filter by tag" },
          { flag: "--type <type>", desc: "Filter by agent type" },
        ] },
      { name: "agent spawn <name>", desc: "Spawn a new agent process", usage: "aegis agent spawn my-agent --type build",
        options: [
          { flag: "--type <type>", desc: "Agent type (build, plan, read, write, test, etc.)" },
          { flag: "--tag <tags...>", desc: "Tags to assign" },
          { flag: "--timeout <ms>", desc: "Stop timeout in ms" },
          { flag: "--retries <n>", desc: "Auto-recovery max retries (default: 5)" },
          { flag: "--backoff <ms>", desc: "Recovery base backoff in ms (default: 1000)" },
          { flag: "--script <path>", desc: "Path to worker script" },
        ] },
      { name: "agent kill <name>", desc: "Gracefully stop or force-kill an agent", usage: "aegis agent kill my-agent",
        options: [
          { flag: "-f, --force", desc: "Skip graceful shutdown, send SIGKILL" },
          { flag: "--timeout <ms>", desc: "Graceful shutdown timeout before force kill" },
        ] },
      { name: "agent logs <name>", desc: "Show agent log output", usage: "aegis agent logs my-agent",
        options: [
          { flag: "-n, --tail <count>", desc: "Number of recent lines (default: 50)" },
          { flag: "--level <level>", desc: "Filter by level (info, warn, error, debug)" },
          { flag: "-f, --follow", desc: "Follow new log entries" },
        ] },
      { name: "agent inspect <name>", desc: "Show detailed agent info and metadata", usage: "aegis agent inspect my-agent" },
    ],
  },
  {
    name: "chat", icon: "✦", tags: ["tui", "agent"],
    commands: [
      { name: "chat", desc: "Open the interactive chat TUI with agent support", usage: "aegis chat", sub: "c",
        options: [
          { flag: "-t, --type <type>", desc: "Agent type (build, plan, read, write, test, etc.)" },
        ] },
    ],
  },
  {
    name: "dashboard", icon: "◈", tags: ["tui", "system"],
    commands: [
      { name: "dashboard", desc: "Open live dashboard TUI", usage: "aegis dashboard", sub: "dash" },
    ],
  },
  {
    name: "status", icon: "◎", tags: ["system", "info"],
    commands: [
      { name: "status", desc: "Quick system status overview (version, runtime, memory, uptime)", usage: "aegis status", sub: "st",
        options: [
          { flag: "--json", desc: "JSON output" },
        ] },
    ],
  },
  {
    name: "skills", icon: "◇", tags: ["system", "info"],
    commands: [
      { name: "skills", desc: "List installed local skills and trending skills from registry", usage: "aegis skills", sub: "sk",
        options: [
          { flag: "-s, --search <query>", desc: "Search skills.sh remote registry" },
          { flag: "--json", desc: "JSON output" },
        ] },
    ],
  },
  {
    name: "config", icon: "⚙", tags: ["config", "security"],
    commands: [
      { name: "config set <key> <value>", desc: "Store a credential (e.g. API key) in the vault", usage: "aegis config set OPENAI_KEY sk-...",
        options: [
          { flag: "--scope <scope>", desc: "Scope: global (default) or agent type name" },
        ] },
      { name: "config get <key>", desc: "Retrieve a stored credential", usage: "aegis config get OPENAI_KEY",
        options: [
          { flag: "--scope <scope>", desc: "Scope" },
        ] },
      { name: "config delete <key>", desc: "Delete a stored credential from the vault", usage: "aegis config delete OPENAI_KEY",
        options: [
          { flag: "--scope <scope>", desc: "Scope" },
        ] },
      { name: "config list", desc: "List all stored credential keys (values masked)", usage: "aegis config list",
        options: [
          { flag: "--scope <scope>", desc: "Filter by scope" },
        ] },
    ],
  },
  {
    name: "cron", icon: "⏱", tags: ["system", "schedule"],
    commands: [
      { name: "cron add <name> <schedule> <goal>", desc: "Add a scheduled recurring job", usage: "aegis cron add daily-check 6h 'Run health check'",
        options: [
          { flag: "--type <type>", desc: "Agent type to use for the job" },
        ] },
      { name: "cron remove <name>", desc: "Remove a scheduled cron job", usage: "aegis cron remove daily-check" },
      { name: "cron list", desc: "List all active scheduled jobs", usage: "aegis cron list", sub: "ls" },
      { name: "cron heartbeat", desc: "Show the heartbeat checklist", usage: "aegis cron heartbeat" },
    ],
  },
  {
    name: "serve", icon: "↗", tags: ["network", "server"],
    commands: [
      { name: "serve", desc: "Start the HTTP API server (REST + WebSocket)", usage: "aegis serve",
        options: [
          { flag: "-p, --port <port>", desc: "Port to listen on (default: 8080)" },
          { flag: "--host <host>", desc: "Host to bind to (default: 0.0.0.0)" },
          { flag: "--key <key>", desc: "API key for request authentication" },
          { flag: "--cron", desc: "Also start the cron engine" },
        ] },
    ],
  },
  {
    name: "mcp", icon: "⊞", tags: ["network", "protocol"],
    commands: [
      { name: "mcp serve", desc: "Start MCP server exposing neuron-os as MCP", usage: "aegis mcp serve",
        options: [
          { flag: "-p, --port <port>", desc: "HTTP port (default: 3100)" },
          { flag: "--host <host>", desc: "Host to bind to (default: 0.0.0.0)" },
          { flag: "--key <key>", desc: "API key" },
          { flag: "--stdio", desc: "Use stdio transport instead of HTTP" },
        ] },
      { name: "mcp connect", desc: "Connect to external MCP servers from config", usage: "aegis mcp connect" },
      { name: "mcp list", desc: "List configured MCP servers and registered tools", usage: "aegis mcp list", sub: "ls" },
    ],
  },
  {
    name: "memory", icon: "◇", tags: ["memory", "data"],
    commands: [
      { name: "memory show", desc: "Display current MEMORY.md contents", usage: "aegis memory show" },
      { name: "memory add <content>", desc: "Append content to long-term memory file", usage: "aegis memory add 'Learned X about Y'" },
      { name: "memory search <query>", desc: "Search memory and daily logs", usage: "aegis memory search 'deployment'",
        options: [
          { flag: "--vector", desc: "Also search vector memory" },
        ] },
      { name: "memory facts", desc: "Show extracted facts from conversations", usage: "aegis memory facts",
        options: [
          { flag: "--category <cat>", desc: "Filter by category: preference, project, identity, etc." },
        ] },
      { name: "memory vector", desc: "Show vector memory stats (total entries, by category)", usage: "aegis memory vector" },
    ],
  },
  {
    name: "agentmemory", icon: "◇", tags: ["memory", "network"],
    commands: [
      { name: "agentmemory status", desc: "Show agentmemory connection status and stats", usage: "aegis agentmemory status", sub: "am" },
      { name: "agentmemory search <query>", desc: "Semantic search across agentmemory", usage: "aegis agentmemory search 'concept'",
        options: [
          { flag: "-l, --limit <n>", desc: "Max results (default: 5)" },
        ] },
      { name: "agentmemory connect", desc: "Test connection to agentmemory server", usage: "aegis agentmemory connect" },
    ],
  },
]

const allTags = Array.from(new Set(commandGroups.flatMap((g) => g.tags))).sort()

const totalCommands = commandGroups.reduce((s, g) => s + g.commands.length, 0)

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

function formatUsage(text: string): (string | { text: string; hl: boolean })[] {
  const parts = text.split(/(\{\{[^}]+\}\}|<[^>]+>)/g)
  return parts.map((p) => {
    if (p.startsWith("{{") || p.startsWith("<")) return { text: p.replace(/[{}<>]/g, ""), hl: true }
    return { text: p, hl: false }
  })
}

const tagColors: Record<string, string> = {
  system: "#fbbf24",
  tui: "#22d3ee",
  agent: "#fb7185",
  process: "#a78bfa",
  config: "#34d399",
  security: "#f472b6",
  schedule: "#f97316",
  network: "#22d3ee",
  server: "#fbbf24",
  protocol: "#a78bfa",
  memory: "#60a5fa",
  data: "#34d399",
  info: "#94a3b8",
}

function tagColor(tag: string) {
  return tagColors[tag] ?? "#94a3b8"
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }, [text])

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-500 hover:text-amber-400 transition-colors shrink-0"
    >
      {copied ? (
        <>
          <span className="text-emerald-400">✓</span>
          <span className="text-emerald-400/70">Copied</span>
        </>
      ) : (
        <>
          <span>⎘</span>
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

export default function Docs() {
  const [search, setSearch] = useState("")
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  const filtered = search.trim()
    ? commandGroups
        .map((g) => ({
          ...g,
          commands: g.commands.filter(
            (c) =>
              c.name.toLowerCase().includes(search.toLowerCase()) ||
              c.desc.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.commands.length > 0)
    : activeTag
      ? commandGroups.filter((g) => g.tags.includes(activeTag))
      : commandGroups

  const activeInFilter = activeGroup && filtered.some((g) => g.name === activeGroup)

  return (
    <AnimatedPage className="p-8">
      <div className="flex gap-8 max-w-6xl mx-auto">
        <div className="flex-1 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-end justify-between">
              <div>
                <h1 className="font-display text-3xl text-surface-50 tracking-tight">
                  Command Reference
                </h1>
                <p className="text-sm text-surface-500 mt-2 max-w-xl">
                  Complete documentation for all CLI commands.
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-surface-500">
                <span>{commandGroups.length} categories</span>
                <span className="w-px h-3 bg-surface-700/50" />
                <span className="text-surface-300 font-mono">{totalCommands} commands</span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-5 flex-wrap">
              <span className="text-[10px] text-surface-600 uppercase tracking-wider mr-1">
                Tags:
              </span>
              <button
                onClick={() => setActiveTag(null)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                  !activeTag && !search
                    ? "border-amber-500/40 text-amber-400 bg-amber-400/5"
                    : "border-surface-700/40 text-surface-500 hover:border-surface-600"
                }`}
              >
                all
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setActiveTag(tag)
                    setActiveGroup(null)
                    setSearch("")
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    activeTag === tag
                      ? "border-amber-500/40 text-amber-400 bg-amber-400/5"
                      : "border-surface-700/40 text-surface-500 hover:border-surface-600"
                  }`}
                  style={activeTag === tag ? {} : { borderColor: `${tagColor(tag)}20` }}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="relative mt-4 max-w-md">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 text-sm">
                ⌕
              </span>
              <input
                type="text"
                placeholder="Search commands..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setActiveTag(null)
                  setActiveGroup(null)
                }}
                className="w-full bg-surface-800/60 border border-surface-700/50 rounded-xl py-2.5 pl-9 pr-4 text-sm text-surface-100 placeholder-surface-500 outline-none focus:border-amber-500/40 focus:bg-surface-800/80 transition-all duration-200"
              />
            </div>
          </motion.div>

          {activeGroup && !search && !activeTag && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 mb-6 flex-wrap"
            >
              <button
                onClick={() => setActiveGroup(null)}
                className="text-[11px] uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors"
              >
                ← All commands
              </button>
            </motion.div>
          )}

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {filtered.map((group) => {
              if (activeGroup && activeGroup !== group.name) return null
              return (
                <motion.div
                  key={group.name}
                  variants={item}
                  layout
                  id={`group-${group.name}`}
                  className="glass rounded-2xl border border-surface-700/30 overflow-hidden"
                >
                  <button
                    onClick={() => {
                      if (search || activeTag) return
                      if (activeGroup === group.name) setActiveGroup(null)
                      else if (!activeGroup) setActiveGroup(group.name)
                    }}
                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-surface-800/30 transition-colors"
                  >
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                      style={{ backgroundColor: `${tagColor(group.tags[0] ?? "")}15`, color: tagColor(group.tags[0] ?? "") }}
                    >
                      {group.icon}
                    </span>
                    <span className="text-sm font-medium text-surface-100">
                      {group.name}
                      <span className="text-[10px] text-surface-500 ml-2 uppercase tracking-wider">
                        {group.commands.length} {group.commands.length === 1 ? "command" : "commands"}
                      </span>
                    </span>
                    <div className="flex gap-1.5 ml-3">
                      {group.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded-md font-mono uppercase tracking-wider"
                          style={{ color: tagColor(t), backgroundColor: `${tagColor(t)}10` }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    {!search && !activeTag && (
                      <span className="ml-auto text-surface-600 text-xs">
                        {activeGroup === group.name ? "▲" : "▼"}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {(activeGroup === group.name || search || activeTag) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-5 space-y-5">
                          {group.commands.map((cmd, i) => (
                            <motion.div
                              key={cmd.name}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="pt-4 first:pt-2 border-t border-surface-700/20 first:border-0"
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <span className="text-sm font-mono text-amber-300/90">
                                    {cmd.name}
                                  </span>
                                  {cmd.sub && (
                                    <span className="text-[10px] text-surface-500 ml-2">
                                      alias: {cmd.sub}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-xs text-surface-400 mb-3 leading-relaxed">
                                {cmd.desc}
                              </p>

                              <div className="bg-surface-900/80 rounded-xl px-4 py-2.5 border border-surface-700/20 font-mono text-xs mb-3 flex items-center justify-between gap-4">
                                <span>
                                  {formatUsage(cmd.usage).map((part, j) =>
                                    typeof part === "string" ? (
                                      <span key={j} className="text-surface-300">
                                        {part}
                                      </span>
                                    ) : (
                                      <span
                                        key={j}
                                        className="text-amber-400/80 font-semibold"
                                      >
                                        {part.text}
                                      </span>
                                    ),
                                  )}
                                </span>
                                <CopyButton text={cmd.usage} />
                              </div>

                              {cmd.options && cmd.options.length > 0 && (
                                <div className="space-y-1">
                                  {cmd.options.map((opt) => (
                                    <div
                                      key={opt.flag}
                                      className="flex items-start gap-3 text-[11px]"
                                    >
                                      <code className="text-cyan-400/70 min-w-[150px] font-mono">
                                        {opt.flag}
                                      </code>
                                      <span className="text-surface-500">
                                        {opt.desc}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>

          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <p className="text-surface-500 text-sm">
                {search
                  ? <>No commands match "<span className="text-surface-300">{search}</span>"</>
                  : "No commands in this category."}
              </p>
            </motion.div>
          )}
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="hidden lg:block w-44 shrink-0"
        >
          <div className="sticky top-8 space-y-1">
            <p className="text-[10px] text-surface-600 uppercase tracking-[0.2em] mb-3">
              Jump to
            </p>
            {commandGroups.map((group) => (
              <a
                key={group.name}
                href={`#group-${group.name}`}
                onClick={(e) => {
                  e.preventDefault()
                  setActiveGroup(null)
                  setActiveTag(null)
                  setSearch("")
                  const el = document.getElementById(`group-${group.name}`)
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" })
                    setTimeout(() => {
                      setActiveGroup(group.name)
                    }, 300)
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-surface-500 hover:text-surface-200 hover:bg-surface-800/40 rounded-lg transition-all"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: tagColor(group.tags[0] ?? "") }}
                />
                <span>{group.name}</span>
                <span className="ml-auto text-[9px] text-surface-600 font-mono">
                  {group.commands.length}
                </span>
              </a>
            ))}
          </div>
        </motion.aside>
      </div>
    </AnimatedPage>
  )
}
