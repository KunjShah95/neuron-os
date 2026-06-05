/**
 * cli — interactive CLI mode launcher.
 * Ported from chaicodeclaw-build: figlet banner → mode selection → run mode.
 */

import chalk from "chalk"
import { select, text, isCancel } from "@clack/prompts"
import figlet from "figlet"
import { runAgentOrchestrator } from "./agent-run"
import { runAskOrchestrator } from "./ask"
import { runPlanModeInteractive } from "./plan/orchestrator"
import { runResearchLoop } from "./research"
import { renderTerminalMarkdown } from "../tui/terminal-md"

const BANNER_FONT = "ANSI Shadow"
const SHADOW = chalk.hex("#5b4d9e")
const FACE = chalk.hex("#e8dcf8").bold

function printBannerWithShadow(ascii: string) {
  const bannerLines = ascii.replace(/\s+$/, "").split("\n")
  const maxLen = Math.max(...bannerLines.map((l) => l.length), 0)
  const rowWidth = maxLen + 2

  for (const line of bannerLines) {
    console.log(SHADOW((" " + line).padEnd(rowWidth)))
  }
  process.stdout.write(`\x1b[${bannerLines.length}A`)
  for (const line of bannerLines) {
    console.log(FACE(line.padEnd(rowWidth)))
  }
  console.log()
}

export async function runWakeup() {
  let ascii: string
  try {
    ascii = figlet.textSync("neuron os", { font: BANNER_FONT })
  } catch {
    ascii = figlet.textSync("neuron os", { font: "Standard" })
  }
  printBannerWithShadow(ascii)

  const mode = await select({
    message: "Which mode would you like to enter?",
    options: [
      { value: "ask", label: "Ask Mode", hint: "Ask questions about the codebase" },
      { value: "agent", label: "Agent Mode", hint: "Let the AI modify your codebase" },
      { value: "plan", label: "Plan Mode", hint: "Generate and execute step-by-step plans" },
      { value: "research", label: "Research Mode", hint: "Autonomous research loop (Karpathy-style)" },
      { value: "exit", label: "Exit", hint: "Return to CLI" },
    ],
  })

  if (isCancel(mode) || mode === "exit") {
    console.log(chalk.dim("\n Goodbye.\n"))
    return
  }

  if (mode === "ask") {
    console.log(chalk.bold("\n❓ Ask Mode\n"))
    const question = await text({
      message: "What do you want to ask about the codebase?",
      placeholder: "e.g., How does the agent system work?",
    })
    if (isCancel(question) || !question?.trim()) return
    console.log(chalk.cyan("\n🔍 Researching your question…\n"))
    try {
      const answer = await runAskOrchestrator(question.trim())
      console.log("\n" + renderTerminalMarkdown(answer) + "\n")
    } catch (err: any) {
      console.log(chalk.red(`\nError: ${err.message ?? String(err)}\n`))
    }
  } else if (mode === "agent") {
    const goal = await text({
      message: "What would you like the agent to do?",
      placeholder: "e.g., Add a health check endpoint to the API",
    })
    if (isCancel(goal) || !goal?.trim()) return
    console.log(chalk.cyan("\n🤖 Running agent…\n"))
    try {
      const result = await runAgentOrchestrator(goal.trim())
      console.log("\n" + result + "\n")
    } catch (err: any) {
      console.log(chalk.red(`\nError: ${err.message ?? String(err)}\n`))
    }
  } else if (mode === "plan") {
    await runPlanModeInteractive()
  } else if (mode === "research") {
    await runResearchMode()
  }
}

async function runResearchMode() {
  console.log(chalk.bold("\n🧪 Autonomous Research Mode\n"))
  console.log(chalk.dim("Inspired by Karpathy's autoresearch — the AI iterates on your codebase autonomously.\n"))

  const goal = await text({
    message: "What is the research goal?",
    placeholder: "e.g., Optimize the memory vector search performance",
  })
  if (isCancel(goal) || !goal?.trim()) return

  const criteria = await text({
    message: "What is the success criteria?",
    placeholder: "e.g., Vector search returns results in under 50ms",
  })
  if (isCancel(criteria)) return

  const testCmdText = await text({
    message: "Test command to measure success (optional):",
    placeholder: "e.g., bun run test --filter=vector",
  })
  if (isCancel(testCmdText)) return

  const maxItersStr = await text({
    message: "Max iterations?",
    initialValue: "10",
    validate: (v) => (isNaN(parseInt(v || "0")) ? "Enter a number" : undefined),
  })
  if (isCancel(maxItersStr)) return
  const maxIters = parseInt(maxItersStr || "10", 10)

  console.log(chalk.yellow(`\n🚀 Starting research loop (${maxIters} max iterations)…\n`))

  const result = await runResearchLoop(
    {
      goal: goal.trim(),
      successCriteria: criteria.trim(),
      maxIterations: maxIters,
      testCommand: testCmdText?.trim() || undefined,
    },
    (msg) => console.log(msg),
  )

  console.log("\n" + renderTerminalMarkdown(result.finalSummary) + "\n")
}
