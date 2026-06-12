import {
  AgentConfig,
  AgentState,
  AgentEventMap,
  AgentEventListener,
  Tool,
} from "./types.js";
import { StorageAdapter } from "../storage/adapter.js";
import { NexusEngine } from "./engine.js";
import { ToolRegistry } from "../tools/registry.js";

export class NexusAgent {
  readonly config: AgentConfig;
  readonly storage: StorageAdapter;
  readonly registry: ToolRegistry;
  private state: AgentState;
  private listeners: { [K in keyof AgentEventMap]?: Set<any> } = {};
  private engine: NexusEngine;

  constructor(config: AgentConfig) {
    this.config = config;
    this.storage = config.storage;
    this.registry = new ToolRegistry();
    this.state = {
      status: "idle",
      goals: [],
      metadata: {},
    };
    this.engine = new NexusEngine(this);

    if (config.tools) {
      for (const tool of config.tools) {
        this.registerTool(tool);
      }
    }
  }

  /**
   * Registers a tool capability with the agent.
   */
  registerTool(tool: Tool, tags: string[] = []): void {
    this.registry.register(tool, tags);
  }

  /**
   * Gets a list of all registered tools.
   */
  getTools(): Tool[] {
    return this.registry.findToolsByIntent("");
  }

  /**
   * Gets a tool by name.
   */
  getTool(name: string): Tool | undefined {
    const matched = this.registry.findToolsByIntent(name);
    return matched.find((t) => t.name === name);
  }

  /**
   * Returns current internal state.
   */
  getState(): AgentState {
    return { ...this.state, metadata: { ...this.state.metadata } };
  }

  /**
   * Subscribes to agent lifecycle and reasoning events.
   */
  on<K extends keyof AgentEventMap>(event: K, listener: AgentEventListener<K>): this {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
    return this;
  }

  /**
   * Unsubscribes from an agent event.
   */
  off<K extends keyof AgentEventMap>(event: K, listener: AgentEventListener<K>): this {
    if (this.listeners[event]) {
      this.listeners[event]!.delete(listener);
    }
    return this;
  }

  /**
   * Emits an event to all subscribed listeners.
   */
  emit<K extends keyof AgentEventMap>(event: K, ...args: AgentEventMap[K]): void {
    const set = this.listeners[event];
    if (set) {
      for (const listener of set) {
        try {
          listener(...args);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }

  /**
   * Reactive state modifier that persists values to storage and emits change notifications.
   */
  async setMetadata(key: string, value: any): Promise<void> {
    this.state.metadata[key] = value;
    await this.storage.set(`meta:${key}`, value);
    this.emit("stateChange", key, value);
  }

  /**
   * Retrieves a persistent state property, updating the in-memory cache.
   */
  async getMetadata<T>(key: string): Promise<T | null> {
    const val = await this.storage.get<T>(`meta:${key}`);
    if (val !== null) {
      this.state.metadata[key] = val;
    }
    return val;
  }

  /**
   * Changes the agent status and fires notifications.
   */
  async setStatus(status: AgentState["status"]): Promise<void> {
    if (this.state.status !== status) {
      this.state.status = status;
      await this.storage.set("state:status", status);
      this.emit("statusChange", status);
    }
  }

  /**
   * Executes the planning and execution loop for a specific goal.
   */
  async execute(goal: string): Promise<string> {
    if (this.state.status !== "idle") {
      throw new Error(`Cannot execute goal. Agent is currently in "${this.state.status}" state.`);
    }

    this.state.currentGoal = goal;
    this.state.goals.push(goal);
    await this.storage.appendMemory("goals", goal, { timestamp: new Date().toISOString() });

    try {
      await this.setStatus("thinking");
      const result = await this.engine.run(goal);
      await this.setStatus("idle");
      this.state.currentGoal = undefined;
      return result;
    } catch (err) {
      await this.setStatus("error");
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.emit("error", errorObj);
      this.state.currentGoal = undefined;
      throw errorObj;
    }
  }
}
