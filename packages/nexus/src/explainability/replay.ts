import type { ReasoningStep } from "../core/reasoning.js";

export class TemporalReplayer {
  private steps: ReasoningStep[] = [];
  private pointer: number = -1;

  /**
   * Loads a list of historical reasoning steps for replaying.
   */
  loadSteps(steps: ReasoningStep[]): void {
    this.steps = steps;
    this.pointer = -1;
  }

  /**
   * Steps forward in time, returning the executed reasoning step.
   */
  stepForward(): ReasoningStep | null {
    if (this.pointer < this.steps.length - 1) {
      this.pointer++;
      return this.steps[this.pointer] ?? null;
    }
    return null;
  }

  /**
   * Steps backward in time.
   */
  stepBackward(): ReasoningStep | null {
    if (this.pointer >= 0) {
      const step = this.steps[this.pointer];
      this.pointer--;
      return step ?? null;
    }
    return null;
  }

  /**
   * Returns current position metadata.
   */
  getCurrentState(): { pointer: number; total: number; currentStep: ReasoningStep | null } {
    return {
      pointer: this.pointer,
      total: this.steps.length,
      currentStep: this.pointer >= 0 ? (this.steps[this.pointer] ?? null) : null,
    };
  }

  reset(): void {
    this.pointer = -1;
  }
}
