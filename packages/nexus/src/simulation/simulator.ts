import { NexusAgent } from "../core/agent.js";

export interface Scenario {
  name: string;
  goal: string;
  assertions: Array<(result: string, agent: NexusAgent) => boolean | Promise<boolean>>;
}

export interface SimulationReport {
  scenarioName: string;
  passed: boolean;
  error?: string;
}

export class AgentSimulator {
  private agent: NexusAgent;
  private scenarios: Scenario[] = [];

  constructor(agent: NexusAgent) {
    this.agent = agent;
  }

  /**
   * Appends a test scenario scenario containing goal objectives and validation assertions.
   */
  addScenario(scenario: Scenario): void {
    this.scenarios.push(scenario);
  }

  /**
   * Executes all registered scenarios, verifying assertions and compiling reports.
   */
  async runAll(): Promise<SimulationReport[]> {
    const reports: SimulationReport[] = [];

    for (const sc of this.scenarios) {
      try {
        // Run goal
        const result = await this.agent.execute(sc.goal);
        
        // Check assertions
        let passed = true;
        for (let i = 0; i < sc.assertions.length; i++) {
          const check = await sc.assertions[i]!(result, this.agent);
          if (!check) {
            passed = false;
            break;
          }
        }

        reports.push({ scenarioName: sc.name, passed });
      } catch (err: any) {
        reports.push({
          scenarioName: sc.name,
          passed: false,
          error: err.message || String(err),
        });
      }
    }

    return reports;
  }
}
