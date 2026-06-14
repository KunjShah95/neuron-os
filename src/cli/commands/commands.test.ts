/**
 * Comprehensive CLI command registration tests.
 *
 * Tests that every command registers correctly with expected options,
 * aliases, and descriptions. Uses Commander's Command class directly
 * without spawning the actual CLI process.
 */

import { describe, it, expect } from "bun:test"
import { Command } from "commander"
import { registerAllCommands } from "./index"

function makeProgram(): Command {
  const program = new Command()
  program.exitOverride()
  registerAllCommands(program)
  return program
}

function findCommand(program: Command, name: string): Command | undefined {
  return program.commands.find((c) => c.name() === name)
}

// ── Registration helpers ──────────────────────────────────────────────

function testCommand(
  name: string,
  expected: {
    aliases?: string[]
    options?: string[]
    description?: string
  },
) {
  describe(`${name} command`, () => {
    const program = makeProgram()
    const cmd = findCommand(program, name)

    it(`registers "${name}" command`, () => {
      expect(cmd).toBeDefined()
    })

    if (expected.description) {
      it(`has description`, () => {
        expect(cmd!.description()).toBe(expected.description)
      })
    }

    if (expected.aliases) {
      for (const alias of expected.aliases) {
        it(`has alias "${alias}"`, () => {
          expect(cmd!.aliases()).toContain(alias)
        })
      }
    }

    if (expected.options) {
      it(`has expected options`, () => {
        const optionLongs = cmd!.options.map((o) => o.long)
        for (const opt of expected.options) {
          expect(optionLongs).toContain(opt)
        }
      })
    }
  })
}

function testSubcommand(
  parentName: string,
  subName: string,
  expected: {
    aliases?: string[]
    options?: string[]
  } = {},
) {
  describe(`${parentName} ${subName} subcommand`, () => {
    const program = makeProgram()
    const parent = findCommand(program, parentName)
    const cmd = parent?.commands.find((c) => c.name() === subName)

    it(`registers "${subName}" subcommand`, () => {
      expect(cmd).toBeDefined()
    })

    if (expected.aliases) {
      for (const alias of expected.aliases) {
        it(`has alias "${alias}"`, () => {
          expect(cmd!.aliases()).toContain(alias)
        })
      }
    }

    if (expected.options) {
      it(`has expected options`, () => {
        const optionLongs = cmd!.options.map((o) => o.long)
        for (const opt of expected.options) {
          expect(optionLongs).toContain(opt)
        }
      })
    }
  })
}

// ── Top-level commands ────────────────────────────────────────────────

