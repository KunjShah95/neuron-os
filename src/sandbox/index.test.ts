import { describe, expect } from "bun:test"
import { FilesystemSandbox, ProcessSandbox, DockerSandbox } from "./index"

describe("Index Tests", () => {

const fsBox = new FilesystemSandbox({ enabled: true })
expect(fsBox.name === "filesystem").toBe(true)

const procBox = new ProcessSandbox({ enabled: true })
expect(procBox.name === "process").toBe(true)

const dockerBox = new DockerSandbox({ enabled: false })
expect(dockerBox.name === "docker").toBe(true)

const check = procBox.restrictCommand("echo ok")
expect(check.allowed).toBe(true)

})
