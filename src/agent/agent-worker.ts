#!/usr/bin/env bun

import type { AgentIpcMessage } from "./types"
import { generateText, jsonSchema } from "ai"
import type { ToolSet } from "ai"

const HEARTBEAT_MS = 5_000
const AGENT_NAME = process.env.AEGIS_AGENT_NAME ?? "unnamed"
const AGENT_ID = process.env.AEGIS_AGENT_ID ?? "unknown"
const AGENT_TYPE = process.env.AEGIS_AGENT_TYPE
const SYSTEM_PROMPT = process.env.AEGIS_SYSTEM_PROMPT ?? "You are a helpful AI agent."
const MAX_TURNS = parseInt(process.env.AEGIS_MAX_TURNS ?? "20", 10)

let running = true
let taskCount = 0

function send(msg: Omit<AgentIpcMessage, "timestamp">): void {
  const line = JSON.stringify({ ...msg, timestamp: Date.now() }) + "\n"
  process.stdout.write(line)
}

function log(level: "info" | "warn" | "error" | "debug", text: string): void {
  send({ type: "log", payload: { level, text } })
}

function replyTo(msg: AgentIpcMessage, type: string, payload?: unknown): void {
  send({ id: msg.id, type, payload })
}

// ── LLM provider ───────────────────────────────────────────────────────

function getModel() {
  const provider = process.env.AEGIS_AI_PROVIDER ?? "openai"
  const modelName = process.env.AEGIS_AI_MODEL ?? "gpt-4o"

  switch (provider) {
    case "anthropic": {
      const { anthropic } = require("@ai-sdk/anthropic") as typeof import("@ai-sdk/anthropic")
      return anthropic(modelName)
    }
    case "openai":
    default: {
      const { openai } = require("@ai-sdk/openai") as typeof import("@ai-sdk/openai")
      return openai(modelName)
    }
  }
}

// ── Tool definitions ───────────────────────────────────────────────────

interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<string>
}

