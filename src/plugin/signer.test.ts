import { describe, it, expect } from "bun:test"
import { generateKeyPair, signPlugin, verifyPluginSignature, computeChecksum } from "./signer"
import type { PluginManifest } from "./manifest"

describe("signer", () => {
  it("should generate Ed25519 key pair", async () => {
    const { publicKey, privateKey } = await generateKeyPair()
    expect(publicKey).toBeInstanceOf(CryptoKey)
    expect(privateKey).toBeInstanceOf(CryptoKey)
  })

  it("should sign and verify a manifest", async () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      version: "1.0.0",
      entrypoint: "./dist/index.js",
      hooks: {},
      dependencies: [],
      permissions: [],
    }

    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(manifest, privateKey)
    expect(typeof signature).toBe("string")
    expect(signature.length).toBeGreaterThan(0)

    const valid = await verifyPluginSignature(manifest, signature, publicKey)
    expect(valid).toBe(true)
  })

  it("should reject tampered manifest", async () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      version: "1.0.0",
      entrypoint: "./dist/index.js",
      hooks: {},
      dependencies: [],
      permissions: [],
    }

    const { publicKey, privateKey } = await generateKeyPair()
    const signature = await signPlugin(manifest, privateKey)
    const tampered: PluginManifest = { ...manifest, version: "2.0.0" }
    const valid = await verifyPluginSignature(tampered, signature, publicKey)
    expect(valid).toBe(false)
  })

  it("should compute SHA-256 checksum", async () => {
    const data = new TextEncoder().encode("hello world")
    const checksum = await computeChecksum(data)
    expect(checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(checksum).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
  })
})
