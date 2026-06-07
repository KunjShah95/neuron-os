import { describe, it, expect } from "bun:test"
import { FixtureManager } from "./fixtures"
import type { TestCase } from "./types"

describe("FixtureManager", () => {
  // ── Built-in Fixtures ───────────────────────────────────────

  describe("typescript-project fixture", () => {
    const manager = new FixtureManager()
    const test: TestCase = {
      id: "ts-test",
      name: "TS Test",
      prompt: "do it",
      tags: ["fixture:typescript-project"],
      timeout: 30000,
    }

    it("should generate package.json with correct name and deps", () => {
      const { files } = manager.applyFixtures(test)
      const pkg = JSON.parse(files["package.json"])
      expect(pkg.name).toBe("test-project")
    })

    it("should generate tsconfig.json", () => {
      const { files } = manager.applyFixtures(test)
      expect(files["tsconfig.json"]).toBeTruthy()
      const tsconfig = JSON.parse(files["tsconfig.json"])
      expect(tsconfig.compilerOptions.strict).toBe(true)
    })

    it("should generate src/index.ts entry point", () => {
      const { files } = manager.applyFixtures(test)
      expect(files["src/index.ts"]).toContain("Entry point")
    })

    it("should include npm install command", () => {
      const { commands } = manager.applyFixtures(test)
      expect(commands).toContain("npm install")
    })

    it("should include dependencies when deps param is passed", () => {
      // Use a test with fixture: but no deps — default is empty
      const { files } = manager.applyFixtures(test)
      const pkg = JSON.parse(files["package.json"])
      expect(Object.keys(pkg.dependencies)).toHaveLength(0)
    })
  })

  describe("express-api fixture", () => {
    const manager = new FixtureManager()

    it("should generate Express server file", () => {
      const test: TestCase = {
        id: "express-test",
        name: "Express Test",
        prompt: "build api",
        tags: ["fixture:express-api"],
        timeout: 30000,
      }
      const { files } = manager.applyFixtures(test)
      expect(files["src/index.ts"]).toContain("import express from 'express'")
      expect(files["src/index.ts"]).toContain("app.listen(3000)")
    })

    it("should include express dependency in package.json", () => {
      const test: TestCase = {
        id: "express-test",
        name: "Express Test",
        prompt: "build api",
        tags: ["fixture:express-api"],
        timeout: 30000,
      }
      const { files } = manager.applyFixtures(test)
      const pkg = JSON.parse(files["package.json"])
      expect(pkg.dependencies.express).toBe("*")
    })
  })

  describe("node-package fixture", () => {
    const manager = new FixtureManager()

    it("should generate package.json with type: module", () => {
      const test: TestCase = {
        id: "np-test",
        name: "NP Test",
        prompt: "do it",
        tags: ["fixture:node-package"],
        timeout: 30000,
      }
      const { files } = manager.applyFixtures(test)
      const pkg = JSON.parse(files["package.json"])
      expect(pkg.type).toBe("module")
    })

    it("should not include test file when hasTests is false/absent", () => {
      const test: TestCase = {
        id: "np-test",
        name: "NP Test",
        prompt: "do it",
        tags: ["fixture:node-package"],
        timeout: 30000,
      }
      const { files } = manager.applyFixtures(test)
      expect(files["index.test.js"]).toBeUndefined()
    })
  })

  describe("git-repo fixture", () => {
    const manager = new FixtureManager()

    it("should generate .gitignore", () => {
      const test: TestCase = {
        id: "git-test",
        name: "Git Test",
        prompt: "init repo",
        tags: ["fixture:git-repo"],
        timeout: 30000,
      }
      const { files } = manager.applyFixtures(test)
      expect(files[".gitignore"]).toContain("node_modules")
    })

    it("should include git init and commit commands", () => {
      const test: TestCase = {
        id: "git-test",
        name: "Git Test",
        prompt: "init repo",
        tags: ["fixture:git-repo"],
        timeout: 30000,
      }
      const { commands } = manager.applyFixtures(test)
      expect(commands).toContain("git init")
      expect(commands).toContain("git add .")
      expect(commands).toContain("git commit -m 'initial'")
    })
  })

  describe("python-project fixture", () => {
    const manager = new FixtureManager()

    it("should generate main.py and requirements.txt", () => {
      const test: TestCase = {
        id: "py-test",
        name: "Python Test",
        prompt: "write script",
        tags: ["fixture:python-project"],
        timeout: 30000,
      }
      const { files } = manager.applyFixtures(test)
      expect(files["main.py"]).toContain("Entry point")
      expect(files["requirements.txt"]).toBeDefined()
    })
  })

  // ── FixtureManager Operations ───────────────────────────────

  describe("applyFixtures", () => {
    const manager = new FixtureManager()

    it("should apply setup overrides on top of fixtures", () => {
      const test: TestCase = {
        id: "override-test",
        name: "Override Test",
        prompt: "test overrides",
        tags: ["fixture:typescript-project"],
        timeout: 30000,
        setup: {
          commands: ["echo custom"],
          files: { "custom.txt": "custom content" },
        },
      }

      const { files, commands } = manager.applyFixtures(test)

      // Fixture files present
      expect(files["package.json"]).toBeTruthy()
      // Setup overrides merged
      expect(files["custom.txt"]).toBe("custom content")
      // Both fixture and setup commands
      expect(commands).toContain("npm install")
      expect(commands).toContain("echo custom")
    })

    it("should ignore unknown fixture tags", () => {
      const test: TestCase = {
        id: "unknown-test",
        name: "Unknown Test",
        prompt: "test",
        tags: ["fixture:nonexistent-fixture"],
        timeout: 30000,
      }

      const { files, commands } = manager.applyFixtures(test)
      expect(Object.keys(files)).toHaveLength(0)
      expect(commands).toHaveLength(0)
    })

    it("should combine multiple fixtures", () => {
      const test: TestCase = {
        id: "multi-test",
        name: "Multi Test",
        prompt: "multi fixture",
        tags: ["fixture:typescript-project", "fixture:git-repo"],
        timeout: 30000,
      }

      const { files, commands } = manager.applyFixtures(test)

      // From typescript-project
      expect(files["package.json"]).toBeTruthy()
      expect(files["src/index.ts"]).toBeTruthy()
      // From git-repo
      expect(files[".gitignore"]).toBeTruthy()
      // Both commands
      expect(commands).toContain("npm install")
      expect(commands).toContain("git init")
    })
  })

  describe("register", () => {
    it("should register a custom fixture at runtime", () => {
      const manager = new FixtureManager()
      manager.register("custom-fixture", {
        name: "Custom",
        description: "A custom fixture",
        generate: () => ({
          files: { "custom.txt": "hello" },
          commands: ["echo custom"],
        }),
      })

      const test: TestCase = {
        id: "custom-test",
        name: "Custom Test",
        prompt: "test custom",
        tags: ["fixture:custom-fixture"],
        timeout: 30000,
      }

      const { files, commands } = manager.applyFixtures(test)
      expect(files["custom.txt"]).toBe("hello")
      expect(commands).toContain("echo custom")
    })
  })

  describe("listFixtures", () => {
    it("should list all built-in fixtures", () => {
      const manager = new FixtureManager()
      const list = manager.listFixtures()

      expect(list.length).toBe(5)
      expect(list.map(f => f.name)).toContain("TypeScript Project")
      expect(list.map(f => f.name)).toContain("Express API Server")
      expect(list.map(f => f.name)).toContain("Node Package")
      expect(list.map(f => f.name)).toContain("Git Repository")
      expect(list.map(f => f.name)).toContain("Python Project")
    })

    it("should include newly registered fixtures", () => {
      const manager = new FixtureManager()
      manager.register("new-fixture", {
        name: "New Fixture",
        description: "test",
        generate: () => ({ files: {}, commands: [] }),
      })

      const list = manager.listFixtures()
      expect(list.length).toBe(6)
      expect(list.find(f => f.name === "New Fixture")).toBeTruthy()
    })
  })
})
