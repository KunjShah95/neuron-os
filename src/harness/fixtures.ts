import type { TestCase } from "./types"

// ── Fixture Types ────────────────────────────────────────────────

export interface FixtureOutput {
  files: Record<string, string>
  commands: string[]
  env?: Record<string, string>
  cleanupCommands?: string[]
}

export interface TestFixture {
  name: string
  description: string
  generate(params?: Record<string, unknown>): FixtureOutput
}

// ── Built-in Fixtures ────────────────────────────────────────────

const FIXTURES: Record<string, TestFixture> = {
  "typescript-project": {
    name: "TypeScript Project",
    description: "Bare TypeScript project with tsconfig, package.json",
    generate: (params?: Record<string, unknown>) => {
      const deps = (params?.deps as string[]) ?? []
      return {
        files: {
          "package.json": JSON.stringify(
            {
              name: (params?.name as string) ?? "test-project",
              dependencies: Object.fromEntries(deps.map((d) => [d, "*"])),
            },
            null,
            2,
          ),
          "tsconfig.json": JSON.stringify(
            { compilerOptions: { target: "ES2022", module: "ESNext", strict: true } },
            null,
            2,
          ),
          "src/index.ts": "// Entry point\n",
        },
        commands: ["npm install"],
      }
    },
  },

  "express-api": {
    name: "Express API Server",
    description: "Express server with basic route structure",
    generate: (params?: Record<string, unknown>) => {
      const routes = (params?.routes as string[]) ?? []
      return {
        files: {
          "src/index.ts": [
            "import express from 'express'",
            "const app = express()",
            "app.use(express.json())",
            ...routes.map((r) => `// TODO: implement ${r}`),
            "app.listen(3000)",
          ].join("\n"),
          "package.json": JSON.stringify({ name: "express-api", dependencies: { express: "*" } }, null, 2),
        },
        commands: ["npm install"],
      }
    },
  },

  "node-package": {
    name: "Node Package",
    description: "Empty Node.js package with optional tests",
    generate: (params?: Record<string, unknown>) => {
      const hasTests = params?.hasTests as boolean
      return {
        files: {
          "package.json": JSON.stringify({ name: "test-pkg", type: "module" }, null, 2),
          "index.js": "export const greet = (name) => `Hello, ${name}!`\n",
          ...(hasTests
            ? {
                "index.test.js": [
                  "import { describe, it, expect } from 'bun:test'",
                  "import { greet } from './index'",
                  "describe('greet', () => {",
                  "  it('should greet by name', () => {",
                  "    expect(greet('World')).toBe('Hello, World!')",
                  "  })",
                  "})",
                ].join("\n"),
              }
            : {}),
        },
        commands: [],
      }
    },
  },

  "git-repo": {
    name: "Git Repository",
    description: "Initialize a git repo with one commit",
    generate: () => ({
      files: { ".gitignore": "node_modules\n" },
      commands: ["git init", "git add .", "git commit -m 'initial'"],
    }),
  },

  "python-project": {
    name: "Python Project",
    description: "Minimal Python project with requirements.txt",
    generate: (params?: Record<string, unknown>) => {
      const deps = (params?.deps as string[]) ?? []
      return {
        files: {
          "requirements.txt": deps.join("\n") + "\n",
          "main.py": "# Entry point\n",
        },
        commands: deps.length > 0 ? ["pip install -r requirements.txt"] : [],
      }
    },
  },
}

// ── Fixture Manager ──────────────────────────────────────────────

export class FixtureManager {
  /**
   * Apply fixtures referenced in test tags (tags starting with "fixture:").
   * Then apply test-specific setup overrides on top.
   */
  applyFixtures(test: TestCase): { files: Record<string, string>; commands: string[] } {
    const files: Record<string, string> = {}
    const commands: string[] = []

    for (const tag of test.tags) {
      if (tag.startsWith("fixture:")) {
        const fixtureName = tag.slice(8)
        const fixture = FIXTURES[fixtureName]
        if (fixture) {
          const output = fixture.generate({})
          Object.assign(files, output.files)
          commands.push(...output.commands)
        }
      }
    }

    // Apply test-specific setup overrides (take precedence)
    if (test.setup) {
      Object.assign(files, test.setup.files)
      commands.push(...test.setup.commands)
    }

    return { files, commands }
  }

  /** Register a custom fixture at runtime */
  register(name: string, fixture: TestFixture): void {
    FIXTURES[name] = fixture
  }

  /** List all available fixtures */
  listFixtures(): Array<{ name: string; description: string }> {
    return Object.entries(FIXTURES).map(([name, f]) => ({
      name,
      description: f.description,
    }))
  }
}
