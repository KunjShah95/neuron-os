import type { PluginManifest } from "./manifest"

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  ) as unknown as Promise<CryptoKeyPair>
}

export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key)
}

export async function importPublicKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, true, ["verify"])
}

export async function importPrivateKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, true, ["sign"])
}

function serializeManifest(m: PluginManifest): Uint8Array {
  const canonical = JSON.stringify(m, Object.keys(m).sort())
  return new TextEncoder().encode(canonical)
}

export async function signPlugin(
  manifest: PluginManifest,
  privateKey: CryptoKey,
): Promise<string> {
  const data = serializeManifest(manifest)
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, data as unknown as Parameters<typeof crypto.subtle.sign>[2])
  return Buffer.from(signature).toString("hex")
}

export async function verifyPluginSignature(
  manifest: PluginManifest,
  signatureHex: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  const data = serializeManifest(manifest)
  const signature = Buffer.from(signatureHex, "hex")
  return crypto.subtle.verify({ name: "Ed25519" }, publicKey, signature as unknown as Parameters<typeof crypto.subtle.verify>[2], data as unknown as Parameters<typeof crypto.subtle.verify>[3]) as Promise<boolean>
}

export async function computeChecksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as unknown as Parameters<typeof crypto.subtle.digest>[1])
  return Buffer.from(hash).toString("hex")
}
