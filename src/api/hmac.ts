/**
 * Shared HMAC-SHA256 signature verification utility.
 *
 * Used by both the GitHub/GitLab webhook handler and the general-purpose
 * webhook adapter for payload integrity verification.
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if both strings are identical, false otherwise.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Verify an HMAC-SHA256 signature for a given payload and secret.
 *
 * @param payload  - The raw string payload that was signed
 * @param secret   - The shared secret key
 * @param signature - The expected signature (format: `sha256=<hex>`)
 * @returns true if the signature is valid, false on mismatch or error
 */
export async function verifyHmac(payload: string, secret: string, signature: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const msgData = encoder.encode(payload)

    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

    const hmacResult = await crypto.subtle.sign("HMAC", cryptoKey, msgData)

    // Convert to hex string
    const hexBytes = Array.from(new Uint8Array(hmacResult))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    const expected = `sha256=${hexBytes}`
    return timingSafeEqual(expected, signature)
  } catch {
    return false
  }
}