const builtinTools: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute path to the file" } },
      required: ["path"],
    },
    execute: async (args) => {
      const { readFile } = await import("node:fs/promises")
      try {
        return await readFile(String(args.path), "utf-8")
      } catch (err) {
        return `Error reading file: ${err}`
      }
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
    execute: async (args) => {
      const { writeFile } = await import("node:fs/promises")
      try {
        await writeFile(String(args.path), String(args.content), "utf-8")
        return `Successfully wrote ${String(args.content).length} bytes to ${String(args.path)}`
      } catch (err) {
        return `Error writing file: ${err}`
      }
    },
  },
  {
    name: "bash",
    description: "Execute a shell command and return its output",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: { type: "string", description: "Working directory (optional)" },
      },
      required: ["command"],
    },
    execute: async (args) => {
      const { execSync } = await import("node:child_process")
      try {
        const output = execSync(String(args.command), {
          encoding: "utf-8",
          cwd: args.cwd ? String(args.cwd) : undefined,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        })
        return output || "(command completed with no output)"
      } catch (err: any) {
        return `Exit code ${err.status}:\n${err.stdout || ""}\n${err.stderr || ""}`.trim()
      }
    },
  },
  {
    name: "grep",
    description: "Search for a pattern in files using ripgrep",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        include: { type: "string", description: "File glob pattern (e.g. *.ts)" },
        path: { type: "string", description: "Directory to search in" },
      },
      required: ["pattern"],
    },
    execute: async (args) => {
      const { execSync } = await import("node:child_process")
      try {
        const path = args.path ? String(args.path) : "."
        const include = args.include ? `--include="${String(args.include)}"` : ""
        const output = execSync(`rg --no-heading -n ${include} "${String(args.pattern)}" "${path}"`, {
          encoding: "utf-8",
          timeout: 15_000,
          maxBuffer: 1024 * 512,
        })
        return output || "(no matches found)"
      } catch {
        return "(no matches found)"
      }
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts)" },
        path: { type: "string", description: "Directory to search in" },
      },
      required: ["pattern"],
    },
    execute: async (args) => {
      const { globSync } = await import("glob")
      try {
        const cwd = args.path ? String(args.path) : process.cwd()
        const files = globSync(String(args.pattern), { cwd })
        return files.length > 0 ? files.join("\n") : "(no files found)"
      } catch (err) {
        return `Error: ${err}`
      }
    },
  },
  {
    name: "read_skill",
    description: "Load and return the full content of a skill by name. Skills contain workflow instructions for specific tasks.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the skill to load (e.g. code-review, debugging, git-commit)" },
      },
      required: ["name"],
    },
    execute: async (args) => {
      const { readFile, readdir } = await import("node:fs/promises")
      const { existsSync } = await import("node:fs")
      const { resolve } = await import("node:path")
      const searchPaths = [
        resolve(process.cwd(), "skills", String(args.name), "SKILL.md"),
        resolve(process.cwd(), ".aegis/skills", String(args.name), "SKILL.md"),
      ]
      for (const skillPath of searchPaths) {
        if (existsSync(skillPath)) {
          const content = await readFile(skillPath, "utf-8")
          return content
        }
      }
      const skillsDir = resolve(process.cwd(), "skills")
      if (existsSync(skillsDir)) {
        const entries = await readdir(skillsDir, { withFileTypes: true })
        const available = entries.filter((e) => e.isDirectory()).map((e) => e.name)
        return `Skill "${args.name}" not found. Available: ${available.join(", ")}`
      }
      return `Skill "${args.name}" not found. No skills directory exists.`
    },
  },
  {
    name: "save_to_memory",
    description: "Save important information to long-term memory.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to save" },
        type: { type: "string", description: "Type: memory/daily/auto" },
      },
      required: ["content"],
    },
    execute: async (args) => {
      const { writeFile, readFile, mkdir } = await import("node:fs/promises")
      const { resolve, join } = await import("node:path")
      const { existsSync } = await import("node:fs")
      const memType = String(args.type || "memory")

      if (memType === "memory") {
        const memoryFile = resolve(process.cwd(), "MEMORY.md")
        const existing = existsSync(memoryFile) ? await readFile(memoryFile, "utf-8") : "# Aegis Memory\n\n"
        const timestamp = new Date().toISOString()
        await writeFile(memoryFile, existing + `\n## ${timestamp}\n\n${String(args.content)}\n`, "utf-8")
        return "Saved to long-term memory (MEMORY.md)"
      }

      const dailyDir = resolve(process.cwd(), ".aegis/memory/daily")
      await mkdir(dailyDir, { recursive: true })
      const dateStr = new Date().toISOString().split("T")[0]
      const dailyFile = join(dailyDir, `${dateStr}.md`)
      const existing = existsSync(dailyFile) ? await readFile(dailyFile, "utf-8") : `# Daily Log - ${dateStr}\n\n`
      await writeFile(dailyFile, existing + `\n- ${String(args.content)}\n`, "utf-8")
      return `Saved to ${memType} log`
    },
  },
]

function buildVercelTools(): ToolSet {
  const tools: ToolSet = {}
  for (const t of builtinTools) {
    const paramSchema = t.parameters as { type: string; properties: Record<string, unknown>; required?: string[] }
    ;(tools as any)[t.name] = {
      description: t.description,
      parameters: jsonSchema(paramSchema),
      execute: async (toolArgs: Record<string, unknown>) => {
        const result = await t.execute(toolArgs)
        return { content: [{ type: "text", text: result }] }
      },
    }
  }
  return tools
}

// ── ReAct Loop ─────────────────────────────────────────────────────────

