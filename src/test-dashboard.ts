// ── Dashboard TUI Smoke Tests ─────────────────────────────────────────
// Tests all src/tui/*.ts modules without requiring a TTY.
// Style: pure assertion-based, no test framework dependency.

import { calculateLayout } from "./tui/layout"
import type { Region } from "./tui/layout"
import { renderHeader } from "./tui/components/header"
import { renderAgentList } from "./tui/components/agent-list"
import { renderActivityLog } from "./tui/components/activity-log"
import { renderStatusBar } from "./tui/components/status-bar"
import { renderCommandBar } from "./tui/components/command-bar"
import {
  createInitialState,
  addLogEntry,
  updateMetrics,
  setAgentStatus,
} from "./tui/store"
import type { AppState } from "./tui/store"

let passed = 0
let failed = 0

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label}`)
  }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

// ══════════════════════════════════════════════════════════════════════
//  1. Layout
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Layout ===")

const layout = calculateLayout(24, 100)
assertEqual(layout.header.height, 1, "header height = 1")
assertEqual(layout.header.y, 0, "header y = 0")
assertEqual(layout.header.width, 100, "header width = 100")

assertEqual(layout.status.height, 1, "status height = 1")
assertEqual(layout.command.height, 1, "command height = 1")

const contentHeight = 24 - 1 - 1 - 1 // header, status, command
assertEqual(layout.agents.height, contentHeight, "agents fills remaining space")
assertEqual(layout.log.height, contentHeight, "log fills remaining space")

const expectedAgentsWidth = Math.min(30, Math.max(10, Math.floor(100 * 0.25)))
assertEqual(layout.agents.width, expectedAgentsWidth, "agents width = 25% capped at 30")
assertEqual(layout.log.width, 100 - expectedAgentsWidth - 1, "log fills rest minus divider")

// Small terminal (40x10)
const smallLayout = calculateLayout(10, 40)
assert(smallLayout.agents.height >= 1, "small terminal: agents has at least 1 row")
assert(smallLayout.log.height >= 1, "small terminal: log has at least 1 row")

// ══════════════════════════════════════════════════════════════════════
//  2. Header
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Header ===")

const headerText = renderHeader({ x: 0, y: 0, width: 100, height: 1 })
const headerPlain = stripAnsi(headerText)
assert(headerPlain.startsWith("\u256d"), "header starts with ╭")
assert(headerPlain.endsWith("\u256e"), "header ends with ╮")
assert(headerPlain.includes("AEGIS DASHBOARD"), "header contains title")
assert(headerPlain.includes("Ctrl+Q"), "header contains quit hint")
assertEqual(headerPlain.length, 100, "header is exactly terminal width")

// ══════════════════════════════════════════════════════════════════════
//  3. Agent List
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Agent List ===")

const emptyState = createInitialState()
emptyState.agents.clear()
const agentRegion: Region = { x: 0, y: 1, width: 25, height: 20 }

const agentLines = renderAgentList(emptyState, agentRegion)
assert(agentLines.length >= 2, "agent list renders at least 2 lines (header + empty msg)")
assert(stripAnsi(agentLines[0]!).includes("AGENTS"), "agent list shows 'AGENTS' heading")
assert(stripAnsi(agentLines[agentLines.length - 1]!).includes("No agents"), "empty state shows 'No agents running'")

// Populated agent list
const populatedState = createInitialState()
populatedState.agents.set("agent-1", {
  id: "agent-1",
  name: "test-agent",
  status: "running",
  lastActivity: new Date().toLocaleTimeString(),
  pid: 1234,
})
populatedState.agents.set("agent-2", {
  id: "agent-2",
  name: "idle-agent",
  status: "idle",
  lastActivity: new Date().toLocaleTimeString(),
  pid: 5678,
})

const populatedLines = renderAgentList(populatedState, agentRegion)
assert(stripAnsi(populatedLines.join("")).includes("test-agent"), "populated list shows 'test-agent'")
assert(stripAnsi(populatedLines.join("")).includes("idle-agent"), "populated list shows 'idle-agent'")

// ══════════════════════════════════════════════════════════════════════
//  4. Activity Log
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Activity Log ===")

const logState = createInitialState()
logState.log = [
  { timestamp: "12:00", text: "info message", type: "info" },
  { timestamp: "12:01", text: "success message", type: "success" },
  { timestamp: "12:02", text: "warning message", type: "warn" },
  { timestamp: "12:03", text: "error message", type: "error" },
  { timestamp: "12:04", text: "event message", type: "event" },
]
const logRegion: Region = { x: 25, y: 1, width: 74, height: 10 }

const logLines = renderActivityLog(logState, logRegion)
assertEqual(logLines.length, 10, "activity log fills 10 rows")
const logText = stripAnsi(logLines.join(""))
assert(logText.includes("info message"), "info message rendered")
assert(logText.includes("success message"), "success message rendered")
assert(logText.includes("warning message"), "warn message rendered")
assert(logText.includes("error message"), "error message rendered")
assert(logText.includes("event message"), "event message rendered")

// Log scrolling — need more entries than visible rows to demonstrate scrolling
const scrollState = createInitialState()
scrollState.log = []
for (let i = 0; i < 20; i++) {
  scrollState.log.push({ timestamp: `${i}:00`, text: `entry-${i}`, type: "info" })
}
const scrollLogRegion: Region = { x: 25, y: 1, width: 74, height: 10 }

// Without scroll, last 9 entries visible (entries 11-19)
const noScrollLines = renderActivityLog(scrollState, scrollLogRegion)
const noScrollText = stripAnsi(noScrollLines.join(""))
assert(noScrollText.includes("entry-11"), "no scroll: entry-11 visible")
assert(!noScrollText.includes("entry-5"), "no scroll: entry-5 hidden by overflow")

// Scroll down 5
scrollState.ui.logScroll = 5
const scrolledLines = renderActivityLog(scrollState, scrollLogRegion)
const scrolledText = stripAnsi(scrolledLines.join(""))
assert(scrolledText.includes("entry-6"), "scrolled 5: entry-6 visible")
assert(!scrolledText.includes("entry-0"), "scrolled 5: entry-0 hidden by scroll")

// ══════════════════════════════════════════════════════════════════════
//  5. Status Bar
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Status Bar ===")

const statusState = createInitialState()
statusState.metrics = { memPercent: 7, cpuPercent: 0, sessionCount: 1, uptime: 42 }
const statusRegion: Region = { x: 0, y: 22, width: 100, height: 1 }

const statusText = renderStatusBar(statusState, statusRegion)
const statusPlain = stripAnsi(statusText)
assert(statusPlain.includes("MEM:7%"), "status shows MEM")
assert(statusPlain.includes("CPU:0%"), "status shows CPU")
assert(statusPlain.includes("SESS:1"), "status shows SESS")
assert(statusPlain.includes("UP:0m") || statusPlain.includes("UPTIME:"), "status shows UPTIME")
assert(statusPlain.length <= 100, "status fits in 100 cols")

// ══════════════════════════════════════════════════════════════════════
//  6. Command Bar
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Command Bar ===")

const cmdState = createInitialState()
cmdState.ui.input = "spawn test-agent"
const cmdRegion: Region = { x: 0, y: 23, width: 100, height: 1 }

const cmdText = renderCommandBar(cmdState, cmdRegion)
const cmdPlain = stripAnsi(cmdText)
assert(cmdPlain.startsWith("$ "), "command bar starts with $ prompt")
assert(cmdPlain.includes("spawn test-agent"), "command bar shows input text")
assert(cmdPlain.length <= 100, "command bar fits in 100 cols")

// Empty input
cmdState.ui.input = ""
const emptyCmd = renderCommandBar(cmdState, cmdRegion)
assert(stripAnsi(emptyCmd).startsWith("$ "), "empty command bar still shows prompt")

// ══════════════════════════════════════════════════════════════════════
//  7. Store Mutations
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Store ===")

const storeTest = createInitialState()
assertEqual(storeTest.agents.size, 1, "initial state has 1 agent (main)")
assertEqual(storeTest.log.length, 1, "initial state has 1 log entry")
assert(storeTest.dirty, "initial state is dirty")
assertEqual(storeTest.ui.focus, "command", "initial focus = command")
assertEqual(storeTest.ui.input, "", "initial input = empty")

// Add log entries
addLogEntry(storeTest, { text: "test entry", type: "info" })
assertEqual(storeTest.log.length, 2, "addLogEntry adds entry")
assertEqual(storeTest.log[1]?.text, "test entry", "log entry text matches")
assertEqual(storeTest.ui.logScroll, 0, "log scroll reset to 0")

// Metrics
const metricsBefore = storeTest.metrics.memPercent
updateMetrics(storeTest)
assert(typeof storeTest.metrics.memPercent === "number", "metrics update sets memPercent")
assert(storeTest.metrics.uptime >= 0, "metrics update sets uptime")

// Agent status mutation
const agent = storeTest.agents.get("main")
assert(agent !== undefined, "main agent exists")
setAgentStatus(storeTest, "main", "running", "autocomplete")
assertEqual(agent!.status, "running", "setAgentStatus changes status")
assertEqual(agent!.currentTool, "autocomplete", "setAgentStatus sets currentTool")

// Log capped at 1000
for (let i = 0; i < 1005; i++) {
  addLogEntry(storeTest, { text: `entry-${i}`, type: "info" })
}
assert(storeTest.log.length <= 1000, "log capped at 1000 entries")

// ══════════════════════════════════════════════════════════════════════
//  Summary
// ══════════════════════════════════════════════════════════════════════

console.log("")
console.log(`Tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
