import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import type { Mode } from "./types"
import type { EvalResult } from "../harness"
import { discoverTests, runSuite, writeReports } from "../harness"

let lastResults: EvalResult[] = []

export const harnessMode: Mode = {
  id: "harness",
  name: "Harness",
  description: "Agent evaluation runner",

  async run() {
    const tests = discoverTests()
    const lines: string[] = [""]

    if (tests.length === 0) {
      lines.push(`  ${theme.warn("No test cases found")}`)
      lines.push("")
      lines.push(`  ${theme.muted("Add .md files to .aegis/harness/")}`)
      lines.push("")
      lines.push(`  ${theme.heading("Test file format")}`)
      lines.push(`  ${theme.dim("# Test Name")}`)
      lines.push(`  ${theme.dim("## tags: smoke, tool-use")}`)
      lines.push(`  ${theme.dim("## timeout: 60000")}`)
      lines.push(`  ${theme.dim("")}`)
      lines.push(`  ${theme.dim("The prompt text goes here...")}`)
    } else {
      lines.push(`  ${theme.success(`● ${tests.length} test case(s) found`)}`)
      lines.push("")
      lines.push(`  ${theme.heading("Tests")}`)
      for (const t of tests) {
        const tags = t.tags?.length ? ` [${t.tags.join(", ")}]` : ""
        lines.push(`  ${theme.dim("·")} ${t.name}${theme.muted(tags)}`)
      }
      lines.push("")
      lines.push(`  ${theme.muted("Press R to run all tests")}`)

      if (lastResults.length > 0) {
        const passed = lastResults.filter((r) => r.passed).length
        const failed = lastResults.filter((r) => !r.passed).length
        lines.push("")
        lines.push(`  ${theme.heading("Last Run")}`)
        lines.push(
          `  ${theme.success(`  ${passed} passed`)}${failed > 0 ? `, ${theme.error(`${failed} failed`)}` : ""}`,
        )
        for (const r of lastResults) {
          const icon = r.passed ? theme.success("✓") : theme.error("✗")
          lines.push(`  ${icon} ${r.test.name} ${theme.muted(`(${r.durationMs}ms, ${r.steps} steps)`)}`)
        }
        lines.push("")
        lines.push(`  ${theme.muted("Press E to export report")}`)
      }
    }

    return showInfoScreen("Harness", lines, { back: true })
  },
}

// Expose for keyboard handler (called externally by launcher if needed)
export function runHarnessTests(): void {
  const tests = discoverTests()
  if (tests.length > 0) {
    runSuite(tests).then((results) => {
      lastResults = results
    })
  }
}

export function exportHarnessReport(): void {
  if (lastResults.length > 0) {
    writeReports(lastResults)
  }
}