async function listAvailableSkills(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")
  const { existsSync } = await import("node:fs")
  const { resolve } = await import("node:path")
  const skillsDir = resolve(process.cwd(), "skills")
  if (!existsSync(skillsDir)) return []
  const entries = await readdir(skillsDir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

async function loadContext(): Promise<string[]> {
  const parts: string[] = []
  const { readFile } = await import("node:fs/promises")
  const { resolve, join } = await import("node:path")
  const { existsSync } = await import("node:fs")

  const userFile = resolve(process.cwd(), "user.md")
  if (existsSync(userFile)) {
    try { parts.push(`# User Profile\n\n${await readFile(userFile, "utf-8")}`) } catch {}
  }

  const memFile = resolve(process.cwd(), "MEMORY.md")
  if (existsSync(memFile)) {
    try { parts.push(`# Memory\n\n${await readFile(memFile, "utf-8")}`) } catch {}
  }

  const dailyDir = resolve(process.cwd(), ".aegis/memory/daily")
  if (existsSync(dailyDir)) {
    const dateStr = new Date().toISOString().split("T")[0]
    const dailyFile = join(dailyDir, `${dateStr}.md`)
    if (existsSync(dailyFile)) {
      try { parts.push(`# Today's Log\n\n${await readFile(dailyFile, "utf-8")}`) } catch {}
    }
  }

  return parts
}

async function buildSystemPrompt(goal: string): Promise<string> {
  const skills = await listAvailableSkills()
  const context = await loadContext()

  const parts: string[] = [
    SYSTEM_PROMPT,
    "",
    `## Goal`,
    ``,
    goal,
    "",
    `## Available Skills`,
    ``,
    skills.length > 0 ? skills.map((s) => `- ${s}`).join("\n") : "(none)",
    "",
    `Use the \`read_skill\` tool to load a skill's full instructions when relevant.`,
  ]

  if (context.length > 0) {
    parts.push("", "## Context", "", ...context)
  }

  parts.push(
    "",
    `## ReAct Protocol`,
    ``,
    `You operate in a Thought → Action → Observation cycle:`,
    ``,
    `1. **Thought**: Reason about the current state and decide what to do`,
    `2. **Action**: Call exactly one tool with the required parameters`,
    `3. **Observation**: You will receive the tool result automatically`,
    ``,
    `Repeat this cycle until the goal is complete, then write a final summary.`,
    ``,
    `## Rules`,
    ``,
    `- Think step by step. Break complex goals into sub-tasks`,
    `- Use \`read_skill\` to load workflow instructions when relevant`,
    `- Use \`save_to_memory\` to persist important information`,
    `- When the goal is complete, clearly state "Task complete" and summarize what was done`,
  )

  return parts.join("\n")
}

async function runReActLoop(goal: string, taskId: number): Promise<string> {
  log("info", `Starting ReAct loop for task #${taskId}: ${goal.slice(0, 100)}`)
  send({ id: `task-${taskId}`, type: "log", payload: { level: "info", text: `🧠 ReAct: ${goal}` } })

  const systemPrompt = await buildSystemPrompt(goal)
  const tools = buildVercelTools()
  const model = getModel()

  const messages: any[] = [{ role: "user", content: goal }]

  let stepCount = 0
  let finalText = ""

  while (stepCount < MAX_TURNS) {
    stepCount++

    try {
      const result = await (generateText as any)({
        model,
        system: systemPrompt,
        messages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        maxSteps: 5,
        temperature: parseFloat(process.env.AEGIS_TEMPERATURE ?? "0.7"),
      })

      const stepText: string = result.text || ""
      const toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }> =
        result.toolCalls || []

      if (stepText) {
        finalText = stepText
        send({
          id: `task-${taskId}`,
          type: "result",
          payload: { type: "thought", content: stepText, step: stepCount },
        })
      }

      if (toolCalls.length === 0 && stepText) {
        log("info", `Task #${taskId}: Agent produced final answer at step ${stepCount}`)
        break
      }

      messages.push({ role: "assistant", content: stepText || "", toolCalls })

      for (const tc of toolCalls) {
        const toolName = tc.toolName
        const args = tc.args

        send({
          id: `task-${taskId}`,
          type: "log",
          payload: { level: "info", text: `🔧 ${toolName}(${JSON.stringify(args).slice(0, 200)})` },
        })

        const toolDef = builtinTools.find((t) => t.name === toolName)
        if (!toolDef) {
          messages.push({ role: "tool", content: `Error: Unknown tool "${toolName}"`, toolCallId: tc.toolCallId })
          continue
        }

        try {
          const output = await toolDef.execute(args)
          const truncated =
            output.length > 2000
              ? output.slice(0, 2000) + `\n... (truncated, ${output.length} chars total)`
              : output
          messages.push({ role: "tool", content: truncated, toolCallId: tc.toolCallId })
        } catch (err: any) {
          messages.push({ role: "tool", content: `Error: ${err.message || String(err)}`, toolCallId: tc.toolCallId })
        }
      }
    } catch (err: any) {
      log("error", `ReAct error at step ${stepCount}: ${err.message}`)
      finalText = finalText || `Error: ${err.message}`
      break
    }
  }

  if (stepCount >= MAX_TURNS) {
    finalText += "\n\n(Reached maximum turn limit)"
  }

  log("info", `Task #${taskId} completed in ${stepCount} steps`)
  return finalText
}

// ── Command handlers ──────────────────────────────────────────────────

function handlePing(msg: AgentIpcMessage): void {
  replyTo(msg, "result", { pong: true, name: AGENT_NAME, uptime: process.uptime() })
}

function handleEcho(msg: AgentIpcMessage): void {
  replyTo(msg, "result", { echo: msg.payload })
}

async function handleRunTask(msg: AgentIpcMessage): Promise<void> {
  const task = msg.payload as { command?: string; goal?: string } | undefined
  const goal = task?.goal || task?.command
  if (!goal) {
    replyTo(msg, "error", {
      message: "No goal provided. Use { goal: '...' } or { command: '...' }",
    })
    return
  }

  taskCount++
  log("info", `Running task #${taskCount}: ${goal.slice(0, 100)}`)

  try {
    const output = await runReActLoop(goal, taskCount)
    replyTo(msg, "result", { taskId: taskCount, output, steps: taskCount })
  } catch (err: any) {
    replyTo(msg, "error", { message: err.message, taskId: taskCount })
  }
}

function handleShutdown(): void {
  log("info", "Shutdown requested, exiting gracefully…")
  running = false
}

// ── IPC input reader ──────────────────────────────────────────────────

let buffer = ""

function processLine(line: string): void {
  if (!line.trim()) return

  let msg: AgentIpcMessage
  try {
    msg = JSON.parse(line) as AgentIpcMessage
  } catch {
    send({ type: "error", payload: { message: `Invalid JSON: ${line}` } })
    return
  }

  switch (msg.type) {
    case "ping":
      handlePing(msg); break
    case "echo":
      handleEcho(msg); break
    case "run-task":
      handleRunTask(msg).catch((err) => replyTo(msg, "error", { message: String(err) })); break
    case "shutdown":
      handleShutdown(); break
    default:
      replyTo(msg, "error", { message: `Unknown command type: ${msg.type}` })
  }
}

const decoder = new TextDecoder()
const stdinStream = Bun.stdin.stream()

async function readStdin(): Promise<void> {
  const reader = stdinStream.getReader()
  try {
    while (running) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        processLine(line)
        if (!running) break
      }
    }
  } catch (err) {
    send({ type: "error", payload: { message: `stdin error: ${String(err)}` } })
  } finally {
    reader.releaseLock()
  }
}

function startHeartbeat(): void {
  const interval = setInterval(() => {
    if (!running) { clearInterval(interval); return }
    send({ type: "heartbeat", payload: { name: AGENT_NAME, taskCount } })
  }, HEARTBEAT_MS)
}

// ── Startup ───────────────────────────────────────────────────────────

log("info", `Agent "${AGENT_NAME}" (${AGENT_ID}) type=${AGENT_TYPE ?? "default"} starting…`)
send({ type: "result", payload: { status: "ready", name: AGENT_NAME, id: AGENT_ID, type: AGENT_TYPE } })

startHeartbeat()
await readStdin()

log("info", "Agent worker exiting")
process.exit(0)
