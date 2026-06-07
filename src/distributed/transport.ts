import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

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
    return createHash("sha256").update(secret, "utf-8").digest()
  }

  static encrypt(plaintext: string, key: Buffer): EncryptedPayload {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    let encrypted = cipher.update(plaintext, "utf-8", "hex")
    encrypted += cipher.final("hex")
    const tag = cipher.getAuthTag().toString("hex")
    return { ciphertext: encrypted, iv: iv.toString("hex"), tag }
  }

  static decrypt(payload: EncryptedPayload, key: Buffer): string {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"))
    decipher.setAuthTag(Buffer.from(payload.tag, "hex"))
    let decrypted = decipher.update(payload.ciphertext, "hex", "utf-8")
    decrypted += decipher.final("utf-8")
    return decrypted
  }

  static createMessage(type: string, payload: unknown, key: Buffer): string {
    const plaintext = JSON.stringify(payload)
    const { ciphertext, iv, tag } = this.encrypt(plaintext, key)
    const envelope: Envelope = { type, ciphertext, iv, tag }
    return JSON.stringify(envelope)
  }

  static parseMessage(raw: string, key: Buffer): { type: string; payload: unknown } {
    const envelope: Envelope = JSON.parse(raw)
    const plaintext = this.decrypt(
      { ciphertext: envelope.ciphertext, iv: envelope.iv, tag: envelope.tag },
      key,
    )
    return { type: envelope.type, payload: JSON.parse(plaintext) }
  }
}