describe("CLI command registration", () => {
  const program = makeProgram()

  it("registers all expected commands", () => {
    const names = program.commands.map((c) => c.name())
    expect(names).toContain("doctor")
    expect(names).toContain("completion")
    expect(names).toContain("supervise")
    expect(names).toContain("reflect")
    expect(names).toContain("project")
    expect(names).toContain("experience")
    expect(names).toContain("insights")
    expect(names).toContain("train")
    expect(names).toContain("benchmark")
    expect(names).toContain("adversarial")
    expect(names).toContain("ci")
    expect(names).toContain("pricing")
    expect(names).toContain("debate")
    expect(names).toContain("cost")
    expect(names).toContain("plugin")
    expect(names).toContain("trigger")
    expect(names).toContain("router")
    expect(names).toContain("improve")
    expect(names).toContain("estimate")
    expect(names).toContain("audit")
    expect(names).toContain("mesh")
    expect(names).toContain("bench")
    expect(names).toContain("email")
    expect(names).toContain("discord")
    expect(names).toContain("slack")
    expect(names).toContain("whatsapp")
    expect(names).toContain("sms")
    expect(names).toContain("voice")
    expect(names).toContain("voice-local")
    expect(names).toContain("wakeup")
    expect(names).toContain("setup")
    expect(names).toContain("dashboard")
    expect(names).toContain("agent")
    expect(names).toContain("chat")
    expect(names).toContain("status")
    expect(names).toContain("skills")
    expect(names).toContain("config")
    expect(names).toContain("cron")
    expect(names).toContain("serve")
    expect(names).toContain("mcp")
    expect(names).toContain("memory")
    expect(names).toContain("telegram")
    expect(names).toContain("ask")
    expect(names).toContain("plan")
    expect(names).toContain("sandbox")
    expect(names).toContain("computer")
    expect(names).toContain("health")
    expect(names).toContain("harness")
    expect(names).toContain("agent-run")
    expect(names).toContain("openapi")
    expect(names).toContain("telemetry")
    expect(names).toContain("setup-keys")
    expect(names).toContain("pool")
    expect(names).toContain("distributed")
    expect(names).toContain("production")
    expect(names).toContain("eval")
    expect(names).toContain("research")
    expect(names).toContain("orchestrate")
    expect(names).toContain("webhook")
    expect(names).toContain("session")
    expect(names).toContain("toolset")
    expect(names).toContain("metrics")
    expect(names).toContain("docscrawl")
    expect(names).toContain("evolve")
    expect(names).toContain("soul")
    expect(names).toContain("social")
    expect(names).toContain("persona")
    expect(names).toContain("dream")
    expect(names).toContain("predict")
    expect(names).toContain("workflow")
    expect(names).toContain("tls")
    expect(names).toContain("marketplace")
    expect(names).toContain("providers")
    expect(names).toContain("profile")
    expect(names).toContain("init")
    expect(names).toContain("version")
  })

  it("does not register duplicate commands", () => {
    const names = program.commands.map((c) => c.name())
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})

// ── Individual command tests ──────────────────────────────────────────

testCommand("doctor", {
  aliases: [],
  options: ["--json", "--verbose", "--fix"],
  description: "Run system health diagnostics",
})

testCommand("wakeup", {
  aliases: ["w"],
  description: "Show the banner and available commands",
})

testCommand("setup", {
  aliases: [],
  description: "Configure and initialize Aegis workspace",
})

testCommand("init", {
  aliases: ["quick-start", "start"],
  description: "Quick start guide - configure API keys and launch Aegis",
})

testCommand("version", {
  aliases: [],
  description: "Show Aegis version",
})

testCommand("completion", {
  aliases: [],
  description: "Generate shell completion scripts (bash, zsh, fish)",
})

testCommand("status", {
  aliases: ["st"],
  options: ["--json", "--watch"],
  description: expect.stringContaining("status overview"),
})

testCommand("health", {
  aliases: [],
  options: ["--json"],
  description: "Show system health overview",
})

testCommand("metrics", {
  aliases: [],
  options: ["--json"],
  description: "Show system metrics snapshot",
})

testCommand("providers", {
  aliases: ["prov"],
  options: ["--json", "--configured"],
  description: expect.stringContaining("providers"),
})

testCommand("config", {
  aliases: ["cfg"],
  description: "Manage credentials and configuration",
})

testCommand("sandbox", {
  aliases: ["sb"],
  description: "Sandbox status and controls",
})

testCommand("agent", {
  aliases: ["a"],
  description: "Manage AI agents",
})

testCommand("chat", {
  description: expect.stringContaining("chat"),
})

testCommand("ask", {
  description: expect.stringContaining("question"),
})

testCommand("plan", {
  description: "Generate a step-by-step implementation plan",
})

testCommand("research", {
  aliases: ["rs"],
  options: ["--max-iterations"],
  description: "Run an autonomous research loop with safe ratchet mechanism",
})

testCommand("orchestrate", {
  aliases: ["orch"],
  options: ["--dry-run"],
  description: expect.stringContaining("goal"),
})

testCommand("agent-run", {
  aliases: ["ar"],
  options: ["--project", "--ratchet", "--eval", "--test-cmd"],
  description: "Run the approval-based agent orchestrator",
})

testCommand("supervise", {
  options: ["--agent-type", "--max-restarts"],
  description: expect.stringContaining("supervise"),
})

testCommand("reflect", {
  options: ["--goal", "--provider", "--model", "--json"],
  description: expect.stringContaining("session"),
})

testCommand("serve", {
  options: ["--port", "--host", "--key", "--auth", "--cron", "--ws", "--session-db"],
  description: "Start the HTTP API server",
})

testCommand("mcp", {
  description: "Manage MCP (Model Context Protocol) servers",
})

testCommand("session", {
  description: expect.stringContaining("session"),
})

testCommand("memory", {
  description: "Manage memory and vector search",
})

testCommand("toolset", {
  description: expect.stringContaining("tool"),
})

testCommand("skills", {
  description: expect.stringContaining("skill"),
})

testCommand("cost", {
  aliases: ["spend"],
  description: expect.stringContaining("billing"),
})

testCommand("pricing", {
  description: expect.stringContaining("pricing"),
})

testCommand("router", {
  description: expect.stringContaining("router"),
})

testCommand("estimate", {
  description: expect.stringContaining("estimate"),
})

testCommand("bench", {
  description: expect.stringContaining("bench"),
})

testCommand("benchmark", {
  description: expect.stringContaining("bench"),
})

testCommand("eval", {
  description: expect.stringContaining("evaluation"),
})

testCommand("harness", {
  aliases: ["h"],
  description: "Agent evaluation harness",
})

testCommand("ci", {
  description: expect.stringContaining("CI"),
})

testCommand("audit", {
  description: expect.stringContaining("audit"),
})

testCommand("plugin", {
  aliases: ["plugins"],
  description: expect.stringContaining("plugin"),
})

testCommand("marketplace", {
  aliases: ["mp"],
  description: expect.stringContaining("marketplace"),
})

testCommand("profile", {
  description: "Manage agent identity profiles",
})

testCommand("dream", {
  description: expect.stringContaining("dream"),
})

testCommand("evolve", {
  description: expect.stringContaining("evolv"),
})

testCommand("soul", {
  description: expect.stringContaining("soul"),
})

testCommand("social", {
  description: expect.stringContaining("social"),
})

testCommand("persona", {
  description: expect.stringContaining("persona"),
})

testCommand("predict", {
  aliases: ["pred"],
  description: expect.stringContaining("predict"),
})

testCommand("workflow", {
  description: expect.stringContaining("workflow"),
})

testCommand("experience", {
  aliases: ["exp"],
  description: expect.stringContaining("experience"),
})

testCommand("insights", {
  aliases: ["i"],
  description: expect.stringContaining("insight"),
})

testCommand("project", {
  aliases: ["proj"],
  description: expect.stringContaining("project"),
})

testCommand("telemetry", {
  aliases: ["tel"],
  description: expect.stringContaining("telemetry"),
})

testCommand("pool", {
  description: expect.stringContaining("pool"),
})

testCommand("distributed", {
  description: expect.stringContaining("distributed"),
})

testCommand("production", {
  description: expect.stringContaining("production"),
})

testCommand("trigger", {
  description: expect.stringContaining("trigger"),
})

testCommand("cron", {
  description: expect.stringContaining("cron"),
})

testCommand("tls", {
  description: expect.stringContaining("TLS"),
})

testCommand("setup-keys", {
  description: expect.stringContaining("key"),
})

testCommand("openapi", {
  description: expect.stringContaining("OpenAPI"),
})

testCommand("docs-crawl", {
  description: expect.stringContaining("crawl"),
})

testCommand("webhook", {
  description: expect.stringContaining("webhook"),
})

testCommand("email", {
  description: expect.stringContaining("email"),
})

testCommand("discord", {
  description: expect.stringContaining("discord"),
})

testCommand("slack", {
  description: expect.stringContaining("slack"),
})

testCommand("telegram", {
  description: expect.stringContaining("telegram"),
})

testCommand("whatsapp", {
  description: expect.stringContaining("whatsapp"),
})

testCommand("sms", {
  description: expect.stringContaining("sms"),
})

testCommand("voice", {
  description: expect.stringContaining("voice"),
})

testCommand("voice-local", {
  description: expect.stringContaining("voice"),
})

testCommand("computer", {
  description: expect.stringContaining("computer"),
})

testCommand("dashboard", {
  description: expect.stringContaining("dashboard"),
})

testCommand("debate", {
  description: expect.stringContaining("debate"),
})

testCommand("mesh", {
  description: expect.stringContaining("mesh"),
})

testCommand("adversarial", {
  description: expect.stringContaining("adversarial"),
})

testCommand("improve", {
  description: expect.stringContaining("improve"),
})

testCommand("train", {
  description: expect.stringContaining("train"),
})

testCommand("knowledge", {
  description: expect.stringContaining("knowledge"),
})

testCommand("multi-agent", {
  description: expect.stringContaining("agent"),
})

// ── Subcommand tests ──────────────────────────────────────────────────

describe("config subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "config")

  it("has set subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "set")).toBe(true)
  })
  it("has get subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "get")).toBe(true)
  })
  it("has delete subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "delete")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has validate subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "validate")).toBe(true)
  })
})

