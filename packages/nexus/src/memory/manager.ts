import type { StorageAdapter } from "../storage/adapter.js";
import type { MemorySlot, MemoryType, MemoryStats } from "./types.js";
import { ForgettingCurveEstimator } from "./forgetting.js";

export class NexusMemoryManager {
  private storage: StorageAdapter;
  private slots: MemorySlot[] = [];
  private estimator: ForgettingCurveEstimator;
  private forgottenCount = 0;

  constructor(
    storage: StorageAdapter,
    options: { retentionThreshold?: number; timeScaleMs?: number } = {}
  ) {
    this.storage = storage;
    this.estimator = new ForgettingCurveEstimator(options);
  }

  /**
   * Initializes the memory registry by reading stored memory structures from the adapter.
   */
  async init(): Promise<void> {
    const saved = await this.storage.get<MemorySlot[]>("nexus:memory-slots");
    if (saved) {
      this.slots = saved;
    }
  }

  /**
   * Appends an entry into a targeted tier in the memory hierarchy.
   */
  async addMemory(
    type: MemoryType,
    content: string,
    importance: number = 5,
    metadata: Record<string, any> = {}
  ): Promise<MemorySlot> {
    const timestamp = new Date().toISOString();
    const slot: MemorySlot = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      content,
      importance: Math.max(1, Math.min(10, importance)),
      createdAt: timestamp,
      lastAccessedAt: timestamp,
      accessCount: 1,
      metadata,
    };

    this.slots.push(slot);
    await this.persist();

    // Sync legacy storage adapter append for backwards compatibility
    await this.storage.appendMemory(type, content, {
      importance,
      id: slot.id,
      ...metadata,
    });

    return slot;
  }

  /**
   * Queries and returns active memory slots. Increments recall frequencies.
   */
  async getMemories(type?: MemoryType): Promise<MemorySlot[]> {
    const matched = type ? this.slots.filter((s) => s.type === type) : this.slots;
    const now = new Date().toISOString();

    // Increment recall counts and update access timestamp
    for (const slot of matched) {
      slot.accessCount++;
      slot.lastAccessedAt = now;
    }

    if (matched.length > 0) {
      await this.persist();
    }

    return matched;
  }

  /**
   * Triggers Ebbinghaus forgetting calculations and sweeps expired memory entries.
   */
  async consolidate(nowTimestamp: number = Date.now()): Promise<{ forgottenCount: number }> {
    const result = this.estimator.sweep(this.slots, nowTimestamp);
    const diff = this.slots.length - result.retained.length;

    this.slots = result.retained;
    this.forgottenCount += diff;

    await this.persist();

    return { forgottenCount: diff };
  }

  /**
   * Returns memory allocation and decay statistics.
   */
  getStats(): MemoryStats {
    const stats: Record<MemoryType, number> = {
      working: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
    };

    let totalImportance = 0;
    for (const slot of this.slots) {
      stats[slot.type]++;
      totalImportance += slot.importance;
    }

    return {
      totalSlots: this.slots.length,
      byType: stats,
      averageImportance: this.slots.length > 0 ? totalImportance / this.slots.length : 0,
      forgottenCount: this.forgottenCount,
    };
  }

  /**
   * Resets all cached and persisted memory registry entries.
   */
  async clear(): Promise<void> {
    this.slots = [];
    this.forgottenCount = 0;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.storage.set("nexus:memory-slots", this.slots);
  }
}
