import { describe, it, expect } from "bun:test"
import { generateKeyPair, signPlugin, verifyPluginSignature, serializeManifest } from "./signer"
import { canonicalManifestJson, generateAuthorKey, signManifest, verifyManifest } from "./crypto"
import type { PluginManifest } from "./manifest"
import type { SignedPluginManifest } from "./types"

const baseManifest: PluginManifest = {
  name: "test-plugin",
  version: "1.0.0",
  entrypoint: "./dist/index.js",
  description: "A test plugin",
  author: "publisher",
  license: "MIT",
  hooks: {
    on_agent_spawn: true,
    on_tool_call: false,
    on_message: false,
    on_ipc_message: false,
    on_shutdown: false,
  },
  dependencies: [{ name: "other-plugin", version: "^1.0.0" }],
  permissions: ["fs:read", "net:fetch"],
}

describe("plugin manifest canonicalization", () => {
  it("covers nested hooks in the canonical bytes", () => {
    const canonical = canonicalManifestJson(baseManifest)
    expect(canonical).toContain("on_agent_spawn")
    expect(canonical).toContain("on_tool_call")
    expect(canonical).toContain("on_message")
  })

  it("covers the entrypoint and the permissions in the canonical bytes", () => {
    const canonical = canonicalManifestJson(baseManifest)
    expect(canonical).toContain("entrypoint")
    expect(canonical).toContain("./dist/index.js")
    expect(canonical).toContain("permissions")
    expect(canonical).toContain("fs:read")
  })

  it("changes the canonical bytes when a nested hook value changes", () => {
    const tampered: PluginManifest = {
      ...baseManifest,
      hooks: { ...baseManifest.hooks, on_tool_call: true },
    }
    expect(canonicalManifestJson(tampered)).not.toBe(canonicalManifestJson(baseManifest))
  })

  it("changes the canonical bytes when the entrypoint changes", () => {
    const tampered: PluginManifest = { ...baseManifest, entrypoint: "./dist/evil.js" }
    expect(canonicalManifestJson(tampered)).not.toBe(canonicalManifestJson(baseManifest))
  })

  it("changes the canonical bytes when the permissions change", () => {
    const tampered: PluginManifest = { ...baseManifest, permissions: ["fs:read", "net:fetch", "shell:exec"] }
    expect(canonicalManifestJson(tampered)).not.toBe(canonicalManifestJson(baseManifest))
  })

  it("is deterministic regardless of key insertion order", () => {
    const reordered: PluginManifest = {
      permissions: baseManifest.permissions,
      dependencies: baseManifest.dependencies,
      hooks: {
        on_shutdown: false,
        on_ipc_message: false,
        on_message: false,
        on_tool_call: false,
        on_agent_spawn: true,
      },
      entrypoint: baseManifest.entrypoint,
      version: baseManifest.version,
      name: baseManifest.name,
      license: baseManifest.license,
      author: baseManifest.author,
      description: baseManifest.description,
    }
    expect(canonicalManifestJson(reordered)).toBe(canonicalManifestJson(baseManifest))
  })

  it("uses the same canonical bytes in signer and crypto", () => {
    expect(Buffer.from(serializeManifest(baseManifest)).toString("utf-8")).toBe(canonicalManifestJson(baseManifest))
  })
})

describe("plugin signature coverage", () => {
  it("keeps a valid signature valid for the unmodified manifest", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(baseManifest, privateKey)
    expect(await verifyPluginSignature(baseManifest, signature, publicKey)).toBe(true)
  })

  it("invalidates the signature when a nested hook value changes", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(baseManifest, privateKey)
    const tampered: PluginManifest = {
      ...baseManifest,
      hooks: { ...baseManifest.hooks, on_agent_spawn: false },
    }
    expect(await verifyPluginSignature(tampered, signature, publicKey)).toBe(false)
  })

  it("invalidates the signature when the entrypoint changes", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(baseManifest, privateKey)
    const tampered: PluginManifest = { ...baseManifest, entrypoint: "./dist/evil.js" }
    expect(await verifyPluginSignature(tampered, signature, publicKey)).toBe(false)
  })

  it("invalidates the signature when the permissions change", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(baseManifest, privateKey)
    const tampered: PluginManifest = { ...baseManifest, permissions: ["fs:read", "net:fetch", "shell:exec"] }
    expect(await verifyPluginSignature(tampered, signature, publicKey)).toBe(false)
  })

  it("invalidates the signature when a dependency changes", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(baseManifest, privateKey)
    const tampered: PluginManifest = {
      ...baseManifest,
      dependencies: [{ name: "other-plugin", version: "^2.0.0" }],
    }
    expect(await verifyPluginSignature(tampered, signature, publicKey)).toBe(false)
  })
})

describe("plugin crypto manifest coverage", () => {
  const signedManifest = {
    name: "signed-plugin",
    description: "A signed plugin",
    version: "1.0.0",
    publishedAt: "2026-01-01T00:00:00.000Z",
    entrypoint: "./dist/index.js",
    permissions: ["fs:read"],
    hooks: { on_agent_spawn: true, on_tool_call: false },
  } as SignedPluginManifest & { entrypoint: string; permissions: string[]; hooks: Record<string, boolean> }

  it("covers the entrypoint and permissions in the signed manifest scheme", () => {
    const keyPair = generateAuthorKey("publisher")
    signManifest(signedManifest, keyPair.privateKey)

    expect(verifyManifest(signedManifest)).toBe(true)
    expect(verifyManifest({ ...signedManifest, entrypoint: "./dist/evil.js" })).toBe(false)
    expect(verifyManifest({ ...signedManifest, permissions: ["fs:read", "shell:exec"] })).toBe(false)
    expect(verifyManifest({ ...signedManifest, hooks: { on_agent_spawn: false, on_tool_call: false } })).toBe(false)
  })
})