describe("agent subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "agent")

  it("has types subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "types")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has spawn subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "spawn")).toBe(true)
  })
  it("has kill subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "kill")).toBe(true)
  })
  it("has logs subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "logs")).toBe(true)
  })
  it("has inspect subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "inspect")).toBe(true)
  })
  it("has prewarm subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "prewarm")).toBe(true)
  })
})

describe("session subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "session")

  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has view subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "view")).toBe(true)
  })
  it("has search subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "search")).toBe(true)
  })
  it("has resume subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "resume")).toBe(true)
  })
  it("has export subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "export")).toBe(true)
  })
  it("has prune subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "prune")).toBe(true)
  })
  it("has delete subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "delete")).toBe(true)
  })
  it("has fork subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "fork")).toBe(true)
  })
  it("has merge subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "merge")).toBe(true)
  })
  it("has create subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "create")).toBe(true)
  })
  it("has join subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "join")).toBe(true)
  })
  it("has list-shared subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list-shared")).toBe(true)
  })
  it("has tree subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "tree")).toBe(true)
  })
  it("has checkpoint subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "checkpoint")).toBe(true)
  })
})

describe("skills subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "skills")

  it("has search subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "search")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has install subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "install")).toBe(true)
  })
  it("has browse subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "browse")).toBe(true)
  })
  it("has list-staged subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list-staged")).toBe(true)
  })
  it("has approve subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "approve")).toBe(true)
  })
  it("has retire subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "retire")).toBe(true)
  })
  it("has hub subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "hub")).toBe(true)
  })
  it("has evolution subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "evolution")).toBe(true)
  })
})

