import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

const KEY_SALT = "aegis-secure-transport-v1"
const KEY_LENGTH = 32
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

interface EncryptedPayload {
  ciphertext: string
  iv: string
  tag: string
}

interface Envelope {
  type: string
  ciphertext: string
  iv: string
  tag: string
}

export class SecureTransport {
  static deriveKey(secret: string): Buffer {
    return scryptSync(secret, KEY_SALT, KEY_LENGTH, SCRYPT_OPTIONS)
  }

  static encrypt(plaintext: string, key: Buffer, aad?: string): EncryptedPayload {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, "utf-8"))
    let encrypted = cipher.update(plaintext, "utf-8", "hex")
    encrypted += cipher.final("hex")
    const tag = cipher.getAuthTag().toString("hex")
    return { ciphertext: encrypted, iv: iv.toString("hex"), tag }
  }

  static decrypt(payload: EncryptedPayload, key: Buffer, aad?: string): string {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"))
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf-8"))
    decipher.setAuthTag(Buffer.from(payload.tag, "hex"))
    let decrypted = decipher.update(payload.ciphertext, "hex", "utf-8")
    decrypted += decipher.final("utf-8")
    return decrypted
  }

  static createMessage(type: string, payload: unknown, key: Buffer): string {
    const plaintext = JSON.stringify(payload)
    const { ciphertext, iv, tag } = this.encrypt(plaintext, key, type)
    const envelope: Envelope = { type, ciphertext, iv, tag }
    return JSON.stringify(envelope)
  }

  static parseMessage(raw: string, key: Buffer): { type: string; payload: unknown } {
    const envelope: Envelope = JSON.parse(raw)
    const sealed = { ciphertext: envelope.ciphertext, iv: envelope.iv, tag: envelope.tag }
    const plaintext = this.decrypt(sealed, key, envelope.type)
    return { type: envelope.type, payload: JSON.parse(plaintext) }
  }
}
