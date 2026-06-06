import { describe, expect, test } from "bun:test"
import { extractCommandsFromFile } from "../extract-commands"
import { resolve } from "node:path"

const fixturesDir = resolve(import.meta.dir, "fixtures", "commands")

describe("extract-commands", () => {
  test("extracts a simple command with no options", () => {
    const result = extractCommandsFromFile(resolve(fixturesDir, "simple.ts"))
    expect(result).toEqual([
      {
        name: "simple",
        description: "A simple command with no options",
        options: [],
        sourceFile: resolve(fixturesDir, "simple.ts"),
      },
    ])
  })

  test("extracts alias, description, and options including defaults", () => {
    const result = extractCommandsFromFile(resolve(fixturesDir, "with-options.ts"))
    expect(result).toEqual([
      {
        name: "with-options",
        alias: "wo",
        description: "A command with options and a default value",
        options: [
          { flag: "-p, --port <port>", description: "Port number", required: false, defaultValue: "8080" },
          { flag: "--host <host>", description: "Host to bind to", required: false },
          { flag: "-f, --force", description: "Force the operation", required: false, defaultValue: false },
        ],
        sourceFile: resolve(fixturesDir, "with-options.ts"),
      },
    ])
  })

  test("extracts parent and subcommands with shared options and aliases", () => {
    const result = extractCommandsFromFile(resolve(fixturesDir, "with-subcommands.ts"))
    expect(result).toEqual([
      {
        name: "parent",
        alias: "p",
        description: "A parent command with subcommands",
        options: [],
        sourceFile: resolve(fixturesDir, "with-subcommands.ts"),
      },
      {
        name: "parent child-one",
        parent: "parent",
        description: "First child",
        options: [],
        sourceFile: resolve(fixturesDir, "with-subcommands.ts"),
      },
      {
        name: "parent child-two <arg>",
        parent: "parent",
        description: "Second child with argument",
        options: [
          { flag: "--flag <value>", description: "A flag", required: false },
        ],
        sourceFile: resolve(fixturesDir, "with-subcommands.ts"),
      },
      {
        name: "parent child-three",
        parent: "parent",
        alias: "c3",
        description: "Third child",
        options: [],
        sourceFile: resolve(fixturesDir, "with-subcommands.ts"),
      },
    ])
  })
})
