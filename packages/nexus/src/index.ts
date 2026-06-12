// Core SDK Classes
export { NexusAgent } from "./core/agent.js";
export { NexusEngine } from "./core/engine.js";

// Core SDK Types
export type { AgentConfig, AgentState, Tool, AgentEventMap, AgentEventListener } from "./core/types.js";

// Storage Layer
export type { StorageAdapter, MemoryEntry } from "./storage/adapter.js";
export { InMemoryStorageAdapter } from "./storage/memory.js";
export { SQLiteStorageAdapter } from "./storage/sqlite.js";
export { InMemoryStorageAdapter as MemoryStorage } from "./storage/memory.js";
export { SQLiteStorageAdapter as SQLiteStorage } from "./storage/sqlite.js";

// Reasoning Engine Exports
export { ReActStrategy, TreeOfThoughtsStrategy } from "./core/reasoning.js";
export type { ReasoningStrategy, ReasoningStep, ReasoningResult } from "./core/reasoning.js";

// Memory Architecture Exports
export { ForgettingCurveEstimator } from "./memory/forgetting.js";
export { NexusMemoryManager } from "./memory/manager.js";
export type { MemoryType, MemorySlot, MemoryStats } from "./memory/types.js";

// Tool Abstraction Exports
export { ToolRegistry } from "./tools/registry.js";
export type { ToolProfile, RegisteredTool } from "./tools/registry.js";

// Collaboration & History Exports
export { CollaborationWorkspace } from "./collaboration/workspace.js";
export { SessionHistory } from "./collaboration/history.js";
export type { Participant, WorkspaceOperation } from "./collaboration/workspace.js";
export type { BranchState } from "./collaboration/history.js";

// Simulation & Benchmarking Exports
export { AgentSimulator } from "./simulation/simulator.js";
export { AdversarialArena } from "./simulation/arena.js";
export { BenchmarkSuite } from "./simulation/benchmarks.js";
export type { Scenario, SimulationReport } from "./simulation/simulator.js";
export type { DebateRound, ArenaReport } from "./simulation/arena.js";
export type { BenchmarkMetrics } from "./simulation/benchmarks.js";

// Economic Agent Layer Exports
export { TokenLedger, BankruptcyError } from "./economy/ledger.js";
export { ServicesMarket } from "./economy/market.js";
export type { ResourceCategory, CreditBalance } from "./economy/ledger.js";
export type { MarketService, ServiceTask } from "./economy/market.js";

// Explainability & Causality Exports
export { CausalTracker } from "./explainability/causality.js";
export { CounterfactualQuery } from "./explainability/counterfactual.js";
export { TemporalReplayer } from "./explainability/replay.js";
export type { CausalLink } from "./explainability/causality.js";
export type { CounterfactualReport } from "./explainability/counterfactual.js";