describe("cost subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "cost")

  it("has estimate subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "estimate")).toBe(true)
  })
  it("has total subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "total")).toBe(true)
  })
  it("has models subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "models")).toBe(true)
  })
  it("has sessions subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "sessions")).toBe(true)
  })
  it("has budget subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "budget")).toBe(true)
  })
  it("has history subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "history")).toBe(true)
  })
  it("has dashboard subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "dashboard")).toBe(true)
  })
  it("has report subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "report")).toBe(true)
  })
})

describe("dream subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "dream")

  it("has run subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "run")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has insights subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "insights")).toBe(true)
  })
  it("has config subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "config")).toBe(true)
  })
  it("has share subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "share")).toBe(true)
  })
  it("has stats subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "stats")).toBe(true)
  })
})

describe("evolve subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "evolve")

  it("has run subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "run")).toBe(true)
  })
  it("has propose subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "propose")).toBe(true)
  })
  it("has apply subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "apply")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has rollback subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "rollback")).toBe(true)
  })
  it("has stats subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "stats")).toBe(true)
  })
  it("has config subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "config")).toBe(true)
  })
})

describe("soul subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "soul")

  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has card subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "card")).toBe(true)
  })
  it("has mood subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "mood")).toBe(true)
  })
})

describe("social subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "social")

  it("has register subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "register")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has peers subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "peers")).toBe(true)
  })
  it("has message subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "message")).toBe(true)
  })
  it("has inbox subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "inbox")).toBe(true)
  })
  it("has reputation subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "reputation")).toBe(true)
  })
  it("has discover subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "discover")).toBe(true)
  })
})

describe("memory subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "memory")

  it("has show subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "show")).toBe(true)
  })
  it("has add subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "add")).toBe(true)
  })
  it("has search subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "search")).toBe(true)
  })
  it("has facts subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "facts")).toBe(true)
  })
  it("has stats subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "stats")).toBe(true)
  })
  it("has vector subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "vector")).toBe(true)
  })
  it("has policy subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "policy")).toBe(true)
  })
})

describe("mcp subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "mcp")

  it("has serve subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "serve")).toBe(true)
  })
  it("has connect subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "connect")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
})

describe("audit subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "audit")

  it("has stats subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "stats")).toBe(true)
  })
  it("has recent subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "recent")).toBe(true)
  })
  it("has replay subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "replay")).toBe(true)
  })
  it("has timeline subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "timeline")).toBe(true)
  })
  it("has policy subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "policy")).toBe(true)
  })
})

describe("plugin subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "plugin")

  it("has publish subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "publish")).toBe(true)
  })
  it("has install subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "install")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has remove subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "remove")).toBe(true)
  })
  it("has search subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "search")).toBe(true)
  })
  it("has info subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "info")).toBe(true)
  })
})

describe("experience subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "experience")

  it("has stats subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "stats")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has failures subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "failures")).toBe(true)
  })
  it("has cluster subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "cluster")).toBe(true)
  })
  it("has candidates subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "candidates")).toBe(true)
  })
  it("has retry subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "retry")).toBe(true)
  })
  it("has auto-extract subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "auto-extract")).toBe(true)
  })
})

describe("insights subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "insights")

  it("has summary subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "summary")).toBe(true)
  })
  it("has sessions subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "sessions")).toBe(true)
  })
  it("has agents subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "agents")).toBe(true)
  })
  it("has failures subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "failures")).toBe(true)
  })
  it("has costs subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "costs")).toBe(true)
  })
  it("has timeline subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "timeline")).toBe(true)
  })
  it("has export subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "export")).toBe(true)
  })
})

describe("pool subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "pool")

  it("has submit subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "submit")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has cancel subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "cancel")).toBe(true)
  })
  it("has stats subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "stats")).toBe(true)
  })
})

