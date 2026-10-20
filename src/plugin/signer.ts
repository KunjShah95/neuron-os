import type { PluginManifest } from "./manifest"
import { canonicalManifestJson, type TrustedPluginKey } from "./crypto"

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as unknown as Promise<CryptoKeyPair>
}

export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key)
}

export async function exportPrivateKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("pkcs8", key)
}

export async function importPublicKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, true, ["verify"])
}

export async function importPrivateKey(pkcs8: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"])
}

export function serializeManifest(m: PluginManifest): Uint8Array {
  return new TextEncoder().encode(canonicalManifestJson(m))
}

export async function importTrustedPublicKey(key: TrustedPluginKey): Promise<CryptoKey | null> {
  try {
    const raw = Buffer.from(key.publicKey, "base64url")
    if (raw.length !== 32) return null
    const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    return await crypto.subtle.importKey("raw", bytes, { name: "Ed25519" }, true, ["verify"])
  } catch {
    return null
  }
}

export async function signPlugin(manifest: PluginManifest, privateKey: CryptoKey): Promise<string> {
  const data = serializeManifest(manifest)
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    data as unknown as Parameters<typeof crypto.subtle.sign>[2],
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
    { name: "Ed25519" },
    publicKey,
    signature as unknown as Parameters<typeof crypto.subtle.verify>[2],
    data as unknown as Parameters<typeof crypto.subtle.verify>[3],
  ) as Promise<boolean>
}

export async function computeChecksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as unknown as Parameters<typeof crypto.subtle.digest>[1])
  return Buffer.from(hash).toString("hex")
}
