import { Tool } from "../core/types.js";

export interface ToolProfile {
  name: string;
  runs: number;
  failures: number;
  totalLatency: number;
  successRate: number;
  avgLatency: number;
}

export type RegisteredTool = Tool & { tags: string[] };

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private profiles = new Map<string, ToolProfile>();

  /**
   * Registers a tool capability with associated intent/discovery tags.
   */
  register(tool: Tool, tags: string[] = []): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered in this registry.`);
    }

    this.tools.set(tool.name, { ...tool, tags });
    this.profiles.set(tool.name, {
      name: tool.name,
      runs: 0,
      failures: 0,
      totalLatency: 0,
      successRate: 1.0,
      avgLatency: 0,
    });
  }

  /**
   * Finds registered tools by tag or matching search query.
   */
  findToolsByIntent(intent: string): Tool[] {
    const query = intent.toLowerCase();
    const results: Tool[] = [];

    for (const tool of this.tools.values()) {
      const match =
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.tags.some((tag) => tag.toLowerCase().includes(query));

      if (match) {
        results.push(tool);
      }
    }

    return results;
  }

  /**
   * Returns a recommendation for the optimal tool, sorting by higher reliability
   * (successRate) and lower performance overhead (avgLatency).
   */
  recommendTool(intent: string): Tool | null {
    const candidates = this.findToolsByIntent(intent);
    if (candidates.length === 0) return null;

    return candidates.sort((a, b) => {
      const pA = this.profiles.get(a.name)!;
      const pB = this.profiles.get(b.name)!;

      // Primary sort: Success rate (higher is better)
      if (pA.successRate !== pB.successRate) {
        return pB.successRate - pA.successRate;
      }
      // Secondary sort: Latency (lower is better)
      return pA.avgLatency - pB.avgLatency;
    })[0];
  }

  /**
   * Runs a tool inside a sandboxed execution wrapper simulating timeout boundaries
   * and resource logging. Updates performance profiles.
   */
  async executeSandboxed<T = any>(
    toolName: string,
    args: any,
    cpuTimeoutMs: number = 2000
  ): Promise<T> {
    const tool = this.tools.get(toolName);
    const profile = this.profiles.get(toolName);

    if (!tool || !profile) {
      throw new Error(`Tool "${toolName}" is not registered in the registry.`);
    }

    profile.runs++;
    const start = Date.now();

    try {
      // Simulate WASM sandbox capability isolation and resource timeout bounds
      const executionPromise = tool.execute(args);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Sandbox resource limit exceeded (CPU timeout: ${cpuTimeoutMs}ms)`)),
          cpuTimeoutMs
        )
      );

      const result = await Promise.race([executionPromise, timeoutPromise]);

      const duration = Date.now() - start;
      profile.totalLatency += duration;
      profile.avgLatency = profile.totalLatency / profile.runs;
      profile.successRate = (profile.runs - profile.failures) / profile.runs;

      return result as T;
    } catch (err) {
      profile.failures++;
      profile.successRate = (profile.runs - profile.failures) / profile.runs;
      throw err;
    }
  }

  /**
   * Returns all performance profile records.
   */
  getProfiles(): ToolProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Returns a specific tool profile record.
   */
  getProfile(toolName: string): ToolProfile | undefined {
    return this.profiles.get(toolName);
  }
}
