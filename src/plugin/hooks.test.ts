import { describe, it, expect, beforeEach } from "bun:test"
import { PluginHookRegistry } from "./hooks"

describe("PluginHookRegistry", () => {
  let registry: PluginHookRegistry

  beforeEach(() => {
    registry = new PluginHookRegistry()
  })

  it("should register and run a non-blocking hook", async () => {
    const calls: string[] = []
    registry.register({
      point: "on_agent_spawn",
      pluginName: "test-plugin",
      canBlock: false,
      priority: 0,
      fn: async () => { calls.push("ran") },
    })

    const result = await registry.run("on_agent_spawn", { agentId: "test" })
    expect(result.blocked).toBe(false)
    expect(calls).toEqual(["ran"])
  })

  it("should block when a blocking hook returns false", async () => {
    registry.register({
      point: "on_tool_call",
      pluginName: "blocker",
      canBlock: true,
      priority: 0,
      fn: async () => false,
    })

    const result = await registry.run("on_tool_call", { toolName: "read" })
    expect(result.blocked).toBe(true)
  })

  it("should NOT block when blocking hook returns true", async () => {
    registry.register({
      point: "on_tool_call",
      pluginName: "non-blocker",
      canBlock: true,
      priority: 0,
      fn: async () => true,
    })

    const result = await registry.run("on_tool_call", { toolName: "read" })
    expect(result.blocked).toBe(false)
  })

  it("should not block for non-blocking hooks that return false", async () => {
    registry.register({
      point: "on_agent_spawn",
      pluginName: "test",
      canBlock: false,
      priority: 0,
      fn: async () => false,
    })

    const result = await registry.run("on_agent_spawn", { agentId: "test" })
    expect(result.blocked).toBe(false)
  })

  it("should execute hooks in priority order", async () => {
    const order: number[] = []
    registry.register({ point: "on_message", pluginName: "a", canBlock: false, priority: 10, fn: async () => { order.push(10) } })
    registry.register({ point: "on_message", pluginName: "b", canBlock: false, priority: 0, fn: async () => { order.push(0) } })
    registry.register({ point: "on_message", pluginName: "c", canBlock: false, priority: 20, fn: async () => { order.push(20) } })

    await registry.run("on_message", {})
    expect(order).toEqual([20, 10, 0])
  })

  it("should unregister all hooks for a plugin", async () => {
    registry.register({ point: "on_agent_spawn", pluginName: "test", canBlock: false, priority: 0, fn: async () => {} })
    registry.register({ point: "on_message", pluginName: "test", canBlock: false, priority: 0, fn: async () => {} })
    expect(registry.size).toBe(2)
    registry.unregister("test")
    expect(registry.size).toBe(0)
  })
})
