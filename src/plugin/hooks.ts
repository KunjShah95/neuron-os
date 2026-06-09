export type PluginHookPoint = "on_agent_spawn" | "on_tool_call" | "on_message" | "on_ipc_message" | "on_shutdown"

export interface PluginHookContext {
  pluginName?: string
  [key: string]: unknown
}

export type PluginHookFn = (ctx: PluginHookContext) => void | Promise<void> | boolean | Promise<boolean>

export interface PluginHookRegistration {
  point: PluginHookPoint
  pluginName: string
  fn: PluginHookFn
  canBlock: boolean
  priority: number
}

export interface PluginHookRunResult {
  blocked: boolean
  results: unknown[]
}

export class PluginHookRegistry {
  private hooks: PluginHookRegistration[] = []

  register(hook: PluginHookRegistration): void {
    this.hooks.push(hook)
  }

  unregister(pluginName: string): void {
    this.hooks = this.hooks.filter((h) => h.pluginName !== pluginName)
  }

  async run(point: PluginHookPoint, ctx: Record<string, unknown>): Promise<PluginHookRunResult> {
    const matching = this.hooks
      .filter((h) => h.point === point)
      .sort((a, b) => b.priority - a.priority)

    const results: unknown[] = []
    let blocked = false

    for (const hook of matching) {
      const hookCtx: PluginHookContext = { ...ctx, pluginName: hook.pluginName }
      try {
        const result = await hook.fn(hookCtx)
        results.push(result)
        if (hook.canBlock && result === false) {
          blocked = true
        }
      } catch (err) {
        console.error(`[hooks] ${hook.pluginName} hook at ${point} failed:`, err)
        results.push({ __pluginHookError: true, pluginName: hook.pluginName, point })
      }
    }

    return { blocked, results }
  }

  clear(): void {
    this.hooks = []
  }

  get size(): number {
    return this.hooks.length
  }
}

export const pluginHooks = new PluginHookRegistry()
