export { SLOManager } from "./slo"
export type { SLOConfig, SLOResult } from "./slo"
export { TraceCollector } from "./integrations"
export type { TraceSpan } from "./integrations"
export { DashboardProvider } from "./dashboard"
export type { DashboardData } from "./dashboard"
import { SLOManager } from "./slo"
import { TraceCollector } from "./integrations"
export const sloManager = new SLOManager()
export const traceCollector = new TraceCollector()
