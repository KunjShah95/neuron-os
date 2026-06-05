import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { discoverTests, runSuite, writeReports } from "../../harness"
import type { EvalResult } from "../../harness"

export function registerHarness(program: Command) {
  const harness = program
    .command("harness")
    .alias("h")
    .description("Agent evaluation harness")

  harness
    .command("run")
    .description("Run all test cases")
    .option("--name <pattern>", "Only run tests matching name pattern")
    .option("--tag <tag>", "Only run tests with this tag")
    .action(handleRun)

  harness
    .command("report")
    .description("Export last test run report")
    .action(handleReport)

  harness
    .command("status")
    .description("Show harness status (tests found, etc.)")
    .action(handleStatus)

  // Default: show status
  harness.action(handleStatus)
}

async function handleStatus() {
  showBanner()

  const tests = discoverTests()

  console.log()
  if (tests.length === 0) {
    console.log(`  ${theme.warn("No test cases found")}`)
    console.log(`  ${theme.muted("Add .md files to .aegis/harness/")}`)
    console.log()
    console.log(`  ${theme.heading("Test file format")}`)
    console.log(`  ${theme.dim("  # Test Name")}`)
    console.log(`  ${theme.dim("  ## tags: smoke, tool-use")}`)
    console.log(`  ${theme.dim("  ## timeout: 60000")}`)
    console.log(`  ${theme.dim("  ")}`)
    console.log(`  ${theme.dim("  The prompt text goes here...")}`)
  } else {
    console.log(`  ${theme.success(`● ${tests.length} test case(s) found`)}`)
    console.log()
    console.log(`  ${theme.heading("Tests")}`)
    for (const t of tests) {
      const tags = t.tags?.length ? ` [${t.tags.join(", ")}]` : ""
      console.log(`  ${theme.dim("·")} ${t.name}${theme.muted(tags)}`)
    }
    console.log()
    console.log(`  ${theme.muted("Run: aegis harness run")}`)
  }
  console.log()
}

let lastResults: EvalResult[] = []

async function handleRun(opts: { name?: string; tag?: string }) {
  showBanner()

  const allTests = discoverTests()
  let tests = allTests

  if (opts.name) {
    const pattern = opts.name.toLowerCase()
    tests = tests.filter(t => t.name.toLowerCase().includes(pattern))
  }
  if (opts.tag) {
    const tag = opts.tag.toLowerCase()
    tests = tests.filter(t => t.tags?.some(tt => tt.toLowerCase() === tag))
  }

  if (tests.length === 0) {
    console.log(theme.warn(`\n  No matching test cases found\n`))
    process.exit(1)
  }

  console.log(theme.info(`\n  Running ${tests.length} test case(s)...\n`))

  const results = await runSuite(tests)
  lastResults = results

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log()
  for (const r of results) {
    const icon = r.passed ? theme.success("✓") : theme.error("✗")
    console.log(`  ${icon} ${r.test.name} ${theme.muted(`(${r.durationMs}ms, ${r.steps} steps)`)}`)
    if (!r.passed && r.error) {
      console.log(`     ${theme.dim(`error: ${r.error}`)}`)
    }
  }
  console.log()
  console.log(`  ${theme.bold("Results:")} ${theme.success(`${passed} passed`)}${failed > 0 ? `, ${theme.error(`${failed} failed`)}` : ""}`)

  if (failed > 0) {
    console.log(`  ${theme.muted("Run: aegis harness report to save results")}`)
  }
  console.log()
}

async function handleReport() {
  showBanner()

  if (lastResults.length === 0) {
    console.log(theme.warn("\n  No test results to export. Run tests first with `aegis harness run`.\n"))
    return
  }

  writeReports(lastResults)
  console.log(theme.success("\n  Report exported to .aegis/harness/reports/\n"))
}
