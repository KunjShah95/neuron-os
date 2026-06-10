/**
 * Unit tests for the TLS module.
 * Tests certificate generation, validation, and loading.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

const TEST_DIR = resolve(tmpdir(), "aegis-tls-test-" + Date.now())

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true })
  }
})

describe("TLS module", () => {
  describe("generateSelfSignedCert", () => {
    it("should generate cert and key files", async () => {
      const { generateSelfSignedCert } = await import("./tls")
      const { certPath, keyPath, info } = generateSelfSignedCert(TEST_DIR)

      expect(existsSync(certPath)).toBe(true)
      expect(existsSync(keyPath)).toBe(true)
      expect(info.validTo.getTime()).toBeGreaterThan(Date.now())
      expect(info.fingerprint).toBeTruthy()
    })

    it("should generate valid PEM files", async () => {
      const { generateSelfSignedCert } = await import("./tls")
      const outDir = resolve(TEST_DIR, "pem-test")
      const { certPath, keyPath } = generateSelfSignedCert(outDir)

      const cert = readFileSync(certPath, "utf-8")
      const key = readFileSync(keyPath, "utf-8")

      expect(cert).toContain("BEGIN CERTIFICATE")
      expect(cert).toContain("END CERTIFICATE")
      expect(key).toContain("PRIVATE KEY")
    })
  })

  describe("loadCertAndKey", () => {
    it("should load a valid cert/key pair", async () => {
      const { generateSelfSignedCert, loadCertAndKey } = await import("./tls")
      const outDir = resolve(TEST_DIR, "load-test")
      const { certPath, keyPath } = generateSelfSignedCert(outDir)

      const result = loadCertAndKey(certPath, keyPath)
      expect(result.cert).toBeTruthy()
      expect(result.key).toBeTruthy()
      expect(result.info).toBeTruthy()
    })

    it("should throw for missing cert file", async () => {
      const { loadCertAndKey } = await import("./tls")
      expect(() => loadCertAndKey("/nonexistent/cert.pem", "/nonexistent/key.pem")).toThrow("Certificate file not found")
    })

    it("should throw for invalid cert PEM", async () => {
      const { loadCertAndKey } = await import("./tls")
      const invalidCert = resolve(TEST_DIR, "invalid-cert.pem")
      const invalidKey = resolve(TEST_DIR, "invalid-key.pem")
      writeFileSync(invalidCert, "not a cert", "utf-8")
      writeFileSync(invalidKey, "not a key", "utf-8")

      expect(() => loadCertAndKey(invalidCert, invalidKey)).toThrow("Invalid certificate")
    })

    it("should throw for invalid key PEM", async () => {
      const { generateSelfSignedCert, loadCertAndKey } = await import("./tls")
      const outDir = resolve(TEST_DIR, "key-test")
      const { certPath } = generateSelfSignedCert(outDir)
      const invalidKey = resolve(TEST_DIR, "bad-key.pem")
      writeFileSync(invalidKey, "not a private key", "utf-8")

      expect(() => loadCertAndKey(certPath, invalidKey)).toThrow("Invalid key")
    })
  })

  describe("validateCertPair", () => {
    it("should return valid for matching pair", async () => {
      const { generateSelfSignedCert, validateCertPair } = await import("./tls")
      const outDir = resolve(TEST_DIR, "validate-test")
      const { certPath, keyPath, info } = generateSelfSignedCert(outDir)

      const cert = readFileSync(certPath, "utf-8")
      const key = readFileSync(keyPath, "utf-8")
      const result = validateCertPair(cert, key, info)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("should reject expired certificate", async () => {
      const { validateCertPair } = await import("./tls")
      const expiredInfo = {
        subject: { DN: "CN=test" },
        issuer: { DN: "CN=test" },
        validFrom: new Date("2020-01-01"),
        validTo: new Date("2021-01-01"),
        serialNumber: "01",
        fingerprint: "abc123",
      }

      const result = validateCertPair("cert-pem", "key-pem", expiredInfo)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("expired")
    })

    it("should reject not-yet-valid certificate", async () => {
      const { validateCertPair } = await import("./tls")
      const futureInfo = {
        subject: { DN: "CN=test" },
        issuer: { DN: "CN=test" },
        validFrom: new Date("2099-01-01"),
        validTo: new Date("2100-01-01"),
        serialNumber: "01",
        fingerprint: "abc123",
      }

      const result = validateCertPair("cert-pem", "key-pem", futureInfo)
      expect(result.valid).toBe(false)
      expect(result.error).toContain("not yet valid")
    })
  })

  describe("isTlsConfigured", () => {
    it("should return false when env vars not set", async () => {
      const originalCert = process.env.AEGIS_TLS_CERT
      const originalKey = process.env.AEGIS_TLS_KEY

      delete process.env.AEGIS_TLS_CERT
      delete process.env.AEGIS_TLS_KEY

      const { isTlsConfigured } = await import("./tls")
      expect(isTlsConfigured()).toBe(false)

      // Restore
      if (originalCert) process.env.AEGIS_TLS_CERT = originalCert
      if (originalKey) process.env.AEGIS_TLS_KEY = originalKey
    })

    it("should return true when both env vars are set", async () => {
      const originalCert = process.env.AEGIS_TLS_CERT
      const originalKey = process.env.AEGIS_TLS_KEY

      process.env.AEGIS_TLS_CERT = "/path/to/cert.pem"
      process.env.AEGIS_TLS_KEY = "/path/to/key.pem"

      const { isTlsConfigured } = await import("./tls")
      expect(isTlsConfigured()).toBe(true)

      // Restore
      if (originalCert) process.env.AEGIS_TLS_CERT = originalCert
      else delete process.env.AEGIS_TLS_CERT
      if (originalKey) process.env.AEGIS_TLS_KEY = originalKey
      else delete process.env.AEGIS_TLS_KEY
    })
  })
})
