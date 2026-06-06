import { describe, it, expect } from "bun:test"
import { Command } from "commander"
import { registerToolset } from "./toolset"

describe("toolset CLI", () => {
  it("registers toolset commands", () => {
    const program = new Command()
    registerToolset(program)
    const cmd = program.commands.find((c) => c.name() === "toolset")
    expect(cmd).toBeDefined()
    const sub = cmd!.commands
    expect(sub.some((c) => c.name() === "list")).toBe(true)
    expect(sub.some((c) => c.name() === "show")).toBe(true)
    expect(sub.some((c) => c.name() === "new")).toBe(true)
  })
})
