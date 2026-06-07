import { describe, expect } from "bun:test"
import { runTest, runSuite } from "./runner"
import { generateJsonReport, generateMarkdownReport } from "./reporter"

describe("Index Tests", () => {
  expect(typeof runTest === "function").toBe(true)
  expect(typeof runSuite === "function").toBe(true)
  expect(typeof generateJsonReport === "function").toBe(true)
  expect(typeof generateMarkdownReport === "function").toBe(true)
})
