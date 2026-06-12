export type ResourceCategory = "compute" | "memory" | "api";

export class BankruptcyError extends Error {
  readonly agentId: string;
  readonly category: ResourceCategory;

  constructor(agentId: string, category: ResourceCategory) {
    super(`Bankruptcy Protocol activated: Agent "${agentId}" exhausted "${category}" credits.`);
    this.name = "BankruptcyError";
    this.agentId = agentId;
    this.category = category;
  }
}

export interface CreditBalance {
  compute: number;
  memory: number;
  api: number;
}

export class TokenLedger {
  private balances = new Map<string, CreditBalance>();

  /**
   * Initializes or allocates credit tokens for an agent.
   */
  allocate(agentId: string, amount: number, category: ResourceCategory = "compute"): void {
    if (!this.balances.has(agentId)) {
      this.balances.set(agentId, { compute: 0, memory: 0, api: 0 });
    }
    const bal = this.balances.get(agentId)!;
    bal[category] += amount;
  }

  /**
   * Deducts credits, throwing BankruptcyError if the balance falls below zero.
   */
  deduct(agentId: string, amount: number, category: ResourceCategory = "compute"): void {
    const bal = this.balances.get(agentId);
    if (!bal || bal[category] < amount) {
      // Set to 0 or leave negative, then trigger bankruptcy
      if (bal) bal[category] -= amount;
      throw new BankruptcyError(agentId, category);
    }
    bal[category] -= amount;
  }

  /**
   * Returns the credit balance for an agent.
   */
  getBalance(agentId: string): CreditBalance {
    return this.balances.get(agentId) ?? { compute: 0, memory: 0, api: 0 };
  }
}
