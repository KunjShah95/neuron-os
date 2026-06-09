# Observability Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add system observability via extended health API, new metrics/souls endpoints, and CLI commands.

**Architecture:** Extend existing API server (`src/api/server.ts`) with richer health data and new endpoints. CLI commands wrap the API with local fallback when the server isn't running. No new collector infrastructure — aggregate directly from existing `AgentManager`, `SoulManager`, `PluginRegistry`, `SLOManager`.

**Tech Stack:** TypeScript, existing Commander CLI, existing Bun HTTP server (zero deps)

---

### Task 1: Enhanced health handler

**Files:**
- Modify: `src/api/server.ts:395-416`

- [ ] **Step 1: Read current health handler**

Run: `Get-Content src/api/server.ts -Tail 600 | Select-String -Pattern "health|Health" -Context 0,3`
Expected: See the existing health handler at `/api/v1/health` returning `{ status, version, uptime, agents }`

- [ ] **Step 2: Replace health handler with enhanced version**

Replace lines 399-416 with:

```typescript
  // ── Health ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/health" && method === "GET") {
    const agentSouls = soulManager.list()
    const moodCounts: Record<string, number> = {}
    for (const { soul: s } of agentSouls) {
      moodCounts[s.mood.mood] = (moodCounts[s.mood.mood] ?? 0) + 1
    }

    const { PluginRegistry } = await import("../plugin/registry")
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
          available: typeof agentManager.getWarmPoolSize === "function" ? agentManager.getWarmPoolSize() : 0,
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
```

- [ ] **Step 3: Verify imports are present at top of file**

Run: `Select-String "soulManager|homedir|join" src/api/server.ts | Select-Object -First 5`
Expected: `soulManager` imported from `../agent/soul`, `homedir` from `os`, `join` from `path`. If missing, add:

```typescript
import { soulManager } from "../agent/soul"
import { homedir } from "node:os"
import { join } from "node:path"
```

- [ ] **Step 4: Typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: Only pre-existing signer.ts errors

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts
git commit -m "feat(observability): enhance /api/v1/health with souls, plugins, warm pool"
```

---

### Task 2: Metrics endpoint

**Files:**
- Modify: `src/api/server.ts`
- (add `/api/v1/metrics` handler after the health handler)

- [ ] **Step 1: Add metrics handler after the health handler**

After the health handler (after the closing `}` of the health block), add:

```typescript
  // ── Metrics ─────────────────────────────────────────────────────────

  if (pathname === "/api/v1/metrics" && method === "GET") {
    const agentSouls = soulManager.list()
    const moodBreakdown: Record<string, number> = {}
    let totalMoodScore = 0
    for (const { soul: s } of agentSouls) {
      moodBreakdown[s.mood.mood] = (moodBreakdown[s.mood.mood] ?? 0) + 1
      const moodScore = s.mood.mood === "elated" ? 100 : s.mood.mood === "confident" ? 80 : s.mood.mood === "content" ? 60 : s.mood.mood === "anxious" ? 40 : s.mood.mood === "frustrated" ? 20 : 0
      totalMoodScore += moodScore
    }
    const avgMoodScore = agentSouls.length > 0 ? totalMoodScore / agentSouls.length : 0

    const agents = agentManager.list()
    const totalAgents = agents.length
    const runningAgents = agents.filter((a) => a.status === "running").length

    const { PluginRegistry } = await import("../plugin/registry")
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
```

- [ ] **Step 2: Typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: Only pre-existing signer.ts errors

- [ ] **Step 3: Commit**

```bash
git add src/api/server.ts
git commit -m "feat(observability): add /api/v1/metrics endpoint"
```

---

### Task 3: Souls API endpoints

**Files:**
- Modify: `src/api/server.ts`

- [ ] **Step 1: Add souls list handler after the metrics handler**

Add after the metrics block:

```typescript
  // ── Souls ───────────────────────────────────────────────────────────

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

  // ── Single Soul ─────────────────────────────────────────────────────

  const soulMatch = pathname.match(/^\/api\/v1\/souls\/(.+)$/)
  if (soulMatch && method === "GET") {
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
        adaptations: entry.adaptations,
        lastEvolved: entry.lastEvolved ?? null,
      },
      config,
      req,
    )
  }
