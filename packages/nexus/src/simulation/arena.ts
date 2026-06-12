import { NexusAgent } from "../core/agent.js";

export interface DebateRound {
  speaker: string;
  response: string;
  timestamp: string;
}

export interface ArenaReport {
  roundsCount: number;
  transcript: DebateRound[];
  score: { redTeam: number; blueTeam: number };
}

export class AdversarialArena {
  private redAgent: NexusAgent;
  private blueAgent: NexusAgent;

  constructor(redAgent: NexusAgent, blueAgent: NexusAgent) {
    this.redAgent = redAgent;
    this.blueAgent = blueAgent;
  }

  /**
   * Conducts a multi-turn debate or audit challenge between red-team and blue-team agents.
   * Red Agent attacks/audits, Blue Agent defends/resolves.
   */
  async conductFaceoff(initialTopic: string, turns: number = 3): Promise<ArenaReport> {
    const transcript: DebateRound[] = [];
    let currentInput = initialTopic;

    let redScore = 0;
    let blueScore = 0;

    for (let i = 0; i < turns; i++) {
      // 1. Red Agent turn (e.g. attack/critique)
      const redResult = await this.redAgent.execute(
        `Review or critique this input for flaws: ${currentInput}`
      );
      transcript.push({
        speaker: this.redAgent.config.name,
        response: redResult,
        timestamp: new Date().toISOString(),
      });

      // Simple scoring evaluation stub based on critique depth
      if (redResult.toLowerCase().includes("flaw") || redResult.toLowerCase().includes("crashed")) {
        redScore += 2;
      } else {
        redScore += 1;
      }

      // 2. Blue Agent turn (e.g. defend/resolve)
      const blueResult = await this.blueAgent.execute(
        `Resolve and patch these concerns: ${redResult}`
      );
      transcript.push({
        speaker: this.blueAgent.config.name,
        response: blueResult,
        timestamp: new Date().toISOString(),
      });

      if (blueResult.toLowerCase().includes("patch") || blueResult.toLowerCase().includes("resolved")) {
        blueScore += 2;
      } else {
        blueScore += 1;
      }

      // Next round input
      currentInput = blueResult;
    }

    return {
      roundsCount: turns,
      transcript,
      score: { redTeam: redScore, blueTeam: blueScore },
    };
  }
}
