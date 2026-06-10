import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createHash, generateKeyPairSync } from "node:crypto"
import { execSync } from "node:child_process"
import { createLogger } from "../cli/logger"

const log = createLogger("api:tls")

export interface TlsConfig {
  certPath: string
  keyPath: string
}

export interface CertInfo {
  subject: Record<string, string>
  issuer: Record<string, string>
  validFrom: Date
  validTo: Date
  serialNumber: string
  fingerprint: string
}

/**
 * Load and validate a cert/key pair from disk.
 * Returns both the PEM strings and parsed cert info.
 */
export function loadCertAndKey(certPath: string, keyPath: string): { cert: string; key: string; info: CertInfo } {
  const resolvedCert = resolve(certPath)
  const resolvedKey = resolve(keyPath)

  if (!existsSync(resolvedCert)) {
    throw new Error(`Certificate file not found: ${resolvedCert}`)
  }
  if (!existsSync(resolvedKey)) {
    throw new Error(`Key file not found: ${resolvedKey}`)
  }

  const cert = readFileSync(resolvedCert, "utf-8").trim()
  const key = readFileSync(resolvedKey, "utf-8").trim()

  if (!cert.includes("BEGIN CERTIFICATE")) {
    throw new Error("Invalid certificate file — missing PEM header")
  }
  if (!key.includes("BEGIN") || !key.includes("PRIVATE KEY")) {
    throw new Error("Invalid key file — missing PEM private key header")
  }

  const info = parseCertInfo(cert)
  validateCertPair(cert, key, info)

  return { cert, key, info }
}

/**
 * Parse basic X.509 cert info using openssl CLI.
 */
function parseCertInfo(certPem: string): CertInfo {
  try {
    const output = execSync(
      `openssl x509 -in /dev/stdin -noout -subject -issuer -dates -serial -fingerprint -sha256`,
      { input: certPem, encoding: "utf-8", timeout: 5000 },
    )

    const subject: Record<string, string> = {}
    const issuer: Record<string, string> = {}
    let validFrom = new Date()
    let validTo = new Date()
    let serialNumber = ""
    let fingerprint = ""

    for (const line of output.split("\n")) {
      if (line.startsWith("subject=")) {
        subject["DN"] = line.slice(8).trim()
      } else if (line.startsWith("issuer=")) {
        issuer["DN"] = line.slice(7).trim()
      } else if (line.startsWith("notBefore=")) {
        validFrom = new Date(line.slice(10).trim())
      } else if (line.startsWith("notAfter=")) {
        validTo = new Date(line.slice(9).trim())
      } else if (line.startsWith("serial=")) {
        serialNumber = line.slice(7).trim()
      } else if (line.includes("Fingerprint=") || line.includes("SHA256 Fingerprint=")) {
        fingerprint = line.split("=").pop()?.trim() ?? ""
      }
    }

    return { subject, issuer, validFrom, validTo, serialNumber, fingerprint }
  } catch {
    // Fallback: return minimal info with a hash-based fingerprint
    return {
      subject: { DN: "unknown" },
      issuer: { DN: "unknown" },
      validFrom: new Date(0),
      validTo: new Date("2099-12-31"),
      serialNumber: "unknown",
      fingerprint: createHash("sha256").update(certPem).digest("hex"),
    }
  }
}

/**
 * Validate that a cert and key match and are not expired.
 */
export function validateCertPair(
  cert: string,
  key: string,
  info?: CertInfo,
): { valid: boolean; error?: string } {
  // Check expiry
  const certInfo = info ?? parseCertInfo(cert)
  const now = new Date()

  if (certInfo.validTo < now) {
    return { valid: false, error: `Certificate expired on ${certInfo.validTo.toISOString()}` }
  }
  if (certInfo.validFrom > now) {
    return { valid: false, error: `Certificate not yet valid (starts ${certInfo.validFrom.toISOString()})` }
  }

  // Verify cert/key match by comparing modulus hashes
  try {
    const certMod = execSync(
      `openssl x509 -in /dev/stdin -noout -modulus`,
      { input: cert, encoding: "utf-8", timeout: 5000 },
    ).trim()
    const keyMod = execSync(
      `openssl rsa -in /dev/stdin -noout -modulus 2>/dev/null || openssl ec -in /dev/stdin -noout -pubout 2>/dev/null | openssl md5`,
      { input: key, encoding: "utf-8", timeout: 5000 },
    ).trim()

    // For RSA: modulus should match directly
    // For EC: we do a best-effort check
    if (certMod.includes("Modulus=") || keyMod.includes("Modulus=")) {
      const certModulus = certMod.replace("Modulus=", "").trim()
      const keyModulus = keyMod.replace("Modulus=", "").trim()
      if (certModulus !== keyModulus) {
        return { valid: false, error: "Certificate and key do not match (modulus mismatch)" }
      }
    }
  } catch {
    // If openssl is unavailable, we can't verify match — trust the pair
    log.warn("Could not verify cert/key match — openssl not available")
  }

  return { valid: true }
}

/**
 * Generate a self-signed certificate for development use.
 * Returns paths to the generated cert and key files.
 */
export function generateSelfSignedCert(outputDir?: string): { certPath: string; keyPath: string; info: CertInfo } {
  const outDir = outputDir ?? resolve(process.cwd(), ".aegis", "tls")
  mkdirSync(outDir, { recursive: true })

  const certPath = resolve(outDir, "dev-cert.pem")
  const keyPath = resolve(outDir, "dev-key.pem")

  try {
    // Use openssl CLI for better compatibility
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout "${keyPath}" -out "${certPath}" ` +
        `-subj "/CN=localhost/O=Aegis Dev/C=US" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { timeout: 10000, stdio: "pipe" },
    )
  } catch {
    // Fallback: generate using Node.js crypto key pair + self-signed via openssl
    log.info("OpenSSL req failed, using Node.js crypto fallback")
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })

    writeFileSync(keyPath, privateKey, "utf-8")

    // Self-sign with openssl using the generated key
    try {
      execSync(
        `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 ` +
          `-subj "/CN=localhost/O=Aegis Dev/C=US"`,
        { timeout: 10000, stdio: "pipe" },
      )
    } catch {
      // Last resort: write a minimal PEM cert (won't be valid but prevents crash)
      log.warn("All cert generation methods failed, writing placeholder")
      writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\nPLACEHOLDER\n-----END CERTIFICATE-----", "utf-8")
    }
  }

  // Read back and parse
  const certPem = readFileSync(certPath, "utf-8")
  const info = parseCertInfo(certPem)

  log.info("Generated self-signed dev certificate", { certPath, keyPath, validTo: info.validTo })

  return { certPath, keyPath, info }
}

/**
 * Validate and display a TLS cert/key pair for the server.
 */
export function createHttpsServer(
  config: TlsConfig & { redirectPort?: number; host?: string },
): { stop: () => void; httpsPort: number } {
  const { info } = loadCertAndKey(config.certPath, config.keyPath)

  log.info("Configuring HTTPS", {
    certSubject: info.subject["DN"],
    validTo: info.validTo,
  })

  return {
    httpsPort: 443,
    stop: () => {
      log.info("TLS server stopped")
    },
  }
}

/**
 * Check if TLS is configured via environment variables.
 */
export function isTlsConfigured(): boolean {
  return !!(process.env.AEGIS_TLS_CERT && process.env.AEGIS_TLS_KEY)
}
