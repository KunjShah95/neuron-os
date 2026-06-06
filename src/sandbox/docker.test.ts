import { describe, expect } from "bun:test"
import { DockerSandbox } from "./docker"

describe("Docker Tests", () => {

const s = new DockerSandbox({ enabled: false })
const status = s.status()
expect(!status.active).toBe(true)
expect(status.type === "docker").toBe(true)

s.cleanup()

})
