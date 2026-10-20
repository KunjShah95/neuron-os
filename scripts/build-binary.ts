#!/usr/bin/env bun
/**
 * Build a standalone Aegis binary.
 *
 * Usage: bun run scripts/build-binary.ts <bun-target> <outfile>
 *   e.g. bun run scripts/build-binary.ts bun-windows-x64 dist/aegis.exe
 *
 * Two things are injected that the plain `bun build` command cannot express:
 *
 *  - `__AEGIS_VERSION__`, so a compiled binary reports the real version
 *    instead of "0.0.0" (it has no package.json next to it at runtime).
 *  - `playwright` is kept external. Bundling it makes Bun resolve
 *    `playwright-core/package.json` at build time and bake the build
 *    machine's absolute path into the executable, which then fails to load
 *    on every other machine.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const [target, outfile] = process.argv.slice(2)

if (!target || !outfile) {
  console.error("Usage: bun run scripts/build-binary.ts <bun-target> <outfile>")
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8")) as { version?: string }
const version = pkg.version ?? "0.0.0"

const args = [
  "bun",
  "build",
  "index.ts",
  "--compile",
  `--target=${target}`,
  "--define",
  `__AEGIS_VERSION__="${version}"`,
  "--external",
  "chromium-bidi",
  "--external",
  "playwright",
  "--outfile",
  outfile,
]

console.log(`Building ${outfile} (bun target ${target}, version ${version})`)

const proc = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] })
const exitCode = await proc.exited
process.exit(exitCode)
