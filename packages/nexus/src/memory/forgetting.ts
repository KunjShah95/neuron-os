import { MemorySlot } from "./types.js";

export class ForgettingCurveEstimator {
  private retentionThreshold: number; // e.g. 0.35 (memories with R < threshold are pruned)
  private timeScaleMs: number; // Scale time so tests can run in milliseconds (e.g. 1000ms = 1 hour)

  constructor(options: { retentionThreshold?: number; timeScaleMs?: number } = {}) {
    this.retentionThreshold = options.retentionThreshold ?? 0.35;
    // By default, 1000ms in real time = 1 unit of memory decay time
    this.timeScaleMs = options.timeScaleMs ?? 1000;
  }

  /**
   * Calculates the retention probability R (0.0 to 1.0) of a memory slot.
   * Formula: R = exp(-t / S)
   * Where t is the elapsed time since last access,
   * and S is the memory strength.
   */
  calculateRetention(slot: MemorySlot, nowTimestamp: number): number {
    // Permanent memories (importance >= 8) never decay
    if (slot.importance >= 8) {
      return 1.0;
    }

    const lastAccessed = new Date(slot.lastAccessedAt).getTime();
    const elapsedUnits = (nowTimestamp - lastAccessed) / this.timeScaleMs;

    if (elapsedUnits <= 0) {
      return 1.0;
    }

    // Memory strength S increases with importance and recall repetition (accessCount)
    // S = importance * (1 + ln(accessCount))
    const strength = slot.importance * (1 + Math.log(slot.accessCount));

    // R = e^(-t / S)
    const retention = Math.exp(-elapsedUnits / strength);
    return Math.max(0, Math.min(1.0, retention));
  }

  /**
   * Sweeps memory slots, pruning or compacting those whose retention probability
   * has fallen below the threshold.
   * Returns: { retained: MemorySlot[], forgottenCount: number }
   */
  sweep(slots: MemorySlot[], nowTimestamp: number = Date.now()): {
    retained: MemorySlot[];
    forgottenCount: number;
  } {
    const retained: MemorySlot[] = [];
    let forgottenCount = 0;

    for (const slot of slots) {
      const R = this.calculateRetention(slot, nowTimestamp);
      if (R >= this.retentionThreshold) {
        retained.push(slot);
      } else {
        forgottenCount++;
      }
    }

    return { retained, forgottenCount };
  }
}