describe("eval subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "eval")

  it("has run subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "run")).toBe(true)
  })
  it("has report subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "report")).toBe(true)
  })
  it("has ci subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "ci")).toBe(true)
  })
  it("has baseline subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "baseline")).toBe(true)
  })
  it("has experiment subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "experiment")).toBe(true)
  })
  it("has review subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "review")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has calibrate subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "calibrate")).toBe(true)
  })
})

describe("production subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "production")

  it("has rbac subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "rbac")).toBe(true)
  })
  it("has vault subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "vault")).toBe(true)
  })
  it("has slo subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "slo")).toBe(true)
  })
  it("has dashboard subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "dashboard")).toBe(true)
  })
  it("has trace subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "trace")).toBe(true)
  })
  it("has background subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "background")).toBe(true)
  })
})

describe("distributed subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "distributed")

  it("has start subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "start")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has workers subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "workers")).toBe(true)
  })
  it("has task subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "task")).toBe(true)
  })
  it("has info subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "info")).toBe(true)
  })
  it("has worker subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "worker")).toBe(true)
  })
})

describe("predict subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "predict")

  it("has risk subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "risk")).toBe(true)
  })
  it("has forecast subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "forecast")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
})

describe("workflow subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "workflow")

  it("has build subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "build")).toBe(true)
  })
  it("has run subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "run")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has validate subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "validate")).toBe(true)
  })
})

describe("completion subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "completion")

  it("has bash subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "bash")).toBe(true)
  })
  it("has zsh subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "zsh")).toBe(true)
  })
  it("has fish subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "fish")).toBe(true)
  })
})

describe("ci subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "ci")

  it("has watch subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "watch")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has config subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "config")).toBe(true)
  })
  it("has repos subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "repos")).toBe(true)
  })
  it("has disable subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "disable")).toBe(true)
  })
})

describe("telemetry subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "telemetry")

  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has opt-in subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "opt-in")).toBe(true)
  })
  it("has opt-out subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "opt-out")).toBe(true)
  })
  it("has flush subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "flush")).toBe(true)
  })
})

describe("marketplace subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "marketplace")

  it("has search subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "search")).toBe(true)
  })
  it("has install subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "install")).toBe(true)
  })
  it("has info subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "info")).toBe(true)
  })
  it("has rate subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "rate")).toBe(true)
  })
  it("has publish subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "publish")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has update subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "update")).toBe(true)
  })
})

describe("profile subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "profile")

  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has create subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "create")).toBe(true)
  })
  it("has get subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "get")).toBe(true)
  })
  it("has delete subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "delete")).toBe(true)
  })
  it("has set-default subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "set-default")).toBe(true)
  })
})

describe("project subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "project")

  it("has init subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "init")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has switch subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "switch")).toBe(true)
  })
  it("has remove subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "remove")).toBe(true)
  })
})

describe("bench subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "bench")

  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has run subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "run")).toBe(true)
  })
  it("has history subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "history")).toBe(true)
  })
  it("has baseline subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "baseline")).toBe(true)
  })
  it("has providers subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "providers")).toBe(true)
  })
})

describe("pricing subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "pricing")

  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has estimate subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "estimate")).toBe(true)
  })
  it("has set subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "set")).toBe(true)
  })
  it("has refresh subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "refresh")).toBe(true)
  })
})

describe("harness subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "harness")

  it("has run subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "run")).toBe(true)
  })
  it("has report subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "report")).toBe(true)
  })
  it("has status subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
})

describe("router subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "router")

  it("has route subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "route")).toBe(true)
  })
  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has suggest subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "suggest")).toBe(true)
  })
})

describe("trigger subcommands", () => {
  const program = makeProgram()
  const cmd = findCommand(program, "trigger")

  it("has list subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has add subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "add")).toBe(true)
  })
  it("has remove subcommand", () => {
    expect(cmd?.commands.some((c) => c.name() === "remove")).toBe(true)
  })
})

describe("agent prewarm subcommands", () => {
  const program = makeProgram()
  const agentCmd = findCommand(program, "agent")
  const prewarmCmd = agentCmd?.commands.find((c) => c.name() === "prewarm")

  it("has prewarm list subcommand", () => {
    expect(prewarmCmd?.commands.some((c) => c.name() === "list")).toBe(true)
  })
  it("has prewarm status subcommand", () => {
    expect(prewarmCmd?.commands.some((c) => c.name() === "status")).toBe(true)
  })
  it("has prewarm trigger subcommand", () => {
    expect(prewarmCmd?.commands.some((c) => c.name() === "trigger")).toBe(true)
  })
})
