/**
 * plugin/types — Type definitions for the Plugin Marketplace.
 *
 * Defines the schema for signed plugin manifests, dependency specifications,
 * and registry index entries used throughout the plugin system.
 */

// ── Version / Dependency ─────────────────────────────────────────────

/** A semver-compatible version string (e.g., "1.2.3", ">=2.0.0 <3.0.0") */
export type VersionSpec = string

/** A concrete version string (e.g., "1.2.3") */
export type ConcreteVersion = string

/** Dependency specification: plugin name → semver range */
export interface DependencySpec {
  name: string
  /** Semver range, e.g. "^1.0.0", ">=2.0.0 <3.0.0", "*" */
  version: VersionSpec
  /** Whether this dependency is optional (soft dependency) */
  optional?: boolean
}

// ── Signature ─────────────────────────────────────────────────────────

/** Ed25519 signature over a canonical JSON representation of the manifest */
export interface PluginSignature {
  /** Ed25519 public key (base64url-encoded, 44 chars) */
  publicKey: string
  /** Ed25519 signature (base64url-encoded, 88 chars) */
  value: string
  /** ISO timestamp of when the signature was created */
  signedAt: string
  /** Algorithm used — always "ed25519" for v1 */
  algorithm: "ed25519"
}

// ── Manifest ──────────────────────────────────────────────────────────

/** Full signed plugin manifest stored in the registry */
export interface SignedPluginManifest {
  name: string
  description: string
  version: ConcreteVersion
  author?: string
  /** Optional homepage or repository URL */
  url?: string
  tags?: string[]
  /** Dependencies this plugin requires */
  dependencies?: DependencySpec[]
  /** Plugins this plugin conflicts with */
  conflicts?: string[]
  /** Minimum engine version required */
  engine?: { aegis?: VersionSpec }
  /** ISO timestamp of publication */
  publishedAt: string
  /** Cryptographic signature for integrity verification */
  signature?: PluginSignature
}

/** Minimal manifest used in registry list views (no signature/deps) */
export interface RegistryManifest {
  name: string
  description: string
  version: string
  author?: string
  tags?: string[]
  publishedAt: string
  /** Whether this entry has a verified signature */
  signed: boolean
  /** Number of direct dependencies (for display) */
  dependencyCount: number
}

// ── Registry Index ────────────────────────────────────────────────────

/** Structure of the local registry index file (~/.aegis/registry/index.json) */
export interface RegistryIndex {
  /** Schema version for forward compatibility */
  version: number
  plugins: Record<string, SignedPluginManifest>
  /** Mapping from plugin name → install state */
  installed: Record<string, InstalledPluginInfo>
}

export interface InstalledPluginInfo {
  name: string
  version: string
  installedAt: string
  /** Path relative to ~/.aegis/registry/packages/{name} */
  path: string
  /** Whether the signature was verified at install time */
  signatureVerified: boolean
  /** Whether dependencies were resolved at install time */
  dependenciesResolved: boolean
}

// ── Resolution Result ────────────────────────────────────────────────

export interface DependencyGraph {
  /** All nodes in the graph (name → version) */
  nodes: Map<string, ConcreteVersion>
  /** Edges: dependant → dependency */
  edges: Array<{ from: string; to: string; spec: VersionSpec }>
  /** Any cycles detected (list of node names forming the cycle) */
  cycles: string[][]
  /** Missing dependencies that couldn't be resolved */
  unresolved: Array<{ name: string; spec: VersionSpec; requiredBy: string }>
  /** Whether the graph is fully resolved with no cycles or missing deps */
  isResolved: boolean
}

// ── Plugin Author Key ────────────────────────────────────────────────

/** Local author key pair stored in ~/.aegis/registry/author-key.json */
export interface AuthorKeyPair {
  /** Ed25519 public key (base64url-encoded) */
  publicKey: string
  /** Ed25519 private key (base64url-encoded) */
  privateKey: string
  /** ISO timestamp of key creation */
  createdAt: string
  /** Optional comment to identify this key */
  comment?: string
}