```

**Placement note:** The single soul regex match (`/api/v1/souls/:id`) must come after the `/api/v1/souls` exact match. Both must be placed before the fallback 404 handler.

- [ ] **Step 2: Typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: Only pre-existing signer.ts errors

- [ ] **Step 3: Commit**

```bash
git add src/api/server.ts
git commit -m "feat(observability): add /api/v1/souls and /api/v1/souls/:id endpoints"
```

---

### Task 4: `aegis health` CLI command

**Files:**
- Create: `src/cli/commands/health.ts`
- Modify: `src/cli/commands/index.ts`

- [ ] **Step 1: Create health command**

```typescript
import type { Command } from "commander"
import { theme } from "../theme"
import { createLogger } from "../logger"
import { agentManager } from "../../agent/manager"
import { soulManager } from "../../agent/soul"

const log = createLogger("cli:health")

function tryFetch(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

export function registerHealth(program: Command) {
  program
    .command("health")
    .description("Show system health overview")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const data = await tryFetch("http://localhost:8080/api/v1/health")
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2))
          return
        }
        const d = data as Record<string, unknown>
        console.log()
        console.log(`  ${theme.bold("System Health")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Status:")}   ${theme.success("✓ OK")}  (v${d.version as string})`)
        console.log(`  ${theme.info("Uptime:")}   ${Math.floor((d.uptime as number) / 60)}m`)
        const agents = d.agents as Record<string, number>
        console.log(`  ${theme.info("Agents:")}   ${agents.running}/${agents.total} running`)
        const souls = d.souls as Record<string, unknown>
        console.log(`  ${theme.info("Souls:")}    ${souls.total} registered`)
        const plugins = d.plugins as Record<string, unknown>
        console.log(`  ${theme.info("Plugins:")}  ${plugins.installed} installed`)
        console.log()
      } catch {
        // Fallback: local data
        if (opts.json) {
          const souls = soulManager.list()
          const agents = agentManager.list()
          console.log(JSON.stringify({
            status: "ok",
            agents: { total: agents.length, running: agents.filter((a) => a.status === "running").length },
            souls: { total: souls.length },
          }, null, 2))
          return
        }

        const souls = soulManager.list()
        const agents = agentManager.list()
        const running = agents.filter((a) => a.status === "running").length
        console.log()
        console.log(`  ${theme.bold("System Health")} ${theme.muted("(local)")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Status:")}   ${theme.success("✓ OK")}`)
        console.log(`  ${theme.info("Agents:")}   ${running}/${agents.length} running`)
        console.log(`  ${theme.info("Souls:")}    ${souls.length} registered`)
        console.log()
      }
    })
}
```

- [ ] **Step 2: Register in index.ts**

Add import line after existing imports:
```typescript
import { registerHealth } from "./health"
```

Add registration call after `registerEvolve(program)` or near other commands:
```typescript
  registerHealth(program)
```

- [ ] **Step 3: Typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: Only pre-existing signer.ts errors

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/health.ts src/cli/commands/index.ts
git commit -m "feat(cli): add aegis health command"
```

---

### Task 5: `aegis metrics` CLI command

**Files:**
- Create: `src/cli/commands/metrics.ts`
- Modify: `src/cli/commands/index.ts`

- [ ] **Step 1: Create metrics command**

```typescript
import type { Command } from "commander"
import { theme } from "../theme"
import { createLogger } from "../logger"
import { agentManager } from "../../agent/manager"
import { soulManager } from "../../agent/soul"

const log = createLogger("cli:metrics")

function tryFetch(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

export function registerMetrics(program: Command) {
  program
    .command("metrics")
    .description("Show system metrics snapshot")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const data = await tryFetch("http://localhost:8080/api/v1/metrics")
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2))
          return
        }
        const d = data as Record<string, unknown>
        const agents = d.agents as Record<string, number>
        const souls = d.souls as Record<string, unknown>
        const plugins = d.plugins as Record<string, unknown>
        const system = d.system as Record<string, unknown>

        console.log()
        console.log(`  ${theme.bold("Metrics Snapshot")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Agents:")}   ${agents.total} total, ${agents.running} running`)
        console.log(`  ${theme.info("Souls:")}    ${souls.total} total, avg mood ${souls.avgMoodScore as number}/100`)
        console.log(`  ${theme.info("Plugins:")}  ${plugins.installed} installed`)
        console.log(`  ${theme.info("Uptime:")}   ${Math.floor((system.uptime as number) / 60)}m`)
        console.log(`  ${theme.info("Version:")}  ${system.version as string}`)
        console.log()
      } catch {
        // Fallback: local data
        if (opts.json) {
          const souls = soulManager.list()
          const agents = agentManager.list()
          console.log(JSON.stringify({
            agents: { total: agents.length, running: agents.filter((a) => a.status === "running").length },
            souls: { total: souls.length },
          }, null, 2))
          return
        }

        const souls = soulManager.list()
        const agents = agentManager.list()
        const running = agents.filter((a) => a.status === "running").length
        console.log()
        console.log(`  ${theme.bold("Metrics Snapshot")} ${theme.muted("(local)")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Agents:")}   ${agents.length} total, ${running} running`)
        console.log(`  ${theme.info("Souls:")}    ${souls.length} registered`)
        console.log()
      }
    })
}
```

- [ ] **Step 2: Register in index.ts**

Add import:
```typescript
import { registerMetrics } from "./metrics"
```

Add registration:
```typescript
  registerMetrics(program)
