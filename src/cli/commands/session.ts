/**
 * session — SQLite session store CLI commands.
 *
 * Manage persisted agent sessions: list recent, view messages, resume.
 */

import type { Command } from "commander"
import { theme } from "../theme"

export function registerSession(program: Command) {
  const session = program.command("session").description("Manage persisted agent sessions from the SQLite store")

  // ── list ──────────────────────────────────────────────────────────
  session
    .command("list")
    .alias("ls")
    .description("List recent sessions")
    .option("-n, --count <n>", "Number of sessions to show", "10")
    .option("--status <status>", "Filter by status (active, completed, failed, paused)")
    .action(async (opts: { count?: string; status?: string }) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const count = parseInt(opts.count ?? "10", 10)
      const status = opts.status as "active" | "completed" | "failed" | "paused" | undefined
      const sessions = status ? sessionStore.listSessions(status) : sessionStore.restoreRecentSessions(count)

      if (sessions.length === 0) {
        console.log(theme.dim("  No sessions found."))
        console.log(theme.dim("  Sessions are created automatically when agents run."))
        return
      }

      console.log(theme.heading(`  Sessions (${sessions.length})`))
      console.log()

      for (const s of sessions) {
        const statusEmoji =
          s.status === "active"
            ? "🟢"
            : s.status === "completed"
              ? "✅"
              : s.status === "failed"
                ? "🔴"
                : s.status === "paused"
                  ? "⏸️"
                  : "⚪"

        const date = new Date(s.updatedAt).toLocaleString().slice(0, 16)
        const goal = s.goal.slice(0, 60) || "(no goal)"
        const name = s.name.slice(0, 40)

        console.log(`  ${statusEmoji} ${theme.bold(s.id.slice(0, 24))}`)
        console.log(`    name:    ${theme.dim(name)}`)
        console.log(`    goal:    ${theme.dim(goal)}`)
        console.log(`    status:  ${statusEmoji} ${s.status} · ${theme.dim(date)}`)
        console.log()
      }

      console.log(theme.dim("  Use `aegis session view <id>` to see messages"))
      console.log(theme.dim("  Use `aegis session resume <id>` to mark as active"))
    })

  // ── search ────────────────────────────────────────────────────────
  session
    .command("search <query>")
    .description("Search messages across all sessions")
    .option("-n, --limit <n>", "Max results", "20")
    .option("--role <role>", "Filter by role (user, assistant, system, tool)")
    .action(async (query: string, opts: { limit?: string; role?: string }) => {
      if (!query || query.trim().length === 0) {
        console.log(theme.error("  Search query cannot be empty."))
        return
      }

      const { sessionStore } = await import("../../memory/session-persistence")

      const limit = parseInt(opts.limit ?? "20", 10)
      const role = opts.role as "user" | "assistant" | "system" | "tool" | undefined
      const results = sessionStore.searchMessages(query, limit, role)

      if (results.length === 0) {
        console.log(theme.dim(`  No messages matching "${query}" found.`))
        return
      }

      console.log(theme.heading(`  Search results for "${query}" (${results.length})`))
      console.log()

      for (const { message, session: sess } of results) {
        const roleEmoji =
          message.role === "user" ? "👤" : message.role === "assistant" ? "🤖" : message.role === "system" ? "⚙️" : "🔧"

        const time = new Date(message.timestamp).toLocaleString().slice(0, 16)
        const statusEmoji =
          sess.status === "active" ? "🟢" : sess.status === "completed" ? "✅" : sess.status === "failed" ? "🔴" : "⏸️"

        // Show context around the match
        const content = message.content
        const idx = content.toLowerCase().indexOf(query.toLowerCase())
        let preview: string
        if (idx >= 0) {
          const start = Math.max(0, idx - 30)
          const end = Math.min(content.length, idx + query.length + 60)
          preview = (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "")
        } else {
          preview = content.slice(0, 120) + (content.length > 120 ? "…" : "")
        }

        console.log(`  ${roleEmoji} ${theme.bold(message.role)} · ${theme.dim(time)}`)
        console.log(
          `    session: ${statusEmoji} ${theme.dim(sess.name || sess.id.slice(0, 24))}  (${sess.id.slice(0, 16)}…)`,
        )
        console.log(`    match:   ${preview}`)
        console.log()
      }

      console.log(theme.dim(`  Use \`aegis session view <id>\` to see full context`))
    })

  // ── view ──────────────────────────────────────────────────────────
  session
    .command("view <sessionId>")
    .description("Show session details and messages")
    .option("-n, --limit <n>", "Number of messages to show", "30")
    .action(async (sessionId: string, opts: { limit?: string }) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const session = sessionStore.getSession(sessionId)
      if (!session) {
        console.log(theme.error(`  Session \"${sessionId}\" not found.`))
        console.log(theme.dim("  Use `aegis session list` to see available sessions."))
        process.exit(1)
      }

      const limit = parseInt(opts.limit ?? "30", 10)
      const messages = sessionStore.getMessages(sessionId, limit)
      const stats = sessionStore.getStats()

      const statusEmoji =
        session.status === "active"
          ? "🟢"
          : session.status === "completed"
            ? "✅"
            : session.status === "failed"
              ? "🔴"
              : "⏸️"

      console.log(theme.heading(`  Session: ${session.name}`))
      console.log()
      console.log(`  ${theme.bold("ID:")}       ${session.id}`)
      console.log(`  ${theme.bold("Status:")}   ${statusEmoji} ${session.status}`)
      console.log(`  ${theme.bold("Type:")}     ${session.agentType}`)
      console.log(`  ${theme.bold("Goal:")}     ${session.goal || "(no goal)"}`)
      console.log(`  ${theme.bold("Created:")}  ${new Date(session.createdAt).toLocaleString()}`)
      console.log(`  ${theme.bold("Updated:")}  ${new Date(session.updatedAt).toLocaleString()}`)
      console.log(`  ${theme.bold("Msgs:")}     ${messages.length} (of ${stats.totalMessages} total in DB)`)
      console.log()

      if (messages.length === 0) {
        console.log(theme.dim("  No messages in this session."))
        return
      }

      console.log(theme.heading(`  Messages (last ${messages.length})`))
      console.log()

      for (const msg of messages) {
        const roleEmoji =
          msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : msg.role === "system" ? "⚙️" : "🔧"
        const time = new Date(msg.timestamp).toLocaleTimeString().slice(0, 8)
        const content = msg.content.slice(0, 300)
        const lines = content.split("\n")

        console.log(`  ${roleEmoji} ${theme.bold(msg.role)} · ${theme.dim(time)}`)
        for (const line of lines.slice(0, 6)) {
          console.log(`    ${line.slice(0, 120)}`)
        }
        if (lines.length > 6 || content.length > 300) {
          console.log(`    ${theme.dim("… (truncated)")}`)
        }
        console.log()
      }
    })

  // ── fork ──────────────────────────────────────────────────────────
  session
    .command("fork <parentId>")
    .description("Fork a session at a checkpoint into a new branch")
    .option("-n, --name <name>", "Name for the forked session")
    .option("--goal <goal>", "New goal for the forked session")
    .option("--at <messageId>", "Message ID to fork at (default: last message)", parseInt)
    .action(async (parentId: string, opts: { name?: string; goal?: string; at?: number }) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const parent = sessionStore.getSession(parentId)
      if (!parent) {
        console.log(theme.error(`  Parent session "${parentId}" not found.`))
        console.log(theme.dim("  Use `aegis session list` to see available sessions."))
        process.exit(1)
      }

      console.log(theme.heading(`  Forking session: ${parent.name}`))
      console.log(`    parent:  ${theme.dim(parentId)}`)
      console.log(`    name:    ${theme.dim(opts.name || `${parent.name} (fork)`)}`)
      console.log(`    at msg:  ${theme.dim(opts.at ? `#${opts.at}` : "last message")}`)
      console.log()

      try {
        const fork = sessionStore.forkSession(parentId, {
          atMessageId: opts.at,
          name: opts.name,
          goal: opts.goal,
        })

        const forkParent = fork.parentSessionId ? ` (forked from ${fork.parentSessionId.slice(0, 24)})` : ""
        console.log(theme.success(`  ✓ Forked as "${fork.name}"`))
        console.log(`    id:       ${theme.dim(fork.id)}`)
        console.log(`    status:   🟢 active${forkParent}`)
        console.log(`    messages: ${theme.dim(`${sessionStore.getMessages(fork.id, 1).length} messages copied`)}`)
        console.log()
        console.log(theme.dim("  Use `aegis session view " + fork.id.slice(0, 24) + "...` to see messages."))
        console.log(theme.dim("  The original session is unchanged."))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(theme.error(`  Fork failed: ${msg}`))
        process.exit(1)
      }
    })

  // ── checkpoints ───────────────────────────────────────────────────
  session
    .command("checkpoint <sessionId> <messageId>")
    .description("Mark a message as a named checkpoint for later forking")
    .requiredOption("-n, --name <name>", "Descriptive name for this checkpoint")
    .action(async (sessionId: string, messageId: string, opts: { name: string }) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const session = sessionStore.getSession(sessionId)
      if (!session) {
        console.log(theme.error(`  Session "${sessionId}" not found.`))
        process.exit(1)
      }

      const msgId = parseInt(messageId, 10)
      if (isNaN(msgId)) {
        console.log(theme.error(`  Invalid message ID: "${messageId}". Must be a number.`))
        process.exit(1)
      }

      try {
        sessionStore.createCheckpoint(sessionId, msgId, opts.name)
        console.log(theme.success(`  ✓ Checkpoint "${opts.name}" created at message #${msgId}`))
        console.log()
        console.log(
          theme.dim(`  Use \`aegis session fork ${sessionId.slice(0, 24)}... --at ${msgId}\` to fork at this point.`),
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(theme.error(`  Checkpoint failed: ${msg}`))
        process.exit(1)
      }
    })

  // ── tree ──────────────────────────────────────────────────────────
  session
    .command("tree <sessionId>")
    .description("Show the full fork tree starting from a session")
    .action(async (sessionId: string) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const session = sessionStore.getSession(sessionId)
      if (!session) {
        console.log(theme.error(`  Session "${sessionId}" not found.`))
        process.exit(1)
      }

      const tree = sessionStore.getForkTree(sessionId)
      // tree always includes the root session; children are length > 1
      if (tree.length <= 1) {
        console.log(theme.dim(`  Session "${session.id}" has no forks.`))
        return
      }

      console.log(theme.heading(`  Fork Tree (${tree.length} sessions)`))
      console.log()

      for (const s of tree) {
        const indent = s.parentSessionId ? "  └─ " : "  "
        const statusEmoji =
          s.status === "active" ? "🟢" : s.status === "completed" ? "✅" : s.status === "failed" ? "🔴" : "⏸️"

        const parentInfo = s.parentSessionId ? theme.dim(` (fork of ${s.parentSessionId.slice(0, 24)}…)`) : ""

        console.log(`  ${indent}${statusEmoji} ${theme.bold(s.name)}`)
        console.log(`    id:     ${theme.dim(s.id.slice(0, 32))}${parentInfo}`)
        console.log(`    goal:   ${theme.dim((s.goal || "(no goal)").slice(0, 60))}`)
        if (s.checkpointName) {
          console.log(`    cp:     ${theme.dim(`@ "${s.checkpointName}" (msg #${s.checkpointId})`)}`)
        }
        console.log()
      }
    })

  // ── merge ─────────────────────────────────────────────────────────
  session
    .command("merge <sourceId> <targetId>")
    .description("Merge messages from one session into another")
    .action(async (sourceId: string, targetId: string) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const source = sessionStore.getSession(sourceId)
      if (!source) {
        console.log(theme.error(`  Source session "${sourceId}" not found.`))
        process.exit(1)
      }
      const target = sessionStore.getSession(targetId)
      if (!target) {
        console.log(theme.error(`  Target session "${targetId}" not found.`))
        process.exit(1)
      }

      const sourceMsgs = sessionStore.getMessages(sourceId, 10_000)
      console.log(theme.heading(`  Merging sessions`))
      console.log(`  source: ${theme.dim(source.name)} (${sourceMsgs.length} messages)`)
      console.log(`  target: ${theme.dim(target.name)}`)
      console.log()

      try {
        sessionStore.mergeSession(sourceId, targetId)
        console.log(theme.success(`  ✓ Merged ${sourceMsgs.length} messages into "${target.name}"`))
        console.log(theme.dim(`  Source session "${sourceId}" marked as completed.`))
        console.log(theme.dim(`  Use \`aegis session view ${targetId.slice(0, 24)}...\` to see merged messages.`))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(theme.error(`  Merge failed: ${msg}`))
        process.exit(1)
      }
    })

  // ── resume ────────────────────────────────────────────────────────
  session
    .command("resume <sessionId>")
    .description("Mark a session as active (useful for restoring paused sessions)")
    .action(async (sessionId: string) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const result = sessionStore.resumeSession(sessionId)
      if (!result) {
        console.log(theme.error(`  Session \"${sessionId}\" not found.`))
        console.log(theme.dim("  Use `aegis session list` to see available sessions."))
        process.exit(1)
      }

      console.log(theme.success(`  ✓ Session \"${result.session.name}\" resumed`))
      console.log(`    id:       ${theme.dim(result.session.id)}`)
      console.log(`    status:   🟢 active`)
      console.log(`    messages: ${result.messages.length} available`)
      console.log()
      console.log(theme.dim("  This session will now appear as active in the store."))
      console.log(theme.dim("  Use `aegis session view <id>` to see messages."))
    })

  // ── export ────────────────────────────────────────────────────────
  session
    .command("export <sessionId>")
    .description("Export session messages as JSON for analysis")
    .option("-f, --format <format>", "Output format", "json")
    .action(async (sessionId: string, opts: { format?: string }) => {
      if (opts.format && opts.format !== "json") {
        console.log(theme.error(`  Unsupported format: "${opts.format}". Only "json" is supported.`))
        process.exit(1)
      }

      const { sessionStore } = await import("../../memory/session-persistence")

      const session = sessionStore.getSession(sessionId)
      if (!session) {
        console.log(theme.error(`  Session "${sessionId}" not found.`))
        console.log(theme.dim("  Use `aegis session list` to see available sessions."))
        process.exit(1)
      }

      const messages = sessionStore.getMessages(sessionId, 10000)

      function safeParseJson(raw: string): unknown {
        try {
          return JSON.parse(raw)
        } catch {
          return raw
        }
      }

      const output = {
        version: 1,
        exportedAt: new Date().toISOString(),
        session: {
          id: session.id,
          name: session.name,
          agentType: session.agentType,
          goal: session.goal,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          metadata: session.metadata,
        },
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          toolCalls: m.toolCalls ? safeParseJson(m.toolCalls) : undefined,
        })),
        messageCount: messages.length,
      }

      console.log(JSON.stringify(output, null, 2))
    })

  // ── prune ────────────────────────────────────────────────────────
  session
    .command("prune")
    .description("Delete old sessions from the store")
    .requiredOption("--older-than <duration>", "Age threshold (e.g. 7d, 30d, 24h, 90m)")
    .option("--dry-run", "Show what would be deleted without actually deleting")
    .action(async (opts: { olderThan: string; dryRun?: boolean }) => {
      const match = opts.olderThan.match(/^(\d+)([dhms])$/)
      if (!match) {
        console.log(theme.error(`  Invalid duration: "${opts.olderThan}". Use format like 7d, 30d, 24h, 90m.`))
        process.exit(1)
      }

      const value = parseInt(match[1] ?? "0", 10)
      const unit = match[2] ?? "d"
      const multipliers: Record<string, number> = {
        d: 86_400_000,
        h: 3_600_000,
        m: 60_000,
        s: 1_000,
      }
      const olderThanMs = value * (multipliers[unit] ?? 86_400_000)

      const { sessionStore } = await import("../../memory/session-persistence")

      // Count candidates first
      const cutoff = Date.now() - olderThanMs
      const toDelete = sessionStore.listSessions().filter((s) => s.updatedAt < cutoff)

      if (toDelete.length === 0) {
        console.log(theme.dim("  No sessions older than that threshold."))
        return
      }

      console.log(theme.warn(`  ${toDelete.length} session(s) to ${opts.dryRun ? "prune (dry-run)" : "delete"}:`))
      console.log()

      for (const s of toDelete) {
        const date = new Date(s.updatedAt).toLocaleString().slice(0, 16)
        const goal = s.goal.slice(0, 60) || "(no goal)"
        console.log(`    ╳ ${theme.dim(s.id.slice(0, 24))}  ${theme.dim(date)}  ${goal}`)
      }

      console.log()

      if (opts.dryRun) {
        console.log(theme.dim("  Run without --dry-run to actually delete these sessions."))
        return
      }

      const deleted = sessionStore.pruneSessions(olderThanMs)
      console.log(theme.success(`  ✓ ${deleted} session(s) pruned.`))
    })

  // ── delete ────────────────────────────────────────────────────────
  session
    .command("delete <sessionId>")
    .description("Delete a session and all its messages from the store")
    .action(async (sessionId: string) => {
      const { sessionStore } = await import("../../memory/session-persistence")

      const existing = sessionStore.getSession(sessionId)
      if (!existing) {
        console.log(theme.error(`  Session \"${sessionId}\" not found.`))
        process.exit(1)
      }

      sessionStore.deleteSession(sessionId)
      console.log(theme.warn(`  ✗ Session \"${existing.name}\" deleted`))
      console.log(`    id: ${theme.dim(sessionId)}`)
    })

  // ── session create <name> ─────────────────────────────────────────
  session
    .command("create")
    .description("Create a new shared multi-user session")
    .argument("<name>", "Session name")
    .action(async (name: string) => {
      try {
        const { SessionManager } = await import("../../session/manager")
        const manager = new SessionManager()
        const userId = process.env.USER || process.env.USERNAME || "anonymous"
        const s = manager.create(name, userId)
        console.log(theme.success(`  ✓ Created shared session "${s.name}"`))
        console.log(`    id:   ${theme.dim(s.id)}`)
        console.log(`    name: ${theme.dim(s.name)}`)
        console.log()
        console.log(theme.dim("  Join with: aegis session join " + s.id))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(theme.error(`  Create failed: ${msg}`))
        process.exit(1)
      }
    })

  // ── session join <id> ────────────────────────────────────────────
  session
    .command("join")
    .description("Join an existing shared session")
    .argument("<id>", "Session ID to join")
    .action(async (id: string) => {
      try {
        const { SessionManager } = await import("../../session/manager")
        const manager = new SessionManager()
        const s = manager.get(id)
        if (!s) {
          console.log(theme.error(`  Session "${id}" not found.`))
          console.log(theme.dim("  Use 'aegis session list-shared' to see active sessions."))
          process.exit(1)
        }
        if (s.status !== "active") {
          console.log(theme.warn(`  Session "${s.name}" is ${s.status}. Cannot join.`))
          process.exit(1)
        }
        const userId = process.env.USER || process.env.USERNAME || "anonymous"
        manager.joinUser(s.id, userId)
        console.log(theme.success(`  ✓ Joined shared session "${s.name}"`))
        console.log(`    id:    ${theme.dim(s.id)}`)
        console.log(`    users: ${theme.dim(s.users)}`)
        console.log()
        console.log(theme.dim("  Agent activity in this session will be streamed via WebSocket."))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(theme.error(`  Join failed: ${msg}`))
        process.exit(1)
      }
    })

  // ── session list-shared ──────────────────────────────────────────
  session
    .command("list-shared")
    .description("List active shared multi-user sessions")
    .action(async () => {
      try {
        const { SessionManager } = await import("../../session/manager")
        const manager = new SessionManager()
        const sessions = manager.list()

        if (sessions.length === 0) {
          console.log(theme.dim("  No active shared sessions."))
          console.log(theme.dim("  Create one with: aegis session create <name>"))
          return
        }

        console.log(theme.heading(`  Active Shared Sessions (${sessions.length})`))
        console.log()

        for (const s of sessions) {
          const users = JSON.parse(s.users) as string[]
          const agents = JSON.parse(s.agents) as string[]
          console.log(`  ${theme.bold(s.name)}`)
          console.log(`    id:     ${theme.dim(s.id)}`)
          console.log(`    users:  ${theme.dim(users.join(", ") || "(none)")}`)
          console.log(`    agents: ${theme.dim(agents.length.toString())}`)
          console.log(`    since:  ${theme.dim(new Date(s.created_at * 1000).toLocaleString())}`)
          console.log()
        }

        console.log(theme.dim("  Join with: aegis session join <id>"))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(theme.error(`  List failed: ${msg}`))
        process.exit(1)
      }
    })
}
