import type { HookPoint, HookPhase, HookFn, HookContext, AgentInstance } from "./types"

interface HookRegistration {
  point: HookPoint
  phase: HookPhase
  fn: HookFn
  priority: number
  label?: string
}

/**
 * Registry for agent lifecycle hooks.
 *
 * Hooks execute in priority order (higher = first).
 * Pre-hooks run before the action, post-hooks after.
 */
export class HookRegistry {
  private hooks: HookRegistration[] = []

  /** Register a hook function. */
  register(
    point: HookPoint,
    phase: HookPhase,
    fn: HookFn,
    opts?: { priority?: number; label?: string },
  ): this {
    this.hooks.push({
      point,
      phase,
      fn,
      priority: opts?.priority ?? 0,
      label: opts?.label,
    })
    return this
  }

  /** Remove all hooks matching the given label. */
  unregister(label: string): this {
    this.hooks = this.hooks.filter((h) => h.label !== label)
    return this
  }

  /** Run all hooks for the given point+phase. */
  async run(
    point: HookPoint,
    phase: HookPhase,
    agentId: string,
    instance: AgentInstance,
    data?: unknown,
  ): Promise<Record<string, unknown>> {
    const meta: Record<string, unknown> = {}
    const matching = this.hooks
      .filter((h) => h.point === point && h.phase === phase)
      .sort((a, b) => b.priority - a.priority)

    for (const hook of matching) {
      const ctx: HookContext = {
        agentId,
        instance,
        phase,
        point,
        data,
        meta,
      }
      await hook.fn(ctx)
    }

    return meta
  }

  /** Remove all hooks. */
  clear(): void {
    this.hooks = []
  }

  /** Number of registered hooks. */
  get size(): number {
    return this.hooks.length
  }
}

/** Singleton instance (also available via AgentManager.hooks). */
export const globalHooks = new HookRegistry()
