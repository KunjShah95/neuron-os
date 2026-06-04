import { resolve } from "node:path"
import { agentManager } from "../agent/manager"
import { isValidAgentType } from "../agent/agent-types"
import { addLogEntry } from "./store"
import type { AppState } from "./store"
import type { AgentTypeName } from "../agent/agent-types"
import { listProviders } from "../ai/providers"
import { listSessions, deleteSession, renameSession, exportSession } from "../memory/sessionStore"
import { getVersionDisplay } from "../version"

// ── Command dispatch ──────────────────────────────────────────────────

export async function executeCommand(state: AppState, input: string): Promise<void> {
  const trimmed = input.trim()
  if (!trimmed) return

  const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  if (parts.length === 0) return

  const cmd = parts[0]!.toLowerCase()
  const args = parts.slice(1).map((a) => a.replace(/^["']|["']$/g, ""))

  switch (cmd) {
    case "spawn":
    case "s":
      await spawnAgent(state, args)
      break

    case "kill":
    case "k":
      await killAgent(state, args)
      break

    case "ls":
    case "list":
      listAgents(state)
      break

    case "status":
    case "st":
      showStatus(state)
      break

    case "help":
    case "h":
      showHelp(state)
      break

    case "providers":
      // Populate provider list and switch focus
      try {
        state.providers = listProviders()
        state.providerIndex = 0
        state.ui.focus = "providers"
        addLogEntry(state, { text: `Providers loaded (${(state.providers || []).length})`, type: "info" })
      } catch (e) {
        addLogEntry(state, { text: `Failed to load providers: ${String(e)}`, type: "error" })
      }
      break

    case "sessions":
      try {
        state.sessions = await listSessions()
        state.sessionIndex = 0
        state.ui.focus = "sessions"
        addLogEntry(state, { text: `Sessions loaded (${(state.sessions || []).length})`, type: "info" })
      } catch (e) {
        addLogEntry(state, { text: `Failed to load sessions: ${String(e)}`, type: "error" })
      }
      break

    case "session": {
      // session <list|delete|rename|export> [args]
      const sub = args[0] ?? "list"
      try {
        if (sub === "list") {
          state.sessions = await listSessions()
          state.ui.focus = "sessions"
          addLogEntry(state, { text: `Sessions loaded (${(state.sessions || []).length})`, type: "info" })
          return
        }

        if (sub === "delete") {
          const id = args[1]
          if (!id) {
            addLogEntry(state, { text: "Usage: session delete <id>", type: "warn" })
            return
          }
          await deleteSession(id)
          state.sessions = await listSessions()
          addLogEntry(state, { text: `Deleted session ${id}`, type: "success" })
          return
        }

        if (sub === "rename") {
          const id = args[1]
          const to = args[2]
          if (!id || !to) {
            addLogEntry(state, { text: "Usage: session rename <id> <newId>", type: "warn" })
            return
          }
          await renameSession(id, to)
          state.sessions = await listSessions()
          addLogEntry(state, { text: `Renamed session ${id} → ${to}`, type: "success" })
          return
        }

        if (sub === "export") {
          const id = args[1]
          const path = args[2]
          if (!id || !path) {
            addLogEntry(state, { text: "Usage: session export <id> <path>", type: "warn" })
            return
          }
          await exportSession(id, path)
          addLogEntry(state, { text: `Exported session ${id} → ${path}`, type: "success" })
          return
        }

        addLogEntry(state, { text: `Unknown session command: ${sub}`, type: "warn" })
      } catch (e) {
        addLogEntry(state, { text: `Session command failed: ${String(e)}`, type: "error" })
      }
      break
    }

    default:
      addLogEntry(state, {
        text: `Unknown command: "${cmd}". Type "help" for available commands.`,
        type: "warn",
      })
  }
}

// ── Spawn ─────────────────────────────────────────────────────────────

async function spawnAgent(state: AppState, args: string[]): Promise<void> {
  if (args.length < 1) {
    addLogEntry(state, { text: "Usage: spawn <name> [--type <type>] [--script <path>] [--tag <tag>]", type: "warn" })
    return
  }

  const name = args[0]!
  let agentType: AgentTypeName | undefined
  let script = "src/agent/agent-worker.ts"
  let tags: string[] = []

  let i = 1
  while (i < args.length) {
    switch (args[i]) {
      case "--type":
        agentType = args[++i] as AgentTypeName | undefined
        if (!agentType) {
          addLogEntry(state, { text: "Missing value for --type. Usage: spawn <name> --type <type>", type: "warn" })
          return
        }
        if (!isValidAgentType(agentType)) {
          addLogEntry(state, { text: `Unknown agent type: "${agentType}". Use "help" to list available types.`, type: "warn" })
          return
        }
        i++
        break
      case "--script":
        script = args[++i] ?? script
        i++
        break
      case "--tag":
        tags.push(args[++i] ?? "")
        i++
        break
      default:
        addLogEntry(state, { text: `Unknown option: "${args[i]}". Type "help" for usage.`, type: "warn" })
        return
    }
  }

  const typeInfo = agentType ? ` [${agentType}]` : ""
  addLogEntry(state, { text: `Spawning agent "${name}"${typeInfo} (script: ${script})…`, type: "info" })

  try {
    const id = await agentManager.spawn({
      name,
      agentType,
      script: resolve(process.cwd(), script),
      tags: tags.length > 0 ? tags : undefined,
      recovery: { maxRetries: 3 },
    })

    addLogEntry(state, { text: `Agent "${name}" spawned successfully (id: ${id})`, type: "success" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    addLogEntry(state, { text: `Failed to spawn agent "${name}": ${msg}`, type: "error" })
  }
}

// ── Kill ──────────────────────────────────────────────────────────────

async function killAgent(state: AppState, args: string[]): Promise<void> {
  if (args.length < 1) {
    addLogEntry(state, { text: 'Usage: kill <name> (or "kill all")', type: "warn" })
    return
  }

  const target = args[0]!

  if (target === "all") {
    const running = agentManager.list().filter((a) => a.status !== "stopped" && a.status !== "error")
    if (running.length === 0) {
      addLogEntry(state, { text: "No running agents to kill.", type: "info" })
      return
    }
    addLogEntry(state, { text: `Killing ${running.length} agent(s)…`, type: "warn" })
    await Promise.allSettled(running.map((a) => agentManager.kill(a.id)))
    addLogEntry(state, { text: "All agents stopped.", type: "info" })
    return
  }

  // Find agent by name (case-insensitive partial match)
  const match = findAgentByName(target)
  if (!match) {
    addLogEntry(state, { text: `No agent found matching "${target}". Use "list" to see agents.`, type: "warn" })
    return
  }

  addLogEntry(state, { text: `Killing agent "${match.name}"…`, type: "warn" })

  try {
    await agentManager.kill(match.id)
    addLogEntry(state, { text: `Agent "${match.name}" killed.`, type: "info" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    addLogEntry(state, { text: `Failed to kill agent: ${msg}`, type: "error" })
  }
}

// ── List ──────────────────────────────────────────────────────────────

function listAgents(state: AppState): void {
  const all = agentManager.list()
  if (all.length === 0) {
    addLogEntry(state, { text: "No agents running. Use \"spawn <name>\" to launch one.", type: "info" })
    return
  }

  addLogEntry(state, { text: `Agents (${all.length}):`, type: "info" })
  for (const a of all) {
    const uptime = Math.floor((Date.now() - a.spawnTime) / 1000)
    addLogEntry(state, {
      text: `  [${a.status}] ${a.def.name} (pid ${a.pid}, uptime: ${uptime}s)`,
      type: "info",
    })
  }
}

// ── Status ────────────────────────────────────────────────────────────

function showStatus(state: AppState): void {
  const mem = process.memoryUsage()
  const memMB = (mem.rss / 1024 / 1024).toFixed(1)
  const uptime = formatDuration(process.uptime())
  const agentCount = agentManager.list().length
  const version = getVersionDisplay()
  const runtime = `Bun ${process.version}`
  const platform = `${process.platform} ${process.arch}`

  addLogEntry(state, { text: "── System Status ──", type: "event" })
  addLogEntry(state, { text: `  Version:  ${version}`, type: "info" })
  addLogEntry(state, { text: `  Runtime:  ${runtime}`, type: "info" })
  addLogEntry(state, { text: `  Platform: ${platform}`, type: "info" })
  addLogEntry(state, { text: `  Memory:   ${memMB} MB RSS`, type: "info" })
  addLogEntry(state, { text: `  Uptime:   ${uptime}`, type: "info" })
  addLogEntry(state, { text: `  Agents:   ${agentCount} running`, type: "info" })
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(" ")
}

// ── Help ──────────────────────────────────────────────────────────────

function showHelp(state: AppState): void {
  addLogEntry(state, { text: "Available commands:", type: "event" })
  addLogEntry(state, { text: "  spawn <name>                  Launch an agent (default: agent-worker.ts)", type: "info" })
  addLogEntry(state, { text: "  spawn <name> --type <type>    Launch with agent type (build, plan, read, etc.)", type: "info" })
  addLogEntry(state, { text: "  spawn <name> --script <path>  Launch with custom script", type: "info" })
  addLogEntry(state, { text: "  spawn <name> --tag <tag>      Launch with tags", type: "info" })
  addLogEntry(state, { text: "  kill <name>                   Stop an agent by name", type: "info" })
  addLogEntry(state, { text: "  kill all                      Stop all running agents", type: "info" })
  addLogEntry(state, { text: "  list                          List all agents", type: "info" })
  addLogEntry(state, { text: "  status                        Show system info (version, runtime, memory, uptime)", type: "info" })
  addLogEntry(state, { text: "  providers                     List configured AI providers", type: "info" })
  addLogEntry(state, { text: "  sessions                      List saved chat sessions", type: "info" })
  addLogEntry(state, { text: "  session delete <id>           Delete a saved session", type: "info" })
  addLogEntry(state, { text: "  session rename <id> <new>     Rename a session", type: "info" })
  addLogEntry(state, { text: "  session export <id> <path>    Export a session to file", type: "info" })
  addLogEntry(state, { text: "  help                          Show this help", type: "info" })
  addLogEntry(state, { text: "  Ctrl+Q                        Quit dashboard", type: "info" })
}

// ── Helpers ───────────────────────────────────────────────────────────

function findAgentByName(name: string): { id: string; name: string } | null {
  const lower = name.toLowerCase()
  // Exact match first
  for (const [id, inst] of agentManager.agents) {
    if (inst.def.name.toLowerCase() === lower) return { id, name: inst.def.name }
  }
  // Fall back to partial match
  for (const [id, inst] of agentManager.agents) {
    if (inst.def.name.toLowerCase().includes(lower)) return { id, name: inst.def.name }
  }
  return null
}
