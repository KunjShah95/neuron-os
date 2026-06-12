#!/usr/bin/env node
import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { spawnSync, spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

// Running inside Bun already — launch index.ts directly
const isBun = process.argv0 === "bun" || !!process.versions?.bun
if (isBun) {
  const entry = resolve(ROOT, "index.ts")
  const bin = process.argv0 || "bun"
  const child = spawn(bin, [entry, ...process.argv.slice(2)], { stdio: "inherit", env: process.env })
  child.on("exit", (c) => process.exit(c ?? 0))
} else {
  // Running under Node.js — delegate to Bun if available
  const bunBin = findBun()
  if (bunBin) {
    const entry = resolve(ROOT, "index.ts")
    if (!existsSync(entry)) {
      console.error("\n  Error: index.ts not found at " + entry)
      console.error("  The package may be corrupted. Re-install: npm install -g neuron-aegis\n")
      process.exit(1)
    }
    const child = spawn(bunBin, [entry, ...process.argv.slice(2)], { stdio: "inherit", env: process.env })
    child.on("exit", (c) => process.exit(c ?? 0))
  } else {
    console.error(`
  Aegis requires the Bun runtime.

  Install Bun (fast, one command):
    curl -fsSL https://bun.sh/install | bash    # macOS / Linux
    powershell -c "irm bun.sh/install.ps1|iex"  # Windows

  Then re-run: aegis ${process.argv.slice(2).join(" ")}
`)
    process.exit(1)
  }
}

function findBun() {
  // Check if bun is in PATH
  const result = spawnSync("bun", ["--version"], { encoding: "utf8", stdio: "pipe" })
  if (result.status === 0) return "bun"
  // Windows: check common install paths
  const winPaths = [
    resolve(process.env.USERPROFILE ?? "", ".bun", "bin", "bun.exe"),
    resolve(process.env.LOCALAPPDATA ?? "", "bun", "bun.exe"),
  ]
  for (const p of winPaths) {
    if (existsSync(p)) return p
  }
  // Unix: check ~/.bun/bin/bun
  const unixPath = resolve(process.env.HOME ?? "", ".bun", "bin", "bun")
  if (existsSync(unixPath)) return unixPath
  return null
}
