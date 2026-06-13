/**
 * Structured error codes for Aegis.
 *
 * Every user-facing error should use one of these codes so users
 * can search docs/issues for the exact error.
 *
 * Format: AEGIS_EXXX
 */

export const ERR = {
  /** No AI provider is configured (API keys missing) */
  NO_PROVIDER: "AEGIS_E001",
  /** The task budget in USD has been exceeded */
  BUDGET_EXCEEDED: "AEGIS_E002",
  /** An agent timed out during execution */
  AGENT_TIMEOUT: "AEGIS_E003",
  /** Invalid config file or environment */
  INVALID_CONFIG: "AEGIS_E004",
  /** Network failure (API unreachable, DNS, etc.) */
  NETWORK_FAILURE: "AEGIS_E005",
  /** Sandbox (Docker/process) is unavailable */
  SANDBOX_UNAVAIL: "AEGIS_E006",
  /** Session was not found */
  SESSION_NOT_FOUND: "AEGIS_E007",
  /** The AI provider returned an error */
  PROVIDER_ERROR: "AEGIS_E008",
} as const

export type ErrorCode = (typeof ERR)[keyof typeof ERR]

/**
 * Format an error message with its structured code.
 *
 * Example output: `[AEGIS_E001] No AI provider configured.`
 */
export function formatError(code: ErrorCode, message: string): string {
  return `[${code}] ${message}`
}
