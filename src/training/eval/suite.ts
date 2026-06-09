/**
 * src/training/eval/suite.ts
 *
 * 50-task benchmark suite across 5 categories:
 *   coding, debugging, refactoring, web research, multi-agent coordination
 *
 * Each task is defined in evals/tasks/<category>/<task-name>.yaml.
 * This module loads and validates tasks.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { createLogger } from "../../cli/logger"

const log = createLogger("eval:suite")

export interface EvalTask {
  id: string
  category: string
  description: string
  input: string
  verification: { command: string; expect_exit_code: number }[]
  timeout_ms: number
  judge_prompt: string
}

export class EvalSuite {
  private tasks: EvalTask[] = []
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolve(process.cwd(), "evals")
  }

  /**
   * Load the full benchmark suite from evals/tasks/ directory.
   */
  load(): EvalTask[] {
    this.tasks = []
    const categories = ["coding", "debugging", "refactoring", "web-research", "multi-agent", "adversarial"]

    for (const category of categories) {
      const catDir = join(this.baseDir, "tasks", category)
      if (!existsSync(catDir)) {
        log.warn(`Category directory not found: ${catDir}`)
        continue
      }

      const files = readdirSync(catDir).filter(
        (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !/^[\w-]+-list-\d+\./.test(f),
      )

      for (const file of files) {
        try {
          const content = readFileSync(join(catDir, file), "utf-8")
          const task = this.parseTask(content, category, file.replace(/\.(yaml|yml)$/, ""))
          if (task) this.tasks.push(task)
        } catch (err) {
          log.warn(`Failed to load task ${file}: ${String(err)}`)
        }
      }
    }

    log.info(`Loaded ${this.tasks.length} tasks from ${categories.length} categories`)
    return this.tasks
  }

  /**
   * Load a single task by ID.
   */
  loadById(id: string): EvalTask | undefined {
    if (this.tasks.length === 0) this.load()
    return this.tasks.find((t) => t.id === id)
  }

  /**
   * Parse a YAML task definition into an EvalTask.
   * Simple parser — no YAML dependency needed.
   */
  private parseTask(content: string, category: string, taskName: string): EvalTask | null {
    const id = `${category}-${taskName}`

    try {
      // Simple YAML-like parsing
      const lines = content.split("\n")
      let description = ""
      let input = ""
      let timeout_ms = 120000
      let judge_prompt = ""
      const verification: { command: string; expect_exit_code: number }[] = []

      let section: string | null = null

      for (const line of lines) {
        const trimmed = line.trim()

        if (trimmed.startsWith("description:")) {
          description = trimmed.slice("description:".length).trim()
          if (description.startsWith('"') && description.endsWith('"')) {
            description = description.slice(1, -1)
          }
        } else if (trimmed.startsWith("input: |")) {
          section = "input"
        } else if (trimmed.startsWith("verification:")) {
          section = "verification"
        } else if (trimmed.startsWith("timeout_ms:")) {
          timeout_ms = parseInt(trimmed.split(":")[1]?.trim() ?? "120000", 10)
        } else if (trimmed.startsWith("judge_prompt: |")) {
          section = "judge_prompt"
        } else if (section === "input") {
          if (
            trimmed.startsWith("expected_files:") ||
            trimmed.startsWith("verification:") ||
            trimmed.startsWith("timeout_ms:") ||
            trimmed.startsWith("judge_prompt:")
          ) {
            section = null
          } else if (trimmed && !trimmed.startsWith("#")) {
            input += (input ? "\n" : "") + trimmed
          }
        } else if (section === "judge_prompt") {
          if (trimmed.startsWith("```") || trimmed.startsWith("---") || trimmed.startsWith("#")) {
            // Skip code blocks and comments
          } else if (trimmed) {
            judge_prompt += (judge_prompt ? "\n" : "") + trimmed
          }
        } else if (trimmed.startsWith("- command:")) {
          const cmd = trimmed.slice("- command:".length).trim()
          if (cmd.startsWith('"') && cmd.endsWith('"')) {
            verification.push({ command: cmd.slice(1, -1), expect_exit_code: 0 })
          } else {
            verification.push({ command: cmd, expect_exit_code: 0 })
          }
        }
      }

      if (!description && !input) {
        // Use task name as description
        description = taskName.replace(/-/g, " ")
      }

      return {
        id,
        category,
        description,
        input,
        verification,
        timeout_ms,
        judge_prompt: judge_prompt || `Score 1.0 if the task output is correct, 0.0 otherwise. Output ONLY the score.`,
      }
    } catch (err) {
      log.warn(`Failed to parse task ${id}: ${String(err)}`)
      return null
    }
  }

  /**
   * Get tasks filtered by category.
   */
  getByCategory(category: string): EvalTask[] {
    return this.tasks.filter((t) => t.category === category)
  }

  /**
   * Get summary statistics for the loaded suite.
   */
  getStats(): { total: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {}
    for (const task of this.tasks) {
      byCategory[task.category] = (byCategory[task.category] ?? 0) + 1
    }
    return { total: this.tasks.length, byCategory }
  }
}

export const evalSuite = new EvalSuite()
