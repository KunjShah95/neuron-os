import pc from "picocolors";
import {
  NexusAgent,
  SQLiteStorage,
  TreeOfThoughtsStrategy,
  NexusMemoryManager,
  CollaborationWorkspace,
  SessionHistory,
  ToolRegistry,
  TokenLedger,
  CausalTracker,
  TemporalReplayer,
} from "../src/index.js";
import type { Tool } from "../src/index.js";
import { z } from "zod";

async function main() {
  console.log(pc.bold(pc.magenta("🌟 Welcome to the Nexus Agent Framework Showcase 🌟\n")));

  // 1. Initialize Adaptive SQLite and Agent
  console.log(pc.bold("⚡ 1. Initializing Agent & SQLite Storage Adapter..."));
  const storage = new SQLiteStorage({ dbPath: "./data/nexus-showcase.db" });
  await storage.init();
  await storage.clear(); // Reset for demo run

  const agent = new NexusAgent({
    name: "ArchitectAgent",
    role: "System design optimizer",
    storage,
  });

  // Attach reactive telemetry listeners
  agent.on("thought", (t) => console.log(`  ${pc.cyan("🧠 [Thought]:")} ${t}`));
  agent.on("action", (name, args) =>
    console.log(`  ${pc.magenta("⚡ [Action]:")} Executing ${pc.bold(name)} with: ${JSON.stringify(args)}`)
  );
  agent.on("revision", (critique, plan) => {
    console.log(`  ${pc.yellow("⚠️ [Self-Critique]:")} ${critique}`);
    console.log(`  ${pc.yellow("🔧 [Revision Plan]:")} ${plan}`);
  });

  console.log(pc.green("✔ Agent successfully initialized with reactive listeners.\n"));

  // 2. Pluggable Reasoning Strategies
  console.log(pc.bold("🧠 2. Running Pluggable Reasoning strategies..."));
  console.log(pc.dim("  Default strategy is ReAct. Executing goal..."));
  const reactRes = await agent.execute("Test capability run");
  console.log(`  ${pc.green("✔ ReAct Output:")} ${pc.italic(reactRes)}`);

  console.log(pc.dim("\n  Switching to Tree of Thoughts strategy..."));
  const engine = (agent as any).engine;
  engine.setStrategy(new TreeOfThoughtsStrategy());
  const totRes = await agent.execute("Evaluate alternative execution branches");
  console.log(`  ${pc.green("✔ Tree of Thoughts Output:")} ${pc.italic(totRes)}\n`);

  // 3. Hierarchical Memory & Ebbinghaus Decay
  console.log(pc.bold("💾 3. Memory Hierarchy & Ebbinghaus Forgetting Decay..."));
  const memoryManager = new NexusMemoryManager(storage, {
    retentionThreshold: 0.5,
    timeScaleMs: 200, // 200ms real time = 1 decay unit
  });
  await memoryManager.init();
  await memoryManager.clear();

  console.log(pc.dim("  Adding working memory (low importance) and semantic memory (high importance)..."));
  await memoryManager.addMemory("working", "Local iterator variable index: 12", 2);
  await memoryManager.addMemory("semantic", "Primary encryption signature key hash", 9);

  let stats = memoryManager.getStats();
  console.log(`  Initial memory slots: ${stats.totalSlots} (Working: ${stats.byType.working}, Semantic: ${stats.byType.semantic})`);

  console.log(pc.dim("  Waiting 600ms for memory decay to take effect..."));
  await new Promise((r) => setTimeout(r, 600));

  const { forgottenCount } = await memoryManager.consolidate();
  stats = memoryManager.getStats();
  console.log(`  Sweep completed: forgotten ${forgottenCount} slot(s). Remaining: ${stats.totalSlots}`);
  const remaining = await memoryManager.getMemories();
  console.log(`  Remaining Memory: "${pc.bold(remaining[0].content)}" (Importance: ${remaining[0].importance})\n`);

  // 4. Capability Sandbox Registry & Profiling
  console.log(pc.bold("🛠️  4. Tool Registry & Performance Profiling Sandbox..."));
  const registry = new ToolRegistry();

  const mockFastTool: Tool = {
    name: "FastCompiler",
    description: "Runs code compilation",
    inputSchema: z.object({}),
    execute: async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "Compiled successfully";
    },
  };

  const mockSlowTool: Tool = {
    name: "SlowLinter",
    description: "Performs full style checks",
    inputSchema: z.object({}),
    execute: async () => {
      await new Promise((r) => setTimeout(r, 80));
      return "Style clean";
    },
  };

  registry.register(mockFastTool, ["build", "fast"]);
  registry.register(mockSlowTool, ["lint", "slow"]);

  console.log(pc.dim("  Executing tools within sandboxed resources..."));
  await registry.executeSandboxed("FastCompiler", {});
  await registry.executeSandboxed("SlowLinter", {});

  const profiles = registry.getProfiles();
  console.log("  Performance profiles generated:");
  for (const prof of profiles) {
    console.log(
      `    - ${pc.bold(prof.name)} | runs: ${prof.runs} | success rate: ${
        prof.successRate * 100
      }% | avg latency: ${prof.avgLatency.toFixed(1)}ms`
    );
  }
  console.log();

  // 5. Workspaces & Branching History
  console.log(pc.bold("👥 5. Collaboration Spaces & Branching History..."));
  const workspace = new CollaborationWorkspace("shared-room-1");
  workspace.join({ id: "agent-1", name: agent.config.name, type: "agent", status: "idle" });
  workspace.join({ id: "user-1", name: "DevLead", type: "human", status: "idle" });

  console.log(`  Participants in workspace: ${workspace.getParticipants().map((p) => `${p.name} (${p.type})`).join(", ")}`);

  const history = new SessionHistory();
  history.setValue("target-framework", "Nexus");
  history.recordThought("Started study of runtime performance.");

  console.log(pc.dim("  Branching session history for alternative hypothesis..."));
  history.branch("framework-alt");
  history.checkout("framework-alt");
  history.setValue("target-framework", "Aegis");
  history.recordThought("Reviewing alternative framework.");

  console.log(`  Active branch is: "${history.getActiveBranch().name}". Value: "${history.getValue("target-framework")}"`);

  history.checkout("main");
  console.log(`  Active branch restored to: "${history.getActiveBranch().name}". Value: "${history.getValue("target-framework")}"`);

  history.merge("framework-alt", "main");
  console.log(`  Merged "framework-alt" back. Updated Value: "${history.getValue("target-framework")}"\n`);

  // 6. Token Economics
  console.log(pc.bold("🪙 6. Economic Agent Resource Allocations..."));
  const ledger = new TokenLedger();
  ledger.allocate("ArchitectAgent", 50, "compute");
  console.log(`  Allocated compute tokens: ${ledger.getBalance("ArchitectAgent").compute}`);

  console.log(pc.dim("  Deducting compute credits for task run..."));
  ledger.deduct("ArchitectAgent", 20, "compute");
  console.log(`  Remaining credits: ${ledger.getBalance("ArchitectAgent").compute}`);

  try {
    console.log(pc.dim("  Simulating resource overrun (busting budget)..."));
    ledger.deduct("ArchitectAgent", 45, "compute");
  } catch (err: any) {
    console.log(`  ${pc.red("✔ Triggered Escalation:")} ${err.message}\n`);
  }

  // 7. Causality & Replayer Debugger
  console.log(pc.bold("🔍 7. Explainability & Causal Debugger Replay..."));
  const tracker = new CausalTracker();
  tracker.recordDecision("Action-InitWorkspace", ["Config-Path-Valid"]);
  tracker.recordDecision("Action-RunOptimizations", ["Action-InitWorkspace", "Rules-MinifyEnabled"]);

  console.log("  Causal Dependency Lineage Trace:");
  const trace = tracker.traceCausality("Action-RunOptimizations");
  for (const step of trace) {
    console.log(`    - ${step}`);
  }

  console.log(pc.dim("\n  Loading reasoning steps into Replayer Debugger..."));
  const replayer = new TemporalReplayer();
  replayer.loadSteps([
    { thought: "Scanning files", confidenceScore: 0.9 },
    { thought: "Found 12 issues", confidenceScore: 0.95 },
  ]);

  console.log(`    Step 1: "${replayer.stepForward()?.thought}"`);
  console.log(`    Step 2: "${replayer.stepForward()?.thought}"`);
  console.log(`    Step backward: "${replayer.stepBackward()?.thought}"`);

  await storage.close();
  console.log(pc.bold(pc.green("\n🏁 Showcase Demo successfully completed with zero errors!\n")));
}

main().catch((err) => {
  console.error("Showcase run failed:", err);
});
