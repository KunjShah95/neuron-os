import { describe, it, expect } from "bun:test"

// ── Dashboard TUI Smoke Tests ─────────────────────────────────────────
// Tests all src/tui/*.ts modules without requiring a TTY.

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

function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, "")
}

describe("Dashboard Tests", () => {

  // ══════════════════════════════════════════════════════════════════
  //  1. Layout
  // ══════════════════════════════════════════════════════════════════

  it("should calculate layout correctly", () => {
    const layout = calculateLayout(24, 100)
    expect(layout.header.height).toBe(1)
    expect(layout.header.y).toBe(0)
    expect(layout.header.width).toBe(100)
    expect(layout.status.height).toBe(1)
    expect(layout.command.height).toBe(1)

    const contentHeight = 24 - 1 - 1 - 1
    expect(layout.agents.height).toBe(contentHeight)
    expect(layout.log.height).toBe(contentHeight)

    const expectedAgentsWidth = Math.min(30, Math.max(10, Math.floor(100 * 0.25)))
    expect(layout.agents.width).toBe(expectedAgentsWidth)
    expect(layout.log.width).toBe(100 - expectedAgentsWidth - 1)

    // Small terminal
    const smallLayout = calculateLayout(10, 40)
    expect(smallLayout.agents.height >= 1).toBe(true)
    expect(smallLayout.log.height >= 1).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  2. Header
  // ══════════════════════════════════════════════════════════════════

  it("should render header correctly", () => {
    const headerText = renderHeader({ x: 0, y: 0, width: 100, height: 1 })
    const headerPlain = stripAnsi(headerText)
    expect(headerPlain.startsWith("\u256d")).toBe(true)
    expect(headerPlain.endsWith("\u256e")).toBe(true)
    expect(headerPlain.includes("AEGIS DASHBOARD")).toBe(true)
    expect(headerPlain.includes("Ctrl+Q")).toBe(true)
    expect(headerPlain.length).toBe(100)
  })

  // ══════════════════════════════════════════════════════════════════
  //  3. Agent List
  // ══════════════════════════════════════════════════════════════════

  it("should render agent list", () => {
    const emptyState = createInitialState()
    emptyState.agents.clear()
    const agentRegion: Region = { x: 0, y: 1, width: 25, height: 20 }

    const agentLines = renderAgentList(emptyState, agentRegion)
    expect(agentLines.length >= 2).toBe(true)
    expect(stripAnsi(agentLines[0]!).includes("AGENTS")).toBe(true)
    expect(stripAnsi(agentLines[agentLines.length - 1]!).includes("No agents")).toBe(true)

    // Populated agent list
    const populatedState = createInitialState()
    populatedState.agents.set("agent-1", {
      id: "agent-1", name: "test-agent", status: "running",
      lastActivity: new Date().toLocaleTimeString(), pid: 1234,
    })
    populatedState.agents.set("agent-2", {
      id: "agent-2", name: "idle-agent", status: "idle",
      lastActivity: new Date().toLocaleTimeString(), pid: 5678,
    })

    const populatedLines = renderAgentList(populatedState, agentRegion)
    expect(stripAnsi(populatedLines.join("")).includes("test-agent")).toBe(true)
    expect(stripAnsi(populatedLines.join("")).includes("idle-agent")).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  4. Activity Log
  // ══════════════════════════════════════════════════════════════════

  it("should render activity log", () => {
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
    expect(logLines.length).toBe(10)
    const logText = stripAnsi(logLines.join(""))
    expect(logText.includes("info message")).toBe(true)
    expect(logText.includes("success message")).toBe(true)
    expect(logText.includes("warning message")).toBe(true)
    expect(logText.includes("error message")).toBe(true)
    expect(logText.includes("event message")).toBe(true)
  })

  it("should handle log scrolling", () => {
    const scrollState = createInitialState()
    scrollState.log = []
    for (let i = 0; i < 20; i++) {
      scrollState.log.push({ timestamp: `${i}:00`, text: `entry-${i}`, type: "info" })
    }
    const scrollLogRegion: Region = { x: 25, y: 1, width: 74, height: 10 }

    const noScrollLines = renderActivityLog(scrollState, scrollLogRegion)
    const noScrollText = stripAnsi(noScrollLines.join(""))
    expect(noScrollText.includes("entry-11")).toBe(true)
    expect(!noScrollText.includes("entry-5")).toBe(true)

    scrollState.ui.logScroll = 5
    const scrolledLines = renderActivityLog(scrollState, scrollLogRegion)
    const scrolledText = stripAnsi(scrolledLines.join(""))
    expect(scrolledText.includes("entry-6")).toBe(true)
    expect(!scrolledText.includes("entry-0")).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  5. Status Bar
  // ══════════════════════════════════════════════════════════════════

  it("should render status bar", () => {
    const statusState = createInitialState()
    statusState.metrics = { memPercent: 7, cpuPercent: 0, sessionCount: 1, uptime: 42 }
    const statusRegion: Region = { x: 0, y: 22, width: 100, height: 1 }
    const statusText = renderStatusBar(statusState, statusRegion)
    const statusPlain = stripAnsi(statusText)
    expect(statusPlain.includes("MEM:7%")).toBe(true)
    expect(statusPlain.includes("CPU:0%")).toBe(true)
    expect(statusPlain.includes("SESS:1")).toBe(true)
    expect(statusPlain.includes("UP:0m") || statusPlain.includes("UPTIME:")).toBe(true)
    expect(statusPlain.length <= 100).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  6. Command Bar
  // ══════════════════════════════════════════════════════════════════

  it("should render command bar", () => {
    const cmdState = createInitialState()
    cmdState.ui.input = "spawn test-agent"
    const cmdRegion: Region = { x: 0, y: 23, width: 100, height: 1 }
    const cmdText = renderCommandBar(cmdState, cmdRegion)
    const cmdPlain = stripAnsi(cmdText)
    expect(cmdPlain.startsWith("$ ")).toBe(true)
    expect(cmdPlain.includes("spawn test-agent")).toBe(true)
    expect(cmdPlain.length <= 100).toBe(true)

    cmdState.ui.input = ""
    const emptyCmd = renderCommandBar(cmdState, cmdRegion)
    expect(stripAnsi(emptyCmd).startsWith("$ ")).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  7. Store Mutations
  // ══════════════════════════════════════════════════════════════════

  it("should initialize store state correctly", () => {
    const storeTest = createInitialState()
    expect(storeTest.agents.size).toBe(1)
    expect(storeTest.log.length).toBe(1)
    expect(storeTest.dirty).toBe(true)
    expect(storeTest.ui.focus).toBe("command")
    expect(storeTest.ui.input).toBe("")
  })

  it("should handle log entries", () => {
    const storeTest = createInitialState()
    addLogEntry(storeTest, { text: "test entry", type: "info" })
    expect(storeTest.log.length).toBe(2)
    expect(storeTest.log[1]?.text).toBe("test entry")
    expect(storeTest.ui.logScroll).toBe(0)
  })

  it("should update metrics", () => {
    const storeTest = createInitialState()
    updateMetrics(storeTest)
    expect(typeof storeTest.metrics.memPercent === "number").toBe(true)
    expect(storeTest.metrics.uptime >= 0).toBe(true)
  })

  it("should update agent status", () => {
    const storeTest = createInitialState()
    const agent = storeTest.agents.get("main")
    expect(agent !== undefined).toBe(true)
    setAgentStatus(storeTest, "main", "running", "autocomplete")
    expect(agent!.status).toBe("running")
    expect(agent!.currentTool).toBe("autocomplete")
  })

  it("should cap log at 1000 entries", () => {
    const storeTest = createInitialState()
    for (let i = 0; i < 1005; i++) {
      addLogEntry(storeTest, { text: `entry-${i}`, type: "info" })
    }
    expect(storeTest.log.length <= 1000).toBe(true)
  })
})
