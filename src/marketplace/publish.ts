/**
 * marketplace/publish — Publishing workflow for agent configurations.
 *
 * Handles loading agent.yaml from a directory, validating against schema,
 * signing with Ed25519, storing in registry, and generating changelog entries.
 */

import { readFile, readdir } from "node:fs/promises"
import { resolve, join } from "node:path"
import { parse } from "yaml"
import { validateAgentConfig } from "./schema"
import type { AgentConfig, AgentSignature } from "./types"
import type { MarketplaceRegistry } from "./registry"

/**
 * Load and parse an agent.yaml file from a directory.
 */
export async function loadAgentYaml(
  dir: string,
): Promise<{ config: AgentConfig; raw: Record<string, unknown> }> {
  const yamlPath = resolve(dir, "agent.yaml")
  const content = await readFile(yamlPath, "utf-8")
  const raw = parse(content) as Record<string, unknown>

  const result = validateAgentConfig(raw)
  if (!result.success) {
    const errs = result.errors?.map((e) => "  - " + e).join("\n") ?? "unknown error"
    throw new Error("Invalid agent.yaml:\n" + errs)
  }

  return { config: result.config!, raw }
}

/**
 * Sign an agent config using an Ed25519 private key.
 */
export async function signAgentConfig(
  config: AgentConfig,
  privateKeyBase64url: string,
): Promise<AgentSignature> {
  const { createHash, sign, createPrivateKey } = await import("node:crypto")

  const canonical = JSON.stringify({
    name: config.name,
    type: config.type,
    description: config.description,
    tools: [...config.tools].sort((a, b) => a.name.localeCompare(b.name)),
    prompt_template: config.prompt_template,
    budget_usd: config.budget_usd,
    sandbox: config.sandbox,
    provider: config.provider,
    tags: [...config.tags].sort(),
  })

  const hash = createHash("sha512").update(canonical).digest()
  const privateKey = Buffer.from(privateKeyBase64url, "base64url")
  const sig = sign(null, hash, { key: privateKey, format: "der", type: "pkcs8" })

  const privKey = createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" })
  const pubKeyDer = privKey.export({ type: "spki", format: "der" })

  return {
    publicKey: pubKeyDer.toString("base64url"),
    value: sig.toString("base64url"),
    signedAt: new Date().toISOString(),
    algorithm: "ed25519",
  }
}

/**
 * Load the author key from ~/.aegis/registry/author-key.json.
 */
export async function loadAuthorKey(): Promise<{
  publicKey: string
  privateKey: string
} | null> {
  try {
    const { homedir } = await import("node:os")
    const keyPath = join(homedir(), ".aegis", "registry", "author-key.json")
    const raw = await readFile(keyPath, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Discover files in an agent directory (prompt templates, tool configs, etc.)
 */
export async function discoverAgentFiles(
  dir: string,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.isFile() &&
        entry.name !== "agent.yaml" &&
        !entry.name.startsWith(".")
      ) {
        const content = await readFile(join(dir, entry.name), "utf-8")
        files[entry.name] = content
      }
    }
  } catch {
    // directory may not exist or be empty
  }
  return files
}

export interface PublishResult {
  success: boolean
  name: string
  version: string
  signed: boolean
  errors?: string[]
}

function bumpVersion(version: string): string {
  const parts = version.split(".")
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return "1.0.0"
  const patch = parseInt(parts[2], 10) + 1
  return parts[0] + "." + parts[1] + "." + patch
}

/**
 * Full publish workflow:
 * 1. Load and validate agent.yaml
 * 2. Sign with author key (if available)
 * 3. Store in marketplace registry
 */
export async function publishAgent(
  dir: string,
  registry: MarketplaceRegistry,
): Promise<PublishResult> {
  try {
    const { config } = await loadAgentYaml(dir)

    const authorKey = await loadAuthorKey()
    let signature: AgentSignature | undefined
    let authorName = "anonymous"

    if (authorKey) {
      try {
        signature = await signAgentConfig(config, authorKey.privateKey)
        const { keyFingerprint } = await import("../plugin/crypto")
        authorName = keyFingerprint(authorKey.publicKey)
      } catch {
        // Signing failed, publish without signature
      }
    }

    const existing = registry.get(config.name)
    const version = existing ? bumpVersion(existing.version) : "1.0.0"

    registry.publish(config, version, authorName, signature)

    return {
      success: true,
      name: config.name,
      version,
      signed: !!signature,
    }
  } catch (err) {
    return {
      success: false,
      name: "",
      version: "",
      signed: false,
      errors: [String(err)],
    }
  }
}
