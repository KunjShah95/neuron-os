import type { PluginManifest } from "./manifest"

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "Ed25519" } as EcKeyGenParams,
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>
}

export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key)
}

export async function importPublicKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "Ed25519" } as EcKeyImportParams,
    true,
    ["verify"],
  )
}

export async function importPrivateKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "Ed25519" } as EcKeyImportParams,
    true,
    ["sign"],
  )
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
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" } as EcdsaParams,
    privateKey,
    data,
  )
  return Buffer.from(signature).toString("hex")
}

export async function verifyPluginSignature(
  manifest: PluginManifest,
  signatureHex: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  const data = serializeManifest(manifest)
  const signature = Buffer.from(signatureHex, "hex")
  return crypto.subtle.verify(
    { name: "Ed25519" } as EcdsaParams,
    publicKey,
    signature,
    data,
  ) as Promise<boolean>
}

export async function computeChecksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Buffer.from(hash).toString("hex")
}
