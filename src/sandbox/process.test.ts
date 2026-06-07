import { describe, expect } from "bun:test"
import { ProcessSandbox } from "./process"

describe("Process Tests", () => {
  const s = new ProcessSandbox({ enabled: true })

  const res1 = s.restrictCommand("echo hello")
  expect(res1.allowed).toBe(true)
  expect(res1.modifiedCmd!.startsWith("cd ")).toBe(true)

  const res2 = s.restrictCommand("rm -rf /")
  expect(!res2.allowed).toBe(true)

  const res3 = s.restrictCommand("sudo rm -rf /etc")
  expect(!res3.allowed).toBe(true)

  const res4 = s.restrictCommand("mkfs.ext4 /dev/sda")
  expect(!res4.allowed).toBe(true)

  const s2 = new ProcessSandbox({ enabled: true, allowedCommands: ["npm test", "git status"] })
  const res5 = s2.restrictCommand("npm test")
  expect(res5.allowed).toBe(true)

  const res6 = s2.restrictCommand("rm file.txt")
  expect(!res6.allowed).toBe(true)

  s.cleanup()
})
