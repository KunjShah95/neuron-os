export interface DocBlock {
  type: "p" | "h2" | "h3" | "ul" | "ol" | "code" | "callout" | "quote"
  text?: string
  items?: string[]
  lang?: string
  code?: string
  tone?: "info" | "warn"
  cite?: string
}

export interface Doc {
  slug: string
  category: "Guide" | "Reference" | "Recipe" | "Concept"
  title: string
  description: string
  readTime: string
  href: string
  body: DocBlock[]
}

export const docs: Doc[] = [
  {
    slug: "getting-started",
    category: "Guide",
    title: "Getting started",
    description: "Install Neuron OS, spawn your first agent, and learn the four commands that cover 90% of the workflow.",
    readTime: "5 min",
    href: "/docs/getting-started",
    body: [
      { type: "h2", text: "Install" },
      {
        type: "p",
        text: "Neuron OS ships as a single binary and an npm wrapper. The npm wrapper is the easiest path on macOS and Linux; the binary works on every platform we test, including Windows via WSL2.",
      },
      { type: "code", lang: "shell", code: "npx create-neuron-os@latest" },
      {
        type: "p",
        text: "The installer will: detect your shell, install the binary to ~/.neuron/bin, add it to your PATH, generate an encryption key for your vault, and print a verification command.",
      },
      { type: "code", lang: "shell", code: "neuron --version\nneuron doctor" },
      { type: "callout", tone: "info", text: "If `neuron doctor` reports a problem with the model provider, run `neuron config set provider` and pick from the menu. We support Anthropic, OpenAI, DeepSeek, Ollama, and OpenRouter out of the box." },
      { type: "h2", text: "Spawn your first agent" },
      { type: "p", text: "Agents are spawned with a single command. The type determines which tools and which reasoning template the agent uses; the goal is a free-text description of what you want done." },
      { type: "code", lang: "shell", code: 'neuron spawn --type builder --goal "Refactor the auth middleware"' },
      {
        type: "p",
        text: "You'll see a streaming TUI render in your terminal. The agent will plan, call tools, and report progress as it works. When it's done, the session is saved to ~/.neuron/sessions/.",
      },
      { type: "h2", text: "Replay a session" },
      { type: "p", text: "Every session has a unique ID. Pass it to the replay command to scrub the audit log:" },
      { type: "code", lang: "shell", code: "neuron replay 0193f4a1-2c7e-7b1a-9d4f-b8a3c1e2f9a4" },
      { type: "p", text: "Use j/k to step through tool calls, / to filter, and q to quit. The replay is read-only — your agent isn't running, you're just looking at what it did." },
      { type: "h2", text: "List and kill running agents" },
      { type: "code", lang: "shell", code: "neuron ls\nneuron ls --type builder --state running\nneuron kill <pid> --reason \"stuck\"" },
      { type: "p", text: "Killing an agent cancels its current tool call, flushes its session, and writes a final audit log entry explaining why it was killed. There's no in-between state where the agent is 'gone but not yet killed.'" },
      { type: "h2", text: "Remember a fact" },
      { type: "p", text: "The vault is a vector-backed, encrypted store on your disk. The `remember` command takes a string and infers the kind, the TTL, and the embedding automatically." },
      { type: "code", lang: "shell", code: 'neuron remember "User prefers tabs over spaces"' },
      { type: "p", text: "Subsequent agents will see this fact when it's relevant. You can search the vault with `recall`:" },
      { type: "code", lang: "shell", code: 'neuron recall "user preferences"' },
      { type: "h2", text: "What's next" },
      { type: "ul", items: [
        "Read the API reference for the full spawn() / kill() / list() / replay() signature set.",
        "Browse the recipes for the most common patterns: writing a custom tool, attaching a vector index, configuring a provider.",
        "Wire Neuron OS into your editor via the MCP integration guide.",
        "Join the Discord if you get stuck, or open an issue on GitHub.",
      ] },
    ],
  },
  {
    slug: "api-reference",
    category: "Reference",
    title: "API reference",
    description: "The complete reference for spawn(), kill(), list(), replay(), and every other function in the public API.",
    readTime: "12 min",
    href: "/docs/api-reference",
    body: [
      { type: "h2", text: "spawn(options)" },
      { type: "p", text: "Spawn a new agent process. Returns a Promise<SpawnResult> containing the agent's PID, session ID, and a teardown function." },
      { type: "code", lang: "typescript", code: `import { spawn } from "neuron-os"

const result = await spawn({
  type: "builder",          // required: "builder" | "planner" | "tester" | "reviewer" | "reflector" | ... (14 total)
  goal: "Refactor auth",    // required: free-text goal
  model: "claude-sonnet-4", // optional: provider.model string, falls back to config
  tools: ["fs.read"],       // optional: scoped tool list, default is all
  ttl: "30m",               // optional: max runtime, default is 1h
  parent: "0193f4...",      // optional: parent session ID, for hierarchical agents
})

console.log(result.pid)        // "p_01HQZ8K2..."
console.log(result.sessionId)  // "0193f4a1-2c7e-7b1a-9d4f-b8a3c1e2f9a4"` },
      { type: "h3", text: "SpawnOptions" },
      { type: "ul", items: [
        "type — one of the 14 agent types. Each type has a fixed tool scope and reasoning template.",
        "goal — the high-level objective. The planner will decompose it into a typed DAG of sub-goals.",
        "model — provider.model, or omit to use the default from ~/.neuron/config.toml.",
        "tools — explicit allowlist of tool names. Default is 'all' for the agent type.",
        "ttl — hard cap on runtime. The agent is killed with reason 'ttl' when this expires.",
        "parent — for hierarchical spawns. The child inherits the parent's vault scope.",
        "onToolCall — optional callback fired synchronously before each tool invocation.",
        "onStep — optional callback fired after each reasoning step completes.",
      ] },
      { type: "h2", text: "kill(pid, options?)" },
      { type: "p", text: "Cancel a running agent. The cancellation is cooperative: the agent is given a SIGTERM-equivalent, allowed to flush its current step, and then SIGKILL'd. The session is closed and the audit log is sealed." },
      { type: "code", lang: "typescript", code: `import { kill } from "neuron-os"

await kill("p_01HQZ8K2...", { reason: "stuck" })` },
      { type: "h3", text: "KillOptions" },
      { type: "ul", items: [
        "reason — written to the audit log. Defaults to 'manual'.",
        "force — skip the cooperative shutdown and SIGKILL immediately. Default false.",
        "timeout — ms to wait for cooperative shutdown before SIGKILL. Default 5000.",
      ] },
      { type: "h2", text: "list(filter?)" },
      { type: "p", text: "Return an array of running and recently-finished agent processes." },
      { type: "code", lang: "typescript", code: `import { list } from "neuron-os"

const all = await list()
const running = await list({ state: "running" })
const builders = await list({ type: "builder" })` },
      { type: "h3", text: "ListFilter" },
      { type: "ul", items: [
        "state — 'running' | 'finished' | 'failed' | 'killed'.",
        "type — agent type filter.",
        "limit — max number of results. Default 50.",
        "since — ISO timestamp; only return agents spawned after this point.",
      ] },
      { type: "h2", text: "replay(sessionId)" },
      { type: "p", text: "Return a structured trace of a session. The trace is an array of step records, each containing the model request, the model response, every tool call, and the agent's final decision." },
      { type: "code", lang: "typescript", code: `import { replay } from "neuron-os"

const trace = await replay("0193f4a1-2c7e-7b1a-9d4f-b8a3c1e2f9a4")
console.log(trace.steps.length)
console.log(trace.toolCalls)` },
      { type: "h2", text: "remember() / recall()" },
      { type: "p", text: "The vault is a vector store with TTL and metadata. `remember` infers kind and TTL; `recall` does a semantic search." },
      { type: "code", lang: "typescript", code: `import { remember, recall } from "neuron-os"

await remember("User prefers tabs over spaces", { ttl: "90d" })
const results = await recall("user preferences", { limit: 5 })` },
      { type: "h2", text: "Errors" },
      { type: "p", text: "All errors thrown by the public API extend NeuronError. The most common variants:" },
      { type: "ul", items: [
        "SpawnRefused — the runtime refused the spawn (unknown type, parent not found, etc).",
        "ToolPermissionDenied — the agent tried to call a tool outside its scope.",
        "SessionNotFound — replay() was given an invalid session ID.",
        "VaultLocked — the encryption key could not be loaded. Usually means a fresh machine; run `neuron key import`.",
        "ProviderError — the upstream model returned an error. The error includes the model_request_id for debugging.",
      ] },
    ],
  },
]

