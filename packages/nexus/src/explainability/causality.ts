export interface CausalLink {
  actionId: string;
  triggeringFactors: string[]; // variables, memories, or inputs
  timestamp: string;
}

export class CausalTracker {
  private links: CausalLink[] = [];

  /**
   * Logs a decision action and its causal variables.
   */
  recordDecision(actionId: string, triggeringFactors: string[]): void {
    this.links.push({
      actionId,
      triggeringFactors,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Recursively reconstructs the dependency lineage for an action.
   */
  traceCausality(actionId: string): string[] {
    const trace: string[] = [];
    const queue = [actionId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const link = this.links.find((l) => l.actionId === current);
      if (link) {
        trace.push(`${current} <- [${link.triggeringFactors.join(", ")}]`);
        for (const factor of link.triggeringFactors) {
          // If the factor is also an actionId, trace it recursively
          if (this.links.some((l) => l.actionId === factor)) {
            queue.push(factor);
          }
        }
      }
    }

    return trace;
  }

  getLinks(): CausalLink[] {
    return this.links;
  }
}
