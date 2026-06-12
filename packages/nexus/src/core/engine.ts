import { NexusAgent } from "./agent.js";
import { ReasoningStrategy, ReActStrategy, ReasoningResult } from "./reasoning.js";

export class NexusEngine {
  private agent: NexusAgent;
  private strategy: ReasoningStrategy;

  constructor(agent: NexusAgent) {
    this.agent = agent;
    this.strategy = new ReActStrategy(); // Defaults to ReAct strategy
  }

  /**
   * Updates the reasoning strategy executed by the engine.
   */
  setStrategy(strategy: ReasoningStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Returns the current active reasoning strategy.
   */
  getStrategy(): ReasoningStrategy {
    return this.strategy;
  }

  /**
   * Core run loop delegating the execution process to the active strategy.
   */
  async run(goal: string): Promise<string> {
    // Execute the planning strategy
    const result: ReasoningResult = await this.strategy.execute(this.agent, goal);

    // Persist details for observability
    const runTimestamp = Date.now();
    await this.agent.storage.set(`runs:${runTimestamp}`, {
      goal,
      strategy: this.strategy.name,
      confidenceScore: result.confidenceScore,
      uncertaintyReasons: result.uncertaintyReasons,
      stepsCount: result.steps.length,
      timestamp: new Date().toISOString(),
    });

    // Record distilled semantic memories of the outcome
    await this.agent.storage.appendMemory(
      "semantic",
      `Learned execution pattern for goal "${goal}" using ${this.strategy.name} strategy.`,
      { confidence: result.confidenceScore }
    );

    return result.output;
  }
}
