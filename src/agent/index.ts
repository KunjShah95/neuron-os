export { AgentManager, agentManager } from "./manager"
export { HookRegistry, globalHooks } from "./hooks"
export { AgentRuntime, createAgentRuntime } from "./runtime"
export type { AgentContext } from "./runtime"
export { loadSoul } from "./soul"
export { AgentEngine } from "./engine"
export type { AgentEngineConfig } from "./engine"
export {
  AGENT_TYPES,
  getAgentType,
  getAllAgentTypes,
  getPrimaryAgentTypes,
  getSubagentTypes,
  isValidAgentType,
} from "./agent-types"
export type {
  AgentTypeName,
  AgentType,
  ToolPermission,
} from "./agent-types"

// Action tracking + approval system
export { ActionTracker } from "./action-tracker"
export type { ActionType, ActionStatus, ActionLog } from "./action-tracker"
export { AgentToolExecutor } from "./agent-tools"
export type { AgentToolConfig } from "./agent-tools"
export { promptApproval, applyAndReport } from "./approval"
export type {
  AgentStatus,
  AgentDef,
  AgentInstance,
  AgentLogEntry,
  AgentLogLevel,
  AgentIpcMessage,
  AgentIpcDirection,
  AgentEvent,
  AgentEventType,
  HookPoint,
  HookPhase,
  HookFn,
  HookContext,
  AgentManagerOptions,
  RecoveryConfig,
  RecoveryState,
} from "./types"
