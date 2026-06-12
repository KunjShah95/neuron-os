export interface MarketService {
  id: string;
  name: string; // e.g. "Translation", "CodeAudit"
  providerId: string;
  basePrice: number;
}

export interface ServiceTask {
  id: string;
  serviceName: string;
  bounty: number;
  requesterId: string;
  status: "open" | "completed";
  fulfilledBy?: string;
}

export class ServicesMarket {
  private services: MarketService[] = [];
  private tasks: ServiceTask[] = [];
  private demandCount = new Map<string, number>();

  /**
   * Registers a service provider.
   */
  registerService(service: MarketService): void {
    this.services.push(service);
  }

  /**
   * Requests a service task, specifying a bounty.
   * Tracks demand of the service to dynamically adjust market prices.
   */
  postTask(task: ServiceTask): void {
    this.tasks.push(task);
    const count = this.demandCount.get(task.serviceName) ?? 0;
    this.demandCount.set(task.serviceName, count + 1);
  }

  /**
   * Fulfills a task.
   */
  fulfillTask(taskId: string, providerId: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task && task.status === "open") {
      task.status = "completed";
      task.fulfilledBy = providerId;
    }
  }

  /**
   * Simulates dynamic pricing based on supply and demand:
   * price = basePrice * (1 + demand / supply)
   */
  quotePrice(serviceName: string): number {
    const providers = this.services.filter((s) => s.name === serviceName);
    const supply = providers.length;
    const demand = this.demandCount.get(serviceName) ?? 0;

    if (supply === 0) return 0;

    // Use first provider basePrice as quote standard
    const base = providers[0].basePrice;
    return base * (1 + demand / supply);
  }

  getTasks(): ServiceTask[] {
    return this.tasks;
  }
}
