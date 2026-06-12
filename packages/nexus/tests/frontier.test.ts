import { describe, test, expect } from "bun:test";
import { TokenLedger, BankruptcyError } from "../src/economy/ledger.js";
import { ServicesMarket } from "../src/economy/market.js";
import { CausalTracker } from "../src/explainability/causality.js";
import { CounterfactualQuery } from "../src/explainability/counterfactual.js";
import { TemporalReplayer } from "../src/explainability/replay.js";
import { NexusAgent } from "../src/core/agent.js";
import { SessionHistory } from "../src/collaboration/history.js";
import { InMemoryStorageAdapter } from "../src/storage/memory.js";

describe("Phase 4 Frontier Innovations", () => {
  describe("Economic Agent Layer", () => {
    test("should track agent credits and trigger bankruptcy protocols", () => {
      const ledger = new TokenLedger();

      // Allocate
      ledger.allocate("agent-1", 100, "compute");
      expect(ledger.getBalance("agent-1").compute).toBe(100);

      // Deduct
      ledger.deduct("agent-1", 40, "compute");
      expect(ledger.getBalance("agent-1").compute).toBe(60);

      // Bankruptcy trigger
      expect(() => ledger.deduct("agent-1", 70, "compute")).toThrow(BankruptcyError);
    });

    test("should simulate dynamic pricing on services market", () => {
      const market = new ServicesMarket();

      // Register providers (supply = 2)
      market.registerService({ id: "p1", name: "Translation", providerId: "agent-1", basePrice: 10 });
      market.registerService({ id: "p2", name: "Translation", providerId: "agent-2", basePrice: 10 });

      // Check initial price (demand = 0, supply = 2)
      expect(market.quotePrice("Translation")).toBe(10); // 10 * (1 + 0/2)

      // Post tasks (demand increases)
      market.postTask({ id: "t1", serviceName: "Translation", bounty: 15, requesterId: "agent-3", status: "open" });
      market.postTask({ id: "t2", serviceName: "Translation", bounty: 15, requesterId: "agent-4", status: "open" });

      // Check updated price (demand = 2, supply = 2)
      expect(market.quotePrice("Translation")).toBe(20); // 10 * (1 + 2/2)

      // Fulfill
      market.fulfillTask("t1", "agent-1");
      expect(market.getTasks().find((t) => t.id === "t1")?.status).toBe("completed");
    });
  });

  describe("Explainability & Causality", () => {
    test("should construct decision causal lineage graph", () => {
      const tracker = new CausalTracker();

      // Record steps (Step 3 depends on Step 2, which depends on Step 1)
      tracker.recordDecision("Step-1-AnalyzeCode", ["Input-SourceCode-File"]);
      tracker.recordDecision("Step-2-IdentifyFlaw", ["Step-1-AnalyzeCode", "ModelHeuristics"]);
      tracker.recordDecision("Step-3-ProposePatch", ["Step-2-IdentifyFlaw"]);

      // Reconstruct trace
      const trace = tracker.traceCausality("Step-3-ProposePatch");
      expect(trace.length).toBe(3);
      expect(trace[0]).toBe("Step-3-ProposePatch <- [Step-2-IdentifyFlaw]");
      expect(trace[1]).toBe("Step-2-IdentifyFlaw <- [Step-1-AnalyzeCode, ModelHeuristics]");
      expect(trace[2]).toBe("Step-1-AnalyzeCode <- [Input-SourceCode-File]");
    });

    test("should perform counterfactual reasoning analysis", async () => {
      const storage = new InMemoryStorageAdapter();
      const agent = new NexusAgent({
        name: "HypothesisAgent",
        role: "Evaluates alternatives",
        storage,
      });

      await storage.init();

      const history = new SessionHistory();
      history.setValue("selected-algorithm", "Algorithm-A");

      const query = new CounterfactualQuery(agent, history);
      const report = await query.analyzeAlternative(
        "Execute computation task",
        "selected-algorithm",
        "Algorithm-B"
      );

      expect(report.originalValue).toBe("Algorithm-A");
      expect(report.alternativeValue).toBe("Algorithm-B");
      expect(report.originalResult).toContain("Executed Goal via ReAct");
      // Since it appended the context, the result should differ or be valid
      expect(report.alternativeResult).toContain("Algorithm-B");

      await storage.close();
    });

    test("should support step-by-step temporal replay", () => {
      const replayer = new TemporalReplayer();
      
      const steps = [
        { thought: "Analyzing project root", confidenceScore: 0.9 },
        { thought: "Found 12 files", confidenceScore: 0.95 },
        { thought: "Output finalized", confidenceScore: 0.98 },
      ];

      replayer.loadSteps(steps);
      expect(replayer.getCurrentState().pointer).toBe(-1);

      // Step forward
      const s1 = replayer.stepForward();
      expect(s1?.thought).toBe("Analyzing project root");
      expect(replayer.getCurrentState().pointer).toBe(0);

      replayer.stepForward();
      const s3 = replayer.stepForward();
      expect(s3?.thought).toBe("Output finalized");

      // Step backward
      const back = replayer.stepBackward();
      expect(back?.thought).toBe("Output finalized");
      expect(replayer.getCurrentState().pointer).toBe(1);
    });
  });
});
