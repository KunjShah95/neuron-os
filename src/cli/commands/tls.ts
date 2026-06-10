import type { Command } from "commander"
import { theme } from "../theme"
import { resolve } from "node:path"
import { existsSync } from "node:fs"

export function registerTls(program: Command) {
  const tls = program
    .command("tls")
    .description("TLS certificate management — generate, validate, and configure HTTPS")

  tls
    .command("gen")
    .description("Generate a self-signed dev certificate for local HTTPS")
    .option("--out <dir>", "Output directory", resolve(process.cwd(), ".aegis", "tls"))
    .action(async (opts: { out: string }) => {
      console.log()
      console.log(`  ${theme.bold("🔐 Generating self-signed dev certificate...")}`)
      console.log()

      try {
        const { generateSelfSignedCert } = await import("../../api/tls")
        const { certPath, keyPath, info } = generateSelfSignedCert(opts.out)

        console.log(`  ${theme.success("✓")} Certificate generated successfully`)
        console.log()
        console.log(`  ${theme.info("Certificate:")}  ${certPath}`)
        console.log(`  ${theme.info("Key:")}          ${keyPath}`)
        console.log(`  ${theme.info("Subject:")}      ${info.subject["DN"]}`)
        console.log(`  ${theme.info("Valid until:")}   ${info.validTo.toISOString()}`)
        console.log(`  ${theme.info("Fingerprint:")}   ${info.fingerprint}`)
        console.log()
        console.log(`  ${theme.muted("Set these environment variables to enable TLS:")}`)
        console.log(`  ${theme.bold(`AEGIS_TLS_CERT="${certPath}"`)}`)
        console.log(`  ${theme.bold(`AEGIS_TLS_KEY="${keyPath}"`)}`)
        console.log()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${theme.error("✕")} Failed to generate certificate: ${msg}`)
        console.log()
        process.exit(1)
      }
    })

  tls
    .command("check")
    .description("Validate an existing cert/key pair")
    .option("--cert <path>", "Path to certificate PEM file")
    .option("--key <path>", "Path to private key PEM file")
    .action(async (opts: { cert?: string; key?: string }) => {
      const certPath = opts.cert ?? process.env.AEGIS_TLS_CERT
      const keyPath = opts.key ?? process.env.AEGIS_TLS_KEY

      console.log()
      if (!certPath || !keyPath) {
        console.log(`  ${theme.error("✕")} Missing certificate or key path`)
        console.log()
        console.log(`  ${theme.muted("Usage:")}`)
        console.log(`  ${theme.bold("aegis tls check --cert cert.pem --key key.pem")}`)
        console.log(`  ${theme.muted("Or set AEGIS_TLS_CERT and AEGIS_TLS_KEY env vars")}`)
        console.log()
        process.exit(1)
      }

      const resolvedCert = resolve(certPath)
      const resolvedKey = resolve(keyPath)

      if (!existsSync(resolvedCert)) {
        console.log(`  ${theme.error("✕")} Certificate file not found: ${resolvedCert}`)
        console.log()
        process.exit(1)
      }
      if (!existsSync(resolvedKey)) {
        console.log(`  ${theme.error("✕")} Key file not found: ${resolvedKey}`)
        console.log()
        process.exit(1)
      }

      console.log(`  ${theme.bold("🔐 Validating TLS certificate pair...")}`)
      console.log()

      try {
        const { loadCertAndKey } = await import("../../api/tls")
        const { info } = loadCertAndKey(resolvedCert, resolvedKey)

        console.log(`  ${theme.success("✓")} Certificate and key are valid and match`)
        console.log()
        console.log(`  ${theme.info("Subject:")}      ${info.subject["DN"]}`)
        console.log(`  ${theme.info("Issuer:")}        ${info.issuer["DN"]}`)
        console.log(`  ${theme.info("Valid from:")}    ${info.validFrom.toISOString()}`)
        console.log(`  ${theme.info("Valid until:")}   ${info.validTo.toISOString()}`)
        console.log(`  ${theme.info("Serial:")}        ${info.serialNumber}`)
        console.log(`  ${theme.info("Fingerprint:")}   ${info.fingerprint}`)
        console.log()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${theme.error("✕")} Validation failed: ${msg}`)
        console.log()
        process.exit(1)
      }
    })

  tls
    .command("env")
    .description("Show current TLS environment configuration")
    .action(() => {
      console.log()
      console.log(`  ${theme.bold("🔐 TLS Environment Configuration")}`)
      console.log(`  ${theme.muted("─".repeat(50))}`)

      const cert = process.env.AEGIS_TLS_CERT
      const key = process.env.AEGIS_TLS_KEY

      if (cert && key) {
        const resolvedCert = resolve(cert)
        const resolvedKey = resolve(key)
        const certExists = existsSync(resolvedCert)
        const keyExists = existsSync(resolvedKey)

        console.log(`  ${theme.info("AEGIS_TLS_CERT:")}  ${cert}`)
        console.log(`    Exists: ${certExists ? theme.success("✓ yes") : theme.error("✕ no")}`)
        console.log(`  ${theme.info("AEGIS_TLS_KEY:")}   ${key}`)
        console.log(`    Exists: ${keyExists ? theme.success("✓ yes") : theme.error("✕ no")}`)
        console.log()

        if (certExists && keyExists) {
          try {
            const { loadCertAndKey } = require("../../api/tls")
            const { info } = loadCertAndKey(resolvedCert, resolvedKey)
            console.log(`  ${theme.success("✓ TLS is configured and valid")}`)
            console.log(`  ${theme.info("Subject:")}   ${info.subject["DN"]}`)
            console.log(`  ${theme.info("Valid until:")} ${info.validTo.toISOString()}`)
          } catch {
            console.log(`  ${theme.warn("⚠ TLS files exist but are invalid")}`)
          }
        } else {
          console.log(`  ${theme.warn("⚠ TLS is configured but files are missing")}`)
        }
      } else {
        console.log(`  ${theme.muted("TLS is not configured")}`)
        console.log()
        console.log(`  ${theme.muted("To enable TLS, run:")}`)
        console.log(`  ${theme.bold("aegis tls gen")}`)
        console.log(`  ${theme.muted("Then set the environment variables shown above.")}`)
      }
      console.log()
    })
}
