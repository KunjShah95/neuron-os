import { describe, expect } from "bun:test"
import { FilesystemSandbox } from "./filesystem"
import { resolve } from "node:path"

describe("Filesystem Tests", () => {

const testDir = resolve(process.cwd(), "src/sandbox")
const s = new FilesystemSandbox({ allowedPaths: [testDir] })

expect(s.restrictPath(testDir + "/types.ts")).toBe(testDir + "/types.ts")
expect(s.restrictPath(process.cwd() + "/node_modules")).toBe(null)
expect(s.restrictPath("/etc/passwd")).toBe(null)

s.enabled = false
expect(s.restrictPath("/etc/passwd")).toBe("/etc/passwd")
s.enabled = true

const status = s.status()
expect(status.type === "filesystem").toBe(true)
expect(status.active === true).toBe(true)

})