export const recipeDocs: Doc[] = [
  {
    slug: "spawn-an-agent",
    category: "Recipe",
    title: "Spawn an agent in 4 lines",
    description: "The smallest useful program you can write with Neuron OS. Spawns a builder agent, waits for it to finish, and prints the result.",
    readTime: "3 min",
    href: "/docs/recipes/spawn-an-agent",
    body: [
      { type: "p", text: "This is the smallest useful program you can write with Neuron OS. It spawns a builder agent, waits for it to finish, and prints the summary." },
      { type: "code", lang: "typescript", code: `import { spawn } from "neuron-os"

const agent = await spawn({
  type: "builder",
  goal: "Refactor the auth middleware",
  model: "claude-sonnet-4",
})

await agent.run()
console.log(agent.summary)` },
      { type: "h2", text: "What just happened" },
      { type: "p", text: "spawn() did four things in order:" },
      { type: "ol", items: [
        "Allocated a PID and a session ID. Both are returned on the result object.",
        "Loaded the agent type's default tool scope. The 'builder' type gets fs.read, fs.write, shell.exec, and grep by default.",
        "Connected to the model provider and sent the initial planning request.",
        "Returned a handle. The agent is now running in the background; you can `await agent.run()` to block on completion, or do other work and check on it later.",
      ] },
      { type: "h2", text: "What if the model has no idea what to do" },
      { type: "p", text: "It happens. The agent will mark the session as 'failed' and write a clear error to the audit log. You can catch this with a try/catch:" },
      { type: "code", lang: "typescript", code: `try {
  const agent = await spawn({ type: "builder", goal: "..." })
  await agent.run()
} catch (err) {
  if (err.code === "AGENT_FAILED") {
    console.error("The agent gave up:", err.summary)
    console.error("Trace at:", err.sessionId)
  } else {
    throw err
  }
}` },
      { type: "h2", text: "Where to go next" },
      { type: "ul", items: [
        "Recipe: reuse a fact across sessions (memory).",
        "Recipe: hot-reload a custom tool.",
        "API reference: spawn() options.",
      ] },
    ],
  },
  {
    slug: "reusable-memory",
    category: "Recipe",
    title: "Reuse a fact across every session",
    description: "Vault, semantic search, and TTL — wired to a single CLI command and two library functions. Nothing else to import.",
    readTime: "4 min",
    href: "/docs/recipes/reusable-memory",
    body: [
      { type: "p", text: "Most agents fail in production not because the model is bad, but because the model has no idea who you are. Neuron OS solves this with a vault: an encrypted, vector-backed, time-aware memory that every agent can read from and write to." },
      { type: "h2", text: "Storing a fact" },
      { type: "code", lang: "shell", code: 'neuron remember "User prefers tabs over spaces" --kind preference --ttl 90d' },
      { type: "p", text: "The vault infers the embedding, the kind, and the TTL. You can override any of these with flags. The fact is now part of every agent's context — surfaced automatically when the agent's reasoning identifies the fact as relevant." },
      { type: "h2", text: "Recalling a fact" },
      { type: "code", lang: "shell", code: 'neuron recall "user preferences"' },
      { type: "p", text: "Returns the top-5 relevant facts, ranked by cosine similarity. The output includes the fact, the kind, the TTL, and the date it was stored." },
      { type: "h2", text: "From a script" },
      { type: "code", lang: "typescript", code: `import { remember, recall } from "neuron-os"

await remember("The team uses a monorepo with pnpm workspaces", { ttl: "180d" })

const facts = await recall("project structure", { limit: 3 })
for (const f of facts) console.log(f.text)` },
      { type: "h2", text: "How relevance is computed" },
      { type: "p", text: "The vault uses the same embedding model as the active provider, with a fallback to a local MiniLM model when offline. Relevance is cosine similarity, but the ranking is re-weighted by recency: facts stored in the last 7 days get a 1.5x boost." },
      { type: "h2", text: "What to store" },
      { type: "p", text: "Short, declarative, durable. 'User prefers tabs over spaces' is good. 'The user said they liked tabs once in March 2024' is bad — the fact should be timeless. If your fact has a date in it, store it as a note, not a fact." },
      { type: "h2", text: "Privacy" },
      { type: "p", text: "The vault is encrypted with a key stored at ~/.neuron/key. The key is generated locally and never leaves your machine. If you copy your vault to another machine, you'll need to export and re-import the key with `neuron key export` / `neuron key import`." },
    ],
  },
  {
    slug: "custom-tool",
    category: "Recipe",
    title: "Hot-reload a custom tool",
    description: "Write a tool, save the file, watch it appear in the next tool call. No rebuild, no restart.",
    readTime: "5 min",
    href: "/docs/recipes/custom-tool",
    body: [
      { type: "p", text: "Tools in Neuron OS are just files. Drop a TypeScript module in ~/.neuron/tools/, and the next agent you spawn will see it in its tool list. Edit the file, and the next tool call will use the new version. No rebuild. No restart. No manifest." },
      { type: "h2", text: "The shape of a tool" },
      { type: "code", lang: "typescript", code: `// ~/.neuron/tools/slack.ts
import { define } from "neuron-os/tool"

export default define({
  name: "post_slack",
  description: "Post a message to a Slack channel",
  schema: {
    channel: "string",
    text: "string",
  },
  run: async ({ channel, text }) => {
    const res = await fetch(process.env.SLACK_HOOK!, {
      method: "POST",
      body: JSON.stringify({ channel, text }),
    })
    if (!res.ok) throw new Error(\`Slack returned \${res.status}\`)
    return { ok: true }
  },
})` },
      { type: "h2", text: "What each field does" },
      { type: "ul", items: [
        "name — the tool name, surfaced to the model. Keep it short and verb-first.",
        "description — short, declarative sentence. The model reads this when deciding which tool to call. Be specific; vagueness costs you accuracy.",
        "schema — a flat object mapping field names to types. The model gets this in the JSON schema format it already knows.",
        "run — the function that runs when the tool is called. It receives the parsed arguments and returns either a value or a thrown error.",
      ] },
      { type: "h2", text: "Verifying it loaded" },
      { type: "code", lang: "shell", code: "neuron tools list\nneuron tools show post_slack" },
      { type: "p", text: "The runtime watches ~/.neuron/tools/ for changes. Every time you save a file, the next agent that spawns will use the new version. Agents that are already running continue with the version they loaded at spawn time — this is intentional, and avoids the class of bugs that comes from tools changing mid-execution." },
      { type: "h2", text: "Sharing tools across machines" },
      { type: "p", text: "Tools are just files. rsync them, version-control them, or share them via a private npm package — whatever fits your workflow. We do not have a tool registry, and we do not plan to. The moment we do, the hot-reload story gets worse, and that matters more than discoverability." },
      { type: "h2", text: "Common gotchas" },
      { type: "ul", items: [
        "The default export must be a `define()` call, not a plain object. The runtime needs the schema metadata.",
        "Field names in `schema` must match the names in the destructured `run` argument. The runtime uses the schema to validate the input from the model.",
        "If your tool talks to a network service, throw on non-2xx. The model will see the error and adapt. Don't swallow errors silently.",
        "Don't read environment variables at the top level. The runtime captures the process env at tool load time and freezes it. Read inside `run()` so the tool works in tests.",
      ] },
    ],
  },
  {
    slug: "eval-pipeline",
    category: "Reference",
    title: "Eval pipeline",
    description: "Skill validation, golden datasets, and multi-agent evaluation — the full reference for aegis eval and aegis improve commands.",
    readTime: "6 min",
    href: "/docs/eval-pipeline",
    body: [
      { type: "h2", text: "Overview" },
      {
        type: "p",
        text: "The eval pipeline consists of three phases: skill validation (Phase 6), multi-agent coordination testing (Phase 7), and golden dataset management (Phase 8). Each phase ships as a CLI command under `aegis eval` or `aegis improve`.",
      },
      { type: "h2", text: "aegis improve validate" },
      { type: "p", text: "Validate skill candidates against the GraderSuite before publishing. Runs each candidate through the eval harness, grades the output, and produces a pass/fail recommendation." },
      { type: "code", lang: "shell", code: "aegis improve validate run --candidate <id>\naegis improve validate list\naegis improve validate stats" },
      { type: "h3", text: "Subcommands" },
      { type: "ul", items: [
        "run — validate a specific skill candidate against the harness. Returns a pass/fail result with composite score and grader breakdown.",
        "list — show recent validation history across all candidates.",
        "stats — aggregate validation statistics: total validated, pass rate, average score.",
      ] },
      { type: "h2", text: "aegis improve monitor" },
      { type: "p", text: "Track skill performance over time after publication. Monitors invocation count, success rate, reward trends, and flags degrading skills." },
      { type: "code", lang: "shell", code: "aegis improve monitor status\naegis improve monitor list\naegis improve monitor degrading\naegis improve monitor top\naegis improve monitor record" },
      { type: "h3", text: "Subcommands" },
      { type: "ul", items: [
        "status — overall monitor health: total skills tracked, records count, average success rate, number of degrading skills.",
        "list — all tracked skills sorted by degradation score (highest first).",
        "degrading — skills that need attention (degradation score above configurable threshold).",
        "top — top-N performing skills by success rate (minimum 3 invocations).",
        "record — manually record a skill usage outcome (for testing).",
      ] },
      { type: "h2", text: "aegis eval golden" },
      { type: "p", text: "Manage the Silver → Gold → Audit pipeline for human-verified evaluation tasks. Tasks are stored as JSON files in `evals/golden/`." },
      { type: "code", lang: "shell", code: "aegis eval golden create --name <name> --prompt <prompt> --difficulty easy\naegis eval golden list\naegis eval golden promote --id <task-id> --verifier <name> --quality 4.5\naegis eval golden audit --id <task-id>\naegis eval golden archive --id <task-id>\naegis eval golden stats" },
      { type: "h3", text: "Lifecycle" },
      { type: "ul", items: [
        "Silver — LLM-generated task, pending human review. Created via `aegis eval golden create`.",
        "Gold — human-verified. Promoted via `aegis eval golden promote` with a quality score (1-5).",
        "Audited — cross-validated by 2+ models via `aegis eval golden audit`. Auto-audits when 2+ models pass.",
        "Archived — removed from the active set.",
      ] },
      { type: "h2", text: "aegis eval run --golden" },
      { type: "p", text: "Include golden tasks in your standard eval run. Adds all audited golden tasks to the test suite, deduplicating by ID." },
      { type: "code", lang: "shell", code: "aegis eval run --golden\naegis eval run --golden --golden-status silver\naegis eval run --golden --name \"function\"" },
      { type: "h3", text: "Options" },
      { type: "ul", items: [
        "--golden — include golden tasks in the eval run.",
        "--golden-status — filter by status: silver, gold, audited (default: audited).",
      ] },
      { type: "h2", text: "aegis eval multi-agent" },
      { type: "p", text: "Test and evaluate multi-agent coordination patterns. Supports 6 patterns: sequential, parallel, debate, hierarchical, voting, and refine." },
      { type: "code", lang: "shell", code: "aegis eval multi-agent list\naegis eval multi-agent run --scenario <name>\naegis eval multi-agent metrics" },
      { type: "h3", text: "Coordination patterns" },
      { type: "ul", items: [
        "sequential — Agent A → Agent B → Agent C (pipeline)",
        "parallel — Agents run simultaneously, results merged",
        "debate — Multiple agents discuss, reach consensus",
        "hierarchical — Orchestrator delegates to sub-agents",
        "voting — Each agent votes, majority wins",
        "refine — Agent A produces, Agent B critiques, Agent A refines",
      ] },
      { type: "h2", text: "Calibration comparison" },
      { type: "p", text: "The calibration script compares judge accuracy across multiple LLM models. Run with specific models or use defaults." },
      { type: "code", lang: "shell", code: "# Full comparison with Groq models\nMODELS=\"groq:llama-3.3-70b-versatile:Groq70B,groq:llama-3.1-8b-instant:Groq8B\" GROQ_API_KEY=gsk_... bun run scripts/calibration-compare.ts\n\n# Quick test with just 5 examples\nLIMIT=5 bun run scripts/calibration-compare.ts\n\n# Local Ollama models (no API key needed)\nMODELS=\"ollama:llama3.2:Llama3.2,ollama:qwen3.5:2b:Qwen3.5\" bun run scripts/calibration-compare.ts" },
      { type: "h3", text: "Options" },
      { type: "ul", items: [
        "MODELS — comma-separated list of provider:model:label.",
        "LIMIT=N — run only N calibration examples (default: all 40).",
        "SKIP=model — skip specific models.",
        "PARALLEL=true — run all models concurrently.",
      ] },
    ],
  },
  {
    slug: "mcp-integration",
    category: "Guide",
    title: "MCP integration",
    description: "Wire Neuron OS into Claude Code, Cursor, VS Code, Zed, or any MCP-compatible editor. Drop-in, no glue code.",
    readTime: "4 min",
    href: "/docs/mcp",
    body: [
      { type: "p", text: "Neuron OS ships with a built-in MCP server. Run it once and any MCP-compatible editor can talk to your local agents." },
      { type: "h2", text: "Start the server" },
      { type: "code", lang: "shell", code: "neuron mcp serve --port 7123" },
      { type: "p", text: "The server listens on localhost:7123 by default. It exposes a single tool, `agent_run`, that takes a goal and returns a session ID." },
      { type: "h2", text: "Claude Code" },
      { type: "p", text: "Add this to your claude_desktop_config.json:" },
      { type: "code", lang: "json", code: `{
  "mcpServers": {
    "neuron": {
      "command": "neuron",
      "args": ["mcp", "serve"]
    }
  }
}` },
      { type: "h2", text: "Cursor / VS Code" },
      { type: "p", text: "Same config, different file location. Cursor reads ~/.cursor/mcp.json; VS Code reads .vscode/mcp.json in your project root." },
      { type: "h2", text: "What you get" },
      { type: "p", text: "Inside the editor, you'll see a new tool called agent_run. The model can call it to spawn a Neuron OS agent in the background. When the agent finishes, the editor sees the summary as the tool's return value." },
      { type: "h2", text: "Limitations" },
      { type: "p", text: "MCP doesn't yet support streaming tool calls. If your agent takes more than 60 seconds, the editor will time out. We're working on this; the workaround today is to spawn the agent and check back with `neuron ls`." },
    ],
  },
]

export function getDocBySlug(slug: string): Doc | undefined {
  return docs.find((d) => d.slug === slug)
}

export function getRecipeBySlug(slug: string): Doc | undefined {
  return recipeDocs.find((r) => r.slug === slug)
}
