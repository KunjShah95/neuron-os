#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs"
import { get } from "node:https"
import { resolve, dirname } from "node:path"
import { homedir } from "node:os"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const CACHE = resolve(homedir(), ".aegis", "bin")

function findProjectRoot(start) {
  if (process.env.AEGIS_PROJECT) return process.env.AEGIS_PROJECT
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "index.ts")) && existsSync(resolve(dir, "package.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const isBun = process.argv0 === "bun" || !!process.versions?.bun
if (isBun) {
  const project = findProjectRoot(ROOT)
  if (project) {
    const entry = resolve(project, "index.ts")
    const child = spawn(entry, process.argv.slice(2), { stdio: "inherit", env: process.env })
    child.on("exit", (c) => process.exit(c ?? 0))
  } else {
    main().catch((err) => { console.error(err.message); process.exit(1) })
  }
} else {
  main().catch((err) => { console.error(err.message); process.exit(1) })
}

async function main() {
  const osMap = { win32: "windows", linux: "linux", darwin: "darwin" }
  const archMap = { x64: "x64", arm64: "arm64" }
  const os = osMap[process.platform]
  const arch = archMap[process.arch]
  const ext = os === "windows" ? ".exe" : ""
  if (!os) throw new Error(`Unsupported OS: ${process.platform}`)
  if (!arch) throw new Error(`Unsupported arch: ${process.arch}`)

  const binPath = resolve(CACHE, `aegis-${os}-${arch}${ext}`)
  if (!existsSync(binPath)) {
    const asset = `aegis-${os}-${arch}${ext}`
    const v = process.env.AEGIS_VERSION || "latest"
    const REPO = "KunjShah95/neuron-os"
    const url = v === "latest"
      ? `https://github.com/${REPO}/releases/latest/download/${asset}`
      : `https://github.com/${REPO}/releases/download/${v}/${asset}`

    console.error(`\n  Downloading aegis for ${os}/${arch}...`)
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
          if (res.statusCode !== 200) {
            file.close()
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          res.pipe(file)
          file.on("finish", () => { file.close(); chmodSync(binPath, 0o755); resolvePromise() })
        }).on("error", reject)
      })
      console.error(`  Cached to ${binPath}\n`)
    } catch (err) {
      console.error(`  Download failed: ${err.message}`)
      console.error(`    ${url}`)
      process.exit(1)
    }
  }

  const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit", env: process.env })
  child.on("exit", (c) => process.exit(c ?? 0))
}
