import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter.js";

export const AgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  role: z.string().min(1, "Agent role description is required"),
  options: z.record(z.string(), z.any()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema> & {
  storage: StorageAdapter;
  tools?: Tool[];
};

export interface AgentState {
  status: "idle" | "thinking" | "executing" | "error";
  goals: string[];
  currentGoal?: string;
  metadata: Record<string, any>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any> | Record<string, any>;
  execute(args: any): Promise<any>;
}

export type AgentEventMap = {
  thought: [thought: string];
  action: [toolName: string, args: any];
  revision: [critique: string, revisionPlan: string];
  stateChange: [key: string, value: any];
  statusChange: [status: AgentState["status"]];
  error: [error: Error];
};

export type AgentEventListener<K extends keyof AgentEventMap> = (...args: AgentEventMap[K]) => void;
