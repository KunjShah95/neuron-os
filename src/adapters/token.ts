import { timingSafeEqual } from "node:crypto"

export type ApiKeyValidator = (token: string) => Promise<boolean>

export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a, "utf-8")
  const bufB = Buffer.from(b, "utf-8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function matchesToken(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) return false
  if (!provided) return false
  return safeEqual(provided, expected)
}

/**
 * Validate a token against the RBAC API key store.
 * Aegis API keys are minted as "aegis_" + 32 random bytes, so the prefix is a
 * cheap pre-filter; the key itself must exist and be enabled.
 */
export async function validateRbacApiKey(token: string): Promise<boolean> {
  if (!token || !token.startsWith("aegis_")) return false
  const { rbacManager } = await import("../auth")
  const result = rbacManager.validateApiKey(token)
  if (!result.valid) return false
  const permissions = result.permissions ?? []
  return permissions.includes("agent:view") || permissions.includes("admin:all")
}
