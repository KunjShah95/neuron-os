import { createHash } from "crypto"
import type { AgentSpec } from "./schema"

interface CanonicalSpec {
  aV: string
  k: string
  m: { n: string; l: Record<string, string>; a: Record<string, string> }
  s: {
    t: string
    mo: { p: string; n: string; te?: number; ma?: number; tp?: number }
    sp: { te?: string; f?: string; aS?: boolean; aU?: boolean }
    to: { a: string[]; d: string[]; ts?: string }
    cf: string[]
    sk: string[]
    me: { ns: string; tt?: number; rk: number }
    h: Array<{ e: string; p: string; c: string }>
    e: Record<string, string>
    b?: { u?: number; to?: number }
    tr: Array<Record<string, unknown>>
  }
}

function toCanonical(spec: AgentSpec): CanonicalSpec {
  return {
    aV: spec.apiVersion,
    k: spec.kind,
    m: {
      n: spec.metadata.name,
      l: Object.fromEntries([...Object.entries(spec.metadata.labels)].sort()) as Record<string, string>,
      a: Object.fromEntries([...Object.entries(spec.metadata.annotations)].sort()) as Record<string, string>,
    },
    s: {
      t: spec.spec.type,
      mo: {
        p: spec.spec.model.provider,
        n: spec.spec.model.name,
        ...(spec.spec.model.temperature !== 0 ? { te: spec.spec.model.temperature } : {}),
        ...(spec.spec.model.max_tokens ? { ma: spec.spec.model.max_tokens } : {}),
        ...(spec.spec.model.top_p !== undefined ? { tp: spec.spec.model.top_p } : {}),
      },
      sp: {
        ...(spec.spec.system_prompt.template ? { te: spec.spec.system_prompt.template } : {}),
        ...(spec.spec.system_prompt.file ? { f: spec.spec.system_prompt.file } : {}),
        ...(!spec.spec.system_prompt.append_skills ? { aS: false } : {}),
        ...(!spec.spec.system_prompt.append_user_model ? { aU: false } : {}),
      },
      to: {
        a: [...(spec.spec.tools?.allow ?? [])].sort(),
        d: [...(spec.spec.tools?.deny ?? [])].sort(),
        ...(spec.spec.tools?.toolset ? { ts: spec.spec.tools.toolset } : {}),
      },
      cf: [...(spec.spec.context_files ?? [])].sort(),
      sk: [...(spec.spec.skills ?? [])].sort(),
      me: {
        ns: spec.spec.memory?.namespace ?? "default",
        ...(spec.spec.memory?.ttl_days ? { tt: spec.spec.memory.ttl_days } : {}),
        rk: spec.spec.memory?.recall_top_k ?? 3,
      },
      h: (spec.spec.hooks ?? []).map((h: any) => ({ e: h.event, p: h.phase, c: h.command })),
      e: Object.fromEntries([...Object.entries(spec.spec.env ?? {})].sort()) as Record<string, string>,
      ...(spec.spec.budget
        ? {
            b: {
              ...(spec.spec.budget.usd ? { u: spec.spec.budget.usd } : {}),
              ...(spec.spec.budget.tokens ? { to: spec.spec.budget.tokens } : {}),
            },
          }
        : {}),
      tr: (spec.spec.triggers ?? []).map((t: any) => Object.fromEntries(Object.entries(t).sort())),
    },
  }
}

export function hashSpec(spec: AgentSpec): string {
  const canonical = toCanonical(spec)
  const json = JSON.stringify(canonical)
  return createHash("sha256").update(json).digest("hex")
}

export function deriveSessionId(specHash: string, input: string): string {
  const combined = `${specHash}:${input}`
  return createHash("sha256").update(combined).digest("hex").slice(0, 16)
}
