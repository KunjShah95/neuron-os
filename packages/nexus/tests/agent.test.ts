import { describe, test, expect, mock } from "bun:test";
import { NexusAgent } from "../src/core/agent.js";
import { InMemoryStorageAdapter } from "../src/storage/memory.js";
import { Tool } from "../src/core/types.js";
import { z } from "zod";

describe("NexusAgent SDK", () => {
  test("should initialize correctly with options and default state", () => {
    const storage = new InMemoryStorageAdapter();
    const agent = new NexusAgent({
      name: "TestAgent",
      role: "Testing unit parameters",
      storage,
    });

    expect(agent.config.name).toBe("TestAgent");
    expect(agent.config.role).toBe("Testing unit parameters");
    expect(agent.getState().status).toBe("idle");
    expect(agent.getState().goals.length).toBe(0);
  });

  test("should register and fetch tools", () => {
    const storage = new InMemoryStorageAdapter();
    const agent = new NexusAgent({
      name: "TestAgent",
      role: "Testing tool registration",
      storage,
    });

    const mockTool: Tool = {
      name: "MockTool",
      description: "A dummy capability tool",
      inputSchema: z.object({ input: z.string() }),
      execute: async (args) => args,
    };

    agent.registerTool(mockTool);
    const tools = agent.getTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("MockTool");
    expect(agent.getTool("MockTool")).toEqual(expect.objectContaining({ name: "MockTool" }));
  });

  test("should react to state modifications via events and save to storage", async () => {
    const storage = new InMemoryStorageAdapter();
    const agent = new NexusAgent({
      name: "TestAgent",
      role: "Testing reactivity",
      storage,
    });

    let eventFired = false;
    let eventKey = "";
    let eventVal: any = null;

    agent.on("stateChange", (key, val) => {
      eventFired = true;
      eventKey = key;
      eventVal = val;
    });

    await agent.setMetadata("version", "1.0.0");

    expect(eventFired).toBe(true);
    expect(eventKey).toBe("version");
    expect(eventVal).toBe("1.0.0");

    const cachedVal = agent.getState().metadata.version;
    expect(cachedVal).toBe("1.0.0");

    const storageVal = await agent.getMetadata<string>("version");
    expect(storageVal).toBe("1.0.0");
  });

  test("should execute goals and fire thoughts/actions/revisions during run loop", async () => {
    const storage = new InMemoryStorageAdapter();
    
    // Create a mock capability tool
    let toolExecuted = false;
    const mockTool: Tool = {
      name: "TestTool",
      description: "Invoked during test",
      inputSchema: z.object({}),
      execute: async () => {
        toolExecuted = true;
        return "success";
      },
    };

    const agent = new NexusAgent({
      name: "RunnerAgent",
      role: "Executes loops",
      storage,
      tools: [mockTool],
    });

    const thoughts: string[] = [];
    const actions: string[] = [];
    const statusChanges: string[] = [];

    agent.on("thought", (t) => thoughts.push(t));
    agent.on("action", (name) => actions.push(name));
    agent.on("statusChange", (s) => statusChanges.push(s));

    await storage.init();
    
    // Trigger run with goal matching the tool name to trigger execution
    const response = await agent.execute("Execute TestTool action");

    expect(thoughts.length).toBeGreaterThan(0);
    expect(actions.length).toBe(1);
    expect(actions[0]).toBe("TestTool");
    expect(toolExecuted).toBe(true);
    expect(statusChanges).toContain("thinking");
    expect(statusChanges).toContain("executing");
    expect(statusChanges).toContain("idle");
    expect(response).toContain("success");

    // Verify memories wereDistilled
    const episodes = await storage.getMemory("episodes");
    expect(episodes.length).toBe(1);
    expect(episodes[0].content).toContain("Executed tool");

    await storage.close();
  });
});
