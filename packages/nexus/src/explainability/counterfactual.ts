import { NexusAgent } from "../core/agent.js";
import { SessionHistory } from "../collaboration/history.js";

export interface CounterfactualReport {
  originalValue: any;
  alternativeValue: any;
  originalResult: string;
  alternativeResult: string;
  differs: boolean;
}

export class CounterfactualQuery {
  private agent: NexusAgent;
  private history: SessionHistory;

  constructor(agent: NexusAgent, history: SessionHistory) {
    this.agent = agent;
    this.history = history;
  }

  /**
   * Spawns a parallel session branch, overrides a historical parameter,
   * executes the agent, and compares the outcome with the original execution.
   */
  async analyzeAlternative(
    goal: string,
    stateKey: string,
    alternativeVal: any
  ): Promise<CounterfactualReport> {
    const originalVal = this.history.getValue(stateKey);
    const originalResult = await this.agent.execute(goal);

    // 1. Branch session
    const branchName = `what-if-${stateKey}-${Date.now()}`;
    this.history.branch(branchName);
    this.history.checkout(branchName);

    // 2. Override parameter
    this.history.setValue(stateKey, alternativeVal);
    this.history.recordThought(`Overriding "${stateKey}" to "${alternativeVal}" for counterfactual study.`);

    // 3. Execute alternative run
    const alternativeResult = await this.agent.execute(
      `${goal} (using alternative context: ${stateKey} = ${alternativeVal})`
    );

    // Return to main branch
    this.history.checkout("main");

    return {
      originalValue: originalVal,
      alternativeValue: alternativeVal,
      originalResult,
      alternativeResult,
      differs: originalResult !== alternativeResult,
    };
  }
}
