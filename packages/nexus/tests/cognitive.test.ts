import { describe, test, expect, beforeAll } from "bun:test";
import { NexusAgent } from "../src/core/agent.js";
import { InMemoryStorageAdapter } from "../src/storage/memory.js";
import { TreeOfThoughtsStrategy, ReActStrategy } from "../src/core/reasoning.js";
import { NexusMemoryManager } from "../src/memory/manager.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { Tool } from "../src/core/types.js";
import { z } from "zod";

describe("Phase 2 Cognitive Advancements", () => {
  describe("Pluggable Reasoning strategies", () => {
    test("should execute goals using ReAct strategy by default", async () => {
      const storage = new InMemoryStorageAdapter();
      const agent = new NexusAgent({
        name: "ReActTester",
        role: "Test ReAct strategy",
        storage,
      });

      await storage.init();
      const response = await agent.execute("Execute standard test routine");
      expect(response).toContain("Executed Goal via ReAct");
      await storage.close();
    });

    test("should allow switching reasoning strategies to Tree of Thoughts", async () => {
      const storage = new InMemoryStorageAdapter();
      const agent = new NexusAgent({
        name: "ToTTester",
        role: "Test Tree of Thoughts strategy",
        storage,
      });

      // Refactor engine to use Tree of Thoughts
      const engine = (agent as any).engine;
      engine.setStrategy(new TreeOfThoughtsStrategy());

      await storage.init();
      const response = await agent.execute("Optimize directory loading algorithm");
      expect(response).toContain("Executed Goal via Tree of Thoughts");
      expect(response).toContain("Selected Path C");
      await storage.close();
    });
  });

  describe("Advanced Memory Architecture & Forgetting Curves", () => {
    test("should classify memories into tiers and apply Ebbinghaus forgetting decay", async () => {
      const storage = new InMemoryStorageAdapter();
      // Configure estimator with timeScaleMs=100 (100ms real time = 1 decay unit)
      const memoryManager = new NexusMemoryManager(storage, {
        retentionThreshold: 0.5,
        timeScaleMs: 100,
      });

      await storage.init();
      await memoryManager.init();

      // 1. Add low-importance memory (decays fast)
      const memLow = await memoryManager.addMemory("working", "Temp variable key: X1", 2);
      
      // 2. Add high-importance memory (importance >= 8 never forgotten)
      const memHigh = await memoryManager.addMemory("semantic", "System root certificate: 0x48f9", 9);

      let stats = memoryManager.getStats();
      expect(stats.totalSlots).toBe(2);
      expect(stats.byType.working).toBe(1);
      expect(stats.byType.semantic).toBe(1);

      // Verify recall update behavior
      const initialAccessCount = memLow.accessCount;
      const memories = await memoryManager.getMemories("working");
      expect(memories[0].accessCount).toBe(initialAccessCount + 1);

      // 3. Simulate passage of time to trigger decay (wait 400ms = 4 decay units)
      await new Promise((r) => setTimeout(r, 400));

      // Consolidated sweep
      const { forgottenCount } = await memoryManager.consolidate();

      // The low-importance memory should have been forgotten (R = e^(-4 / (2 * (1 + ln(2)))) < 0.5)
      // The high-importance memory is permanent and should be retained.
      expect(forgottenCount).toBe(1);

      const remaining = await memoryManager.getMemories();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(memHigh.id);

      const finalStats = memoryManager.getStats();
      expect(finalStats.forgottenCount).toBe(1);
      expect(finalStats.totalSlots).toBe(1);

      await storage.close();
    });
  });

  describe("Tool Abstraction Layer", () => {
    test("should search tools by tags and profile performance metrics", async () => {
      const registry = new ToolRegistry();

      const mockTool1: Tool = {
        name: "FastAPIQuery",
        description: "Fetch API responses",
        inputSchema: z.object({}),
        execute: async () => "api response",
      };

      const mockTool2: Tool = {
        name: "FallbackFetcher",
        description: "Backup HTTP retrieval",
        inputSchema: z.object({}),
        execute: async () => {
          // Simulate slow/crashed execution
          await new Promise((r) => setTimeout(r, 50));
          throw new Error("Timeout");
        },
      };

      registry.register(mockTool1, ["fetch", "network", "fast"]);
      registry.register(mockTool2, ["fetch", "network", "slow"]);

      // 1. Search by tag intent
      const networkTools = registry.findToolsByIntent("network");
      expect(networkTools.length).toBe(2);

      const fastTools = registry.findToolsByIntent("fast");
      expect(fastTools.length).toBe(1);
      expect(fastTools[0].name).toBe("FastAPIQuery");

      // 2. Perform mock runs to generate statistics
      await registry.executeSandboxed("FastAPIQuery", {});
      
      try {
        await registry.executeSandboxed("FallbackFetcher", {});
      } catch (err) {
        // expect crash
      }

      // Check profiles
      const profile1 = registry.getProfile("FastAPIQuery")!;
      const profile2 = registry.getProfile("FallbackFetcher")!;

      expect(profile1.runs).toBe(1);
      expect(profile1.failures).toBe(0);
      expect(profile1.successRate).toBe(1.0);

      expect(profile2.runs).toBe(1);
      expect(profile2.failures).toBe(1);
      expect(profile2.successRate).toBe(0.0);

      // Recommender should suggest FastAPIQuery because of 100% success rate vs 0%
      const recommended = registry.recommendTool("fetch");
      expect(recommended).not.toBeNull();
      expect(recommended!.name).toBe("FastAPIQuery");
    });
  });
});
