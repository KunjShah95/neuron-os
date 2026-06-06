import { describe, it, expect } from "bun:test"
import { executeCodeTool } from "./execute-code"
import { toolRegistry } from "./registry"
// Side-effect: trigger registerBuiltinTools()
import "./index"

describe("execute_code tool", () => {
  it("registers with correct name", () => {
    expect(executeCodeTool.name).toBe("execute_code")
    expect(executeCodeTool.description).toBeTruthy()
  })

  it("requires code parameter", () => {
    const codeParam = executeCodeTool.parameters.find((p) => p.name === "code")
    expect(codeParam).toBeDefined()
    expect(codeParam!.required).toBe(true)
  })

  it("accepts language parameter with TS/JS default", () => {
    const langParam = executeCodeTool.parameters.find((p) => p.name === "language")
    expect(langParam).toBeDefined()
    expect(langParam!.default).toBe("typescript")
  })

  it("is registered in the global tool registry", () => {
    const tool = toolRegistry.get("execute_code")
    expect(tool).toBeDefined()
    expect(tool!.name).toBe("execute_code")
  })
})
