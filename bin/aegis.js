#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs"
import { get } from "node:https"
import { resolve, homedir, dirname } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const REPO = "KunjShah95/neuron-os"
const CACHE = resolve(homedir(), ".aegis", "bin")

// ── bunx fast path ───────────────────────────────────────────────
const isBun = process.argv0 === "bun" || !!process.versions?.bun
if (isBun) {
  const child = spawn(resolve(ROOT, "index.ts"), process.argv.slice(2), { stdio: "inherit", env: process.env })
  child.on("exit", (c) => process.exit(c ?? 0))
} else {
  // ── npx path ──────────────────────────────────────────────────
  main().catch((err) => { console.error(err.message); process.exit(1) })
}

// ─────────────────────────────────────────────────────────────────
async function main() {
  const osMap = { win32: "windows", linux: "linux", darwin: "darwin" }
  const archMap = { x64: "x64", arm64: "arm64" }
  const os = osMap[process.platform]; const arch = archMap[process.arch]; const ext = os === "windows" ? ".exe" : ""

  if (!os) throw new Error(`Unsupported OS: ${process.platform}`)
  if (!arch) throw new Error(`Unsupported arch: ${process.arch}`)

  const binPath = resolve(CACHE, `aegis-${os}-${arch}${ext}`)

  if (!existsSync(binPath)) {
    const asset = `aegis-${os}-${arch}${ext}`
    const v = process.env.AEGIS_VERSION || "latest"
    const url = v === "latest"
      ? `https://github.com/${REPO}/releases/latest/download/${asset}`
      : `https://github.com/${REPO}/releases/download/${v}/${asset}`

    console.error(`\n  \u2B07 Downloading aegis for ${os}/${arch}...`)
    try {
      await new Promise((resolvePromise, reject) => {
        mkdirSync(CACHE, { recursive: true })
        const file = createWriteStream(binPath)
        get(url, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            file.close()
            reject(new Error(`Redirect (use the final URL): ${res.headers.location}`))
            return
          }
          if (res.statusCode !== 200) { file.close(); reject(new Error(`HTTP ${res.statusCode}`)); return }
          res.pipe(file)
          file.on("finish", () => { file.close(); chmodSync(binPath, 0o755); resolvePromise() })
        }).on("error", reject)
      })
      console.error(`  \u2713 Cached to ${binPath}\n`)
    } catch (err) {
      console.error(`  \u2717 Download failed: ${err.message}`)
      console.error(`    ${url}`)
      console.error(`    Tip: Install Bun and use \`bunx aegis\` instead\n`)
      process.exit(1)
    }
  }

  const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit", env: process.env })
  child.on("exit", (c) => process.exit(c ?? 0))
}
