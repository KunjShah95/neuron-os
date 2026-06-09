/**
 * plugin — Plugin Marketplace module.
 *
 * v0.11.0: Signed plugin registry with dependency resolution.
 *
 * Provides:
 *   - Ed25519 signing/verification of plugin manifests
 *   - Semver dependency resolution with cycle detection
 *   - Registry index management (publish, install, remove)
 *   - CLI commands: sign, verify, info, depends, update
 */

export * from "./types"
export * from "./crypto"
export * from "./resolver"