```

- [ ] **Step 3: Typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: Only pre-existing signer.ts errors

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/metrics.ts src/cli/commands/index.ts
git commit -m "feat(cli): add aegis metrics command"
```

---

### Task 6: `--json` flag for soul CLI

**Files:**
- Modify: `src/cli/commands/soul.ts`

- [ ] **Step 1: Add `--json` to soul list command**

Replace the soul list `.action(() => {` (line 16) with:

```typescript
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const souls = soulManager.list()

      if (opts.json) {
        console.log(JSON.stringify(souls.map(({ agentId, soul: s }) => ({
          agentId,
          archetype: s.archetype,
          name: s.name,
          mood: s.mood.mood,
          moodEmoji: soulManager.getMoodEmoji(s.mood.mood),
          traits: s.traits,
          adaptations: s.adaptations.length,
        })), null, 2))
        return
      }

      // ... rest of existing code unchanged
```

- [ ] **Step 2: Add `--json` to soul card command**

Replace the soul card `.action((agentId: string) => {` with:

```typescript
    .option("--json", "Output as JSON")
    .action((agentId: string, opts: { json?: boolean }) => {
      const entry = soulManager.get(agentId)
      if (!entry) {
        if (opts.json) {
          console.log(JSON.stringify({ error: `No soul found for agent "${agentId}"` }))
          process.exit(1)
        }
        console.error(`  ${theme.error("✖")} No soul found for agent "${agentId}"`)
        console.log(`  ${theme.muted("Run 'aegis soul list' to see all registered souls.")}`)
        process.exit(1)
      }

      if (opts.json) {
        console.log(JSON.stringify({
          agentId,
          archetype: entry.archetype,
          name: entry.name,
          mood: entry.mood.mood,
          moodEmoji: soulManager.getMoodEmoji(entry.mood.mood),
          traits: entry.traits,
          adaptations: entry.adaptations,
          lastEvolved: entry.lastEvolved,
        }, null, 2))
        return
      }

      // existing soul card display
      const card = soulManager.generateSoulCard(agentId)
      console.log()
      console.log(card)
      console.log()
    })
```

**Note:** Remove the old `.action((agentId: string) => {` that only takes a single string argument.

- [ ] **Step 3: Add `--json` to soul mood command**

Replace the soul mood `.action((agentId: string, opts: ...) => {` — add `--json` to the option declarations and handle JSON output for each path (set-success, set-failure, display).

- [ ] **Step 4: Typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: Only pre-existing signer.ts errors

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/soul.ts
git commit -m "feat(cli): add --json flag to aegis soul commands"
```

---

### Task 7: Integration test

**Files:**
- Create: `src/observability/observability.test.ts`

- [ ] **Step 1: Create integration test**

```typescript
import { describe, it, expect } from "bun:test"
import { agentManager } from "../agent/manager"
import { soulManager } from "../agent/soul"

describe("observability API", () => {
  it("soulManager list should be accessible", () => {
    const souls = soulManager.list()
    expect(Array.isArray(souls)).toBe(true)
  })

  it("agentManager list should be accessible", () => {
    const agents = agentManager.list()
    expect(Array.isArray(agents)).toBe(true)
  })

  it("getMoodEmoji should return string for valid moods", () => {
    const moods = ["elated", "confident", "content", "anxious", "frustrated", "burned_out"] as const
    for (const mood of moods) {
      const emoji = soulManager.getMoodEmoji(mood)
      expect(typeof emoji).toBe("string")
      expect(emoji.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test**

Run: `bun test src/observability/observability.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/observability/observability.test.ts
git commit -m "test: add observability integration test"
```

---

### Task 8: Final typecheck + verify

- [ ] **Step 1: Full typecheck**

Run: `bun run --bun tsc --noEmit 2>&1 | Select-String "error" | Select-String -NotMatch "node_modules|signer"`
Expected: No errors other than pre-existing signer.ts

- [ ] **Step 2: Run all tests**

Run: `bun test 2>&1 | Select-String -SimpleMatch "pass" | Select-Object -Last 5`
Expected: All tests pass

- [ ] **Step 3: Run observability tests specifically**

Run: `bun test src/observability/ 2>&1`
Expected: All pass
