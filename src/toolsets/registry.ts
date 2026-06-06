import type { ToolsetDef, ResolvedToolset } from "./types"
import { BUNDLED_TOOLSETS } from "./bundled"

export class ToolsetRegistry {
  private toolsets = new Map<string, ToolsetDef>()

  constructor() {
    for (const ts of BUNDLED_TOOLSETS) {
      this.register(ts)
    }
  }

  register(def: ToolsetDef): void {
    this.toolsets.set(def.name, def)
  }

  resolveToolset(name: string): ResolvedToolset {
    const def = this.toolsets.get(name)
    if (!def) throw new Error(`Unknown toolset: ${name}`)

    if (name === "all") {
      const allTools = new Set<string>()
      for (const [, ts] of this.toolsets) {
        for (const t of ts.tools) allTools.add(t)
      }
      return { name: "all", description: def.description, tools: [...allTools] }
    }

    const tools = this.resolveTools(name, new Set())
    return { name: def.name, description: def.description, tools: [...tools] }
  }

  private resolveTools(name: string, visited: Set<string>): Set<string> {
    if (visited.has(name)) throw new Error(`Circular toolset include: ${name}`)
    visited.add(name)

    const def = this.toolsets.get(name)
    if (!def) throw new Error(`Unknown toolset: ${name}`)

    const tools = new Set(def.tools)
    for (const inc of def.includes) {
      const included = this.resolveTools(inc, visited)
      for (const t of included) tools.add(t)
    }
    return tools
  }

  resolveMultipleToolsets(names: string[]): ResolvedToolset {
    const allTools = new Set<string>()
    for (const name of names) {
      const resolved = this.resolveToolset(name)
      for (const t of resolved.tools) allTools.add(t)
    }
    return { name: names.join("+"), description: `Combined: ${names.join(", ")}`, tools: [...allTools] }
  }

  listToolsets(): ToolsetDef[] {
    return [...this.toolsets.values()]
  }

  getToolsetInfo(name: string): ToolsetDef | undefined {
    return this.toolsets.get(name)
  }
}

export const toolsetRegistry = new ToolsetRegistry()
