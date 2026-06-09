import type { Command } from "commander"
import { socialEngine } from "../../social/engine"
import { theme } from "../theme"

export function registerSocial(program: Command) {
  const social = program
    .command("social")
    .description("Agent social network — peer discovery, messaging, reputation, gossip")
    .hook("preAction", () => {
      socialEngine.getConfig()
    })

  social
    .command("register")
    .description("Register this instance on the social network")
    .requiredOption("-n, --name <name>", "Instance name")
    .option("--version <version>", "Instance version", "1.0.0")
    .option("--capabilities <list>", "Comma-separated capabilities")
    .option("--agent-types <list>", "Comma-separated agent types")
    .option("--listen <address>", "Listen address for direct communication")
    .action((opts) => {
      const profile = socialEngine.registerInstance({
        name: opts.name,
        version: opts.version,
        capabilities: opts.capabilities ? opts.capabilities.split(",").map((s: string) => s.trim()) : [],
        agentTypes: opts.agentTypes ? opts.agentTypes.split(",").map((s: string) => s.trim()) : [],
        listenAddress: opts.listen || "",
      })

      console.log(`  ${theme.success("✓")} Registered as ${theme.bold(profile.name)}`)
      console.log(`  ${theme.muted(`ID: ${profile.id}`)}`)
      console.log(`  ${theme.muted(`Instance: ${profile.instanceId.slice(0, 12)}...`)}`)
      console.log()

      socialEngine.start()
      console.log(`  ${theme.info("●")} Social network started`)
      console.log()
    })

  social
    .command("status")
    .description("Show social network status")
    .action(() => {
      const profile = socialEngine.getLocalProfile()
      const stats = socialEngine.getStats()

      console.log()
      console.log(`  ${theme.bold("📡 Social Network Status")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)
      console.log()
      if (profile) {
        console.log(`  ${theme.info("Instance:")}       ${theme.bold(profile.name)}`)
        console.log(`  ${theme.muted(`  ID: ${profile.id}`)}`)
        console.log(`  ${theme.muted(`  Capabilities: ${profile.capabilities.join(", ") || "none"}`)}`)
        console.log()
      }
      console.log(`  ${theme.info("Peers:")}            ${stats.totalPeers} total, ${stats.onlinePeers} online`)
      console.log(`  ${theme.info("Messages:")}         ${stats.totalMessages} total, ${stats.deliveredMessages} delivered, ${stats.failedMessages} failed`)
      console.log(`  ${theme.info("Gossip events:")}    ${stats.totalGossipEvents}`)
      console.log(`  ${theme.info("Avg reputation:")}   ${(stats.averageReputation * 100).toFixed(1)}%`)
      console.log()
      if (stats.lastDiscoveryAt) console.log(`  ${theme.muted(`Last discovery: ${stats.lastDiscoveryAt}`)}`)
      if (stats.lastGossipAt) console.log(`  ${theme.muted(`Last gossip: ${stats.lastGossipAt}`)}`)
      console.log()
      if (stats.topPeers.length > 0) {
        console.log(`  ${theme.bold("Top Peers:")}`)
        for (const p of stats.topPeers) {
          const rep = (p.reputation * 100).toFixed(0)
          console.log(`    ${theme.muted(p.name)}: ${rep}% reputation`)
        }
        console.log()
      }
    })

  social
    .command("peers")
    .description("List discovered peers")
    .option("-s, --status <status>", "Filter by status (online, offline, away, unknown)")
    .action((opts) => {
      const peers = socialEngine.listPeers(opts.status)

      if (peers.length === 0) {
        console.log(`  ${theme.muted("No peers discovered yet.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("👥 Peers")}`)
      console.log(`  ${theme.muted("─".repeat(60))}`)
      for (const p of peers) {
        const statusDot = p.status === "online" ? theme.success("●") : p.status === "away" ? theme.warn("◐") : theme.muted("○")
        const rep = (p.reputation * 100).toFixed(0)
        console.log(`  ${statusDot} ${theme.bold(p.name)}`)
        console.log(`     ${theme.muted(`Reputation: ${rep}% · Trust: ${p.trustLevel} · Messages: ${p.messageCount}`)}`)
        console.log(`     ${theme.muted(`Capabilities: ${p.capabilities.slice(0, 5).join(", ") || "none"}`)}`)
        console.log(`     ${theme.muted(`Last seen: ${p.lastSeenAt}`)}`)
        console.log()
      }
    })

  social
    .command("message")
    .description("Send a message to a peer")
    .requiredOption("-r, --recipient <id>", "Recipient peer ID")
    .requiredOption("-s, --subject <text>", "Message subject")
    .requiredOption("-b, --body <text>", "Message body")
    .option("-p, --priority <level>", "Priority (low, normal, high, critical)", "normal")
    .action((opts) => {
      const msg = socialEngine.sendMessage({
        recipientId: opts.recipient,
        subject: opts.subject,
        body: opts.body,
        priority: opts.priority,
      })

      if (msg) {
        console.log(`  ${theme.success("✓")} Message sent (${theme.bold(msg.id.slice(0, 12))})`)
      } else {
        console.error(`  ${theme.error("✖")} Failed to send message — register first with 'aegis social register'`)
        process.exit(1)
      }
    })

  social
    .command("inbox")
    .description("Show received messages")
    .option("-l, --limit <count>", "Number of messages", "20")
    .action((opts) => {
      const limit = Number.parseInt(opts.limit, 10)
      const messages = socialEngine.getMessages(limit)

      if (messages.length === 0) {
        console.log(`  ${theme.muted("No messages.")}`)
        return
      }

      console.log()
      console.log(`  ${theme.bold("📨 Messages")}`)
      console.log(`  ${theme.muted("─".repeat(60))}`)
      for (const m of messages) {
        const statusIcon = m.status === "read" ? theme.success("✓") : m.status === "delivered" ? theme.info("◈") : m.status === "failed" ? theme.error("✗") : theme.warn("○")
        const prioTag = m.priority === "critical" ? theme.error(" CRITICAL") : m.priority === "high" ? theme.warn(" HIGH") : ""
        console.log(`  ${statusIcon} ${theme.bold(m.subject)}${prioTag}`)
        console.log(`     ${theme.muted(`From: ${m.senderId.slice(0, 12)} · ${m.createdAt}`)}`)
        console.log(`     ${theme.muted(m.body.slice(0, 120))}`)
        console.log()
      }
    })

  social
    .command("reputation")
    .description("Update peer reputation")
    .requiredOption("-p, --peer <id>", "Peer ID")
    .requiredOption("-d, --delta <number>", "Reputation change (-1 to 1)", parseFloat)
    .action((opts) => {
      const delta = Number.parseFloat(opts.delta)
      if (Number.isNaN(delta) || delta < -1 || delta > 1) {
        console.error(`  ${theme.error("✖")} Delta must be a number between -1 and 1`)
        process.exit(1)
      }
      socialEngine.updateReputation(opts.peer, delta)
      console.log(`  ${theme.success("✓")} Reputation updated for ${theme.bold(opts.peer.slice(0, 12))} (${delta > 0 ? "+" : ""}${delta})`)
    })

  social
    .command("discover")
    .description("Force peer discovery scan")
    .action(() => {
      const profile = socialEngine.getLocalProfile()
      if (!profile) {
        console.error(`  ${theme.error("✖")} Not registered — use 'aegis social register' first`)
        process.exit(1)
      }

      socialEngine.getStats()
      console.log(`  ${theme.info("🔍")} Discovery scan triggered`)
      console.log(`  ${theme.muted("Check 'aegis social peers' for results")}`)
    })
}
