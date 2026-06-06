import { describe, it, expect, mock, beforeEach } from "bun:test"
import { delegateTaskTool } from "./delegate-task"
import type { ToolContext } from "./registry"

const mockFindAgentByType = mock(() => null)
const mockFindAgentByName = mock(() => null)
const mockSpawn = mock(async () => "spawned-agent-id")
const mockRouteIpc = mock(async () => ({ success: true, output: "task completed", durationMs: 150 }))
const mockSendIpc = mock(() => {})

mock.module("../agent/manager", () => ({
  agentManager: {
    findAgentByType: mockFindAgentByType,
    findAgentByName: mockFindAgentByName,
    spawn: mockSpawn,
    routeIpc: mockRouteIpc,
    sendIpc: mockSendIpc,
  }
}))

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentId: "test-agent",
    agentType: "build",
    cwd: process.cwd(),
    permissions: [{ name: "delegate_task", allow: true }],
    ...overrides,
  }
}

describe("delegateTaskTool", () => {
  beforeEach(() => {
    mockFindAgentByType.mockReset()
    mockFindAgentByType.mockImplementation(() => null)
    mockFindAgentByName.mockReset()
    mockFindAgentByName.mockImplementation(() => null)
    mockSpawn.mockReset()
    mockSpawn.mockImplementation(async () => "spawned-agent-id")
    mockRouteIpc.mockReset()
    mockRouteIpc.mockImplementation(async () => ({ success: true, output: "task completed", durationMs: 150 }))
    mockSendIpc.mockReset()
    mockSendIpc.mockImplementation(() => {})
  })

  describe("parameter validation", () => {
    it("should return error when goal is missing", async () => {
      const result = await delegateTaskTool.execute({}, makeCtx())

      expect(result.success).toBe(false)
      expect(result.error).toBe("Goal parameter is required")
    })

    it("should return error when goal is empty string", async () => {
      const result = await delegateTaskTool.execute({ goal: "" }, makeCtx())

      expect(result.success).toBe(false)
      expect(result.error).toBe("Goal parameter is required")
    })
  })

  describe("agent name lookup parsing", () => {
    it("should parse name: prefix as name lookup", async () => {
      await delegateTaskTool.execute(
        { goal: "test", agentType: "name:my-agent" },
        makeCtx(),
      )

      expect(mockFindAgentByName).toHaveBeenCalledWith("my-agent")
      expect(mockFindAgentByType).not.toHaveBeenCalled()
    })

    it("should parse plain string as type lookup", async () => {
      await delegateTaskTool.execute(
        { goal: "test", agentType: "build" },
        makeCtx(),
      )

      expect(mockFindAgentByType).toHaveBeenCalledWith("build")
      expect(mockFindAgentByName).not.toHaveBeenCalled()
    })
  })

  describe("delegate with mock agent manager", () => {
    it("should route to existing agent by type and return result", async () => {
      const fakeAgent: any = { id: "existing-id", def: { name: "build-agent" } }
      mockFindAgentByType.mockImplementation(() => fakeAgent)

      const result = await delegateTaskTool.execute(
        { goal: "build the feature", agentType: "build" },
        makeCtx({ agentId: "source-id" }),
      )

      expect(mockRouteIpc).toHaveBeenCalledWith(
        "source-id", "existing-id",
        expect.objectContaining({
          type: "dispatch",
          payload: expect.objectContaining({
            goal: "build the feature",
            sourceAgentId: "source-id",
          }),
        }),
      )

      expect(result.success).toBe(true)
      expect(result.output).toBe("task completed")
      expect(result.metadata?.targetAgent).toBe("build-agent")
      expect(result.metadata?.targetAgentId).toBe("existing-id")
      expect(mockSpawn).not.toHaveBeenCalled()
    })
  })

  describe("cleanup on success", () => {
    it("should spawn new agent and send shutdown IPC on completion", async () => {
      const result = await delegateTaskTool.execute(
        { goal: "new task", agentType: "read" },
        makeCtx({ agentId: "source-id" }),
      )

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({ agentType: "read" }),
      )

      expect(mockRouteIpc).toHaveBeenCalledWith(
        "source-id", "spawned-agent-id",
        expect.objectContaining({ type: "dispatch" }),
      )

      expect(mockSendIpc).toHaveBeenCalledWith(
        "spawned-agent-id",
        expect.objectContaining({ type: "shutdown" }),
      )

      expect(result.success).toBe(true)
      expect(result.metadata?.spawned).toBe(true)
      expect(result.metadata?.targetAgentId).toBe("spawned-agent-id")
    })
  })
})
