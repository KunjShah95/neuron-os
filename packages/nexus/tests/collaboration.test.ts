import { describe, test, expect } from "bun:test";
import { CollaborationWorkspace } from "../src/collaboration/workspace.js";
import { SessionHistory } from "../src/collaboration/history.js";
import { AgentSimulator } from "../src/simulation/simulator.js";
import { AdversarialArena } from "../src/simulation/arena.js";
import { BenchmarkSuite } from "../src/simulation/benchmarks.js";
import { NexusAgent } from "../src/core/agent.js";
import { InMemoryStorageAdapter } from "../src/storage/memory.js";

describe("Phase 3 Collaboration & Ecosystem", () => {
  describe("Real-Time Collaboration Spaces", () => {
    test("should manage participants and resolve concurrent state edits", () => {
      const workspace = new CollaborationWorkspace("test-room");

      // Join
      workspace.join({ id: "user-1", name: "Alice", type: "human", status: "idle" });
      workspace.join({ id: "agent-1", name: "NexusBot", type: "agent", status: "idle" });

      expect(workspace.getParticipants().length).toBe(2);

      // Status
      workspace.setStatus("agent-1", "thinking");
      expect(workspace.getParticipants().find((p) => p.id === "agent-1")?.status).toBe("thinking");

      // Last-Write-Wins set operation
      workspace.applyOperation({
        key: "config-param",
        value: "v1",
        timestamp: 1000,
        authorId: "user-1",
        type: "set",
      });

      workspace.applyOperation({
        key: "config-param",
        value: "v2",
        timestamp: 1002, // newer
        authorId: "agent-1",
        type: "set",
      });

      workspace.applyOperation({
        key: "config-param",
        value: "v3",
        timestamp: 1001, // older concurrent set (should be ignored)
        authorId: "user-1",
        type: "set",
      });

      expect(workspace.get("config-param")).toBe("v2");

      // Append operation
      workspace.applyOperation({
        key: "logs",
        value: "log item 1",
        timestamp: 1005,
        authorId: "user-1",
        type: "append",
      });

      workspace.applyOperation({
        key: "logs",
        value: "log item 2",
        timestamp: 1006,
        authorId: "agent-1",
        type: "append",
      });

      const logs = workspace.get("logs");
      expect(logs).toEqual(["log item 1", "log item 2"]);
    });
  });

  describe("Session Branching & Merging", () => {
    test("should branch reasoning chains and merge values chronologically", () => {
      const history = new SessionHistory();

      history.setValue("shared-state", "original");
      history.recordThought("Initial thought on main.");

      // Branch off
      history.branch("feature-hypo");
      history.checkout("feature-hypo");

      expect(history.getValue("shared-state")).toBe("original");

      history.setValue("shared-state", "modified");
      history.recordThought("Alternate path reasoning.");

      // Verify separation
      history.checkout("main");
      expect(history.getValue("shared-state")).toBe("original");

      // Merge back
      history.merge("feature-hypo", "main");
      expect(history.getValue("shared-state")).toBe("modified");
      expect(history.getActiveBranch().thoughts.length).toBe(2);
    });
  });

  describe("Simulation & Testing Environment", () => {
    test("should run simulator scenarios and validate assertions", async () => {
      const storage = new InMemoryStorageAdapter();
      const agent = new NexusAgent({
        name: "SimAgent",
        role: "Validation target",
        storage,
      });

      await storage.init();

      const simulator = new AgentSimulator(agent);
      simulator.addScenario({
        name: "Basic Echo test",
        goal: "Echo test result",
        assertions: [
          (res) => res.includes("Echo"),
          (_, a) => a.getState().status === "idle",
        ],
      });

      const reports = await simulator.runAll();
      expect(reports.length).toBe(1);
      expect(reports[0].passed).toBe(true);

      await storage.close();
    });

    test("should execute adversarial faceoffs and score debates", async () => {
      const storageRed = new InMemoryStorageAdapter();
      const storageBlue = new InMemoryStorageAdapter();

      const redAgent = new NexusAgent({
        name: "SecurityAuditor",
        role: "Attempts to find flaws in inputs",
        storage: storageRed,
      });

      const blueAgent = new NexusAgent({
        name: "PatchEngineer",
        role: "Attempts to patch or resolve flaws",
        storage: storageBlue,
      });

      await storageRed.init();
      await storageBlue.init();

      const arena = new AdversarialArena(redAgent, blueAgent);
      const report = await arena.conductFaceoff("Standard login controller endpoint code", 1);

      expect(report.roundsCount).toBe(1);
      expect(report.transcript.length).toBe(2);
      expect(report.score.redTeam).toBeGreaterThan(0);
      expect(report.score.blueTeam).toBeGreaterThan(0);

      await storageRed.close();
      await storageBlue.close();
    });

    test("should run performance profiling benchmarks", async () => {
      const storage = new InMemoryStorageAdapter();
      const agent = new NexusAgent({
        name: "BenchAgent",
        role: "Benchmark target",
        storage,
      });

      const bench = new BenchmarkSuite(agent);
      const metrics = await bench.runBenchmark("Standard test iteration goal", 2);

      expect(metrics.startupTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.opsPerSec).toBeGreaterThan(0);
      expect(metrics.totalTimeMs).toBeGreaterThan(0);
    });
  });
});
