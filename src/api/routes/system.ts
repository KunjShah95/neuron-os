import { readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { homedir } from "node:os"
import { agentManager } from "../../agent/manager"
import { soulManager } from "../../agent/soul"
import { jsonResponse } from "../security"
import { getWsHealth } from "../ws"
import type { ApiRequest, ApiServerConfig } from "../types"

let _version: string
try {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, "..", "..", "..", "package.json"), "utf-8")) as {
    version?: string
  }
  _version = String(pkg.version || "0.0.0")
} catch {
  _version = "0.0.0"
}

function getWarmPoolSize(): number {
  const mgr = agentManager as unknown as { getWarmPoolSize?: () => number }
  return typeof mgr.getWarmPoolSize === "function" ? mgr.getWarmPoolSize() : 0
}

export async function handleSystemRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  const { method, pathname } = req

  if ((pathname === "/api/v1/health" || pathname === "/health") && method === "GET") {
    const agentSouls = soulManager.list()
    const moodCounts: Record<string, number> = {}
    for (const { soul: s } of agentSouls) {
      moodCounts[s.mood.mood] = (moodCounts[s.mood.mood] ?? 0) + 1
    }

    const { PluginRegistry } = await import("../../plugin/registry")
    let pluginsInstalled = 0
    let registryReachable = false
    try {
      const reg = new PluginRegistry(join(homedir(), ".aegis", "plugins.db"))
      pluginsInstalled = reg.list().length
      reg.close()
      registryReachable = true
    } catch {
      /* non-fatal */
    }

    return jsonResponse(
      200,
      {
        status: "ok",
        version: _version,
        uptime: process.uptime(),
        agents: {
          total: agentManager.agents.size,
          running: agentManager.list().filter((a) => a.status === "running").length,
        },
        warmPool: {
          available: getWarmPoolSize(),
        },
        souls: {
          total: agentSouls.length,
          moodBreakdown: moodCounts,
        },
        plugins: {
          installed: pluginsInstalled,
          registryReachable,
        },
      },
      config,
      req,
    )
  }

  if (pathname === "/api/v1/metrics" && method === "GET") {
    const agentSouls = soulManager.list()
    const moodBreakdown: Record<string, number> = {}
    let totalMoodScore = 0
    for (const { soul: s } of agentSouls) {
      moodBreakdown[s.mood.mood] = (moodBreakdown[s.mood.mood] ?? 0) + 1
      const moodScore =
        s.mood.mood === "elated"
          ? 100
          : s.mood.mood === "confident"
            ? 80
            : s.mood.mood === "content"
              ? 60
              : s.mood.mood === "anxious"
                ? 40
                : s.mood.mood === "frustrated"
                  ? 20
                  : 0
      totalMoodScore += moodScore
    }
    const avgMoodScore = agentSouls.length > 0 ? totalMoodScore / agentSouls.length : 0

    const agents = agentManager.list()
    const totalAgents = agents.length
    const runningAgents = agents.filter((a) => a.status === "running").length

    const { PluginRegistry } = await import("../../plugin/registry")
    let pluginsInstalled = 0
    try {
      const reg = new PluginRegistry(join(homedir(), ".aegis", "plugins.db"))
      pluginsInstalled = reg.list().length
      reg.close()
    } catch {
      /* non-fatal */
    }

    return jsonResponse(
      200,
      {
        agents: { total: totalAgents, running: runningAgents },
        souls: { total: agentSouls.length, moodBreakdown, avgMoodScore: Math.round(avgMoodScore * 10) / 10 },
        plugins: { installed: pluginsInstalled },
        system: { uptime: process.uptime(), version: _version },
      },
      config,
      req,
    )
  }

  if (pathname === "/api/v1/souls" && method === "GET") {
    const souls = soulManager.list().map(({ agentId, soul: s }) => ({
      agentId,
      archetype: s.archetype,
      name: s.name,
      mood: s.mood.mood,
      moodEmoji: soulManager.getMoodEmoji(s.mood.mood),
      traits: s.traits.map((t) => ({ name: t.name, score: t.score })),
      adaptations: s.adaptations.length,
      lastEvolved: s.lastEvolved ?? null,
    }))
    return jsonResponse(200, { souls, total: souls.length }, config, req)
  }

  const soulMatch = pathname.match(/^\/api\/v1\/souls\/([^/]+)$/)
  if (soulMatch && soulMatch[1] && method === "GET") {
    const agentId = soulMatch[1]
    const entry = soulManager.get(agentId)
    if (!entry) {
      return jsonResponse(404, { error: `No soul found for agent "${agentId}"` }, config, req)
    }
    return jsonResponse(
      200,
      {
        agentId,
        archetype: entry.archetype,
        name: entry.name,
        mood: entry.mood.mood,
        moodEmoji: soulManager.getMoodEmoji(entry.mood.mood),
        traits: entry.traits.map((t) => ({ name: t.name, score: t.score })),
        adaptations: entry.adaptations.length,
        lastEvolved: entry.lastEvolved ?? null,
      },
      config,
      req,
    )
  }

  if (pathname === "/api/v1/projects" && method === "GET") {
    const { listProjects } = await import("../../project/context")
    const projects = listProjects()
    return jsonResponse(200, { projects }, config, req)
  }

  if (pathname === "/api/v1/ws/health" && method === "GET") {
    return jsonResponse(200, getWsHealth(), config, req)
  }

  if (pathname === "/api/v1/types" && method === "GET") {
    const { getAllAgentTypes } = await import("../../agent/agent-types")
    return jsonResponse(200, { types: getAllAgentTypes() }, config, req)
  }

  return null
}
