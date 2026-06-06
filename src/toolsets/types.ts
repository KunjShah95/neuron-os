import { z } from "zod"

export const ToolsetDef = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  tools: z.array(z.string()).default([]),
  includes: z.array(z.string()).default([]),
})

export type ToolsetDef = z.infer<typeof ToolsetDef>

export interface ResolvedToolset {
  name: string
  description: string
  tools: string[]
}
