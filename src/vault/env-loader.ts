import type { CredentialVault } from "./credential-vault"

export class VaultEnvLoader {
  constructor(private vault: CredentialVault) {}

  loadAsEnv(entryNames: string[], prefix = "AEGIS_VAULT_"): void {
    for (const name of entryNames) {
      const result = this.vault.retrieveByName(name)
      if (result) {
        const envKey = prefix + name.toUpperCase().replace(/[^a-zA-Z0-9_]/g, "_")
        process.env[envKey] = result.value
      }
    }
  }

  loadEnvFile(vaultEntryName: string): void {
    const result = this.vault.retrieveByName(vaultEntryName)
    if (!result) return

    for (const line of result.value.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim()
        const v = trimmed.slice(eqIdx + 1).trim()
        if (k) process.env[k] = v
      }
    }
  }
}
