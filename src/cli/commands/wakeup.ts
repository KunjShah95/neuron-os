import type { Command } from "commander"
import { cancel } from "@clack/prompts"
import { showBanner } from "../banner"
import { theme } from "../theme"
import { WizardCancelledError } from "../guard"
import { runMenu, type MenuItem } from "../menu/menu"
import { getAllAgentTypes, isValidAgentType, type AgentTypeName } from "../../agent/agent-types"

function buildMenuTree(): MenuItem[] {
  const allAgentTypes = getAllAgentTypes()

  // Top-pick agents shown directly in main menu
  const quickTypes = ["build", "review", "debug", "plan"]
  const quickEntries: MenuItem[] = quickTypes.map((name) => {
    const t = allAgentTypes.find((a) => a.name === name)!
    return { value: t.name, label: t.name.charAt(0).toUpperCase() + t.name.slice(1), hint: t.description }
  })

  // Remaining agent types go in a "more" submenu
  const restTypes = allAgentTypes.filter((t) => !quickTypes.includes(t.name))
  const restEntries: MenuItem[] = restTypes.map((t) => ({
    value: t.name,
    label: t.name.charAt(0).toUpperCase() + t.name.slice(1),
    hint: t.description,
  }))

  return [
    {
      value: "dashboard",
      label: "Dashboard",
      hint: "Live agent status TUI",
    },
    {
      value: "chat",
      label: "Chat (default)",
      hint: "Talk to an AI agent with default tools",
    },
    ...quickEntries,
    {
      value: "__all_agents__",
      label: "All agents...",
      hint: "All 13 agent types",
      children: restEntries,
    },
    {
      value: "skills",
      label: "Skills",
      hint: "Installed skills & skills.sh browser",
    },
    {
      value: "setup",
      label: "Setup",
      hint: "Configure Aegis workspace",
    },
    {
      value: "quit",
      label: "Quit",
      hint: "Exit Aegis",
    },
  ]
}

export function registerWakeup(program: Command) {
  program
    .command("wakeup")
    .alias("w")
    .description("Show banner and enter interactive mode")
    .action(handleWakeup)
}

export async function handleWakeup() {
  showBanner()

  try {
    const menuItems = buildMenuTree()
    const result = await runMenu(menuItems, "Aegis")

    if (result.action === "quit") {
      cancel("Operation cancelled")
      process.exit(0)
    }

    const value = result.value
    const agentType = (result.path.length > 1 ? result.path[1]?.toLowerCase() : undefined) as AgentTypeName | undefined

    // Direct agent type selection → launch chat with that type
    if (isValidAgentType(value)) {
      console.log(theme.success(`\nLaunching chat with ${value} agent...`))
      const { startChat } = await import("../../chat/renderer")
      await startChat(value as AgentTypeName)
      return
    }

    console.log(theme.success(`\nLaunching ${value}${agentType ? ` with ${agentType} agent` : ""}...`))

    switch (value) {
      case "dashboard": {
        const { startDashboard } = await import("../../tui/renderer")
        await startDashboard()
        break
      }
      case "chat": {
        const { startChat } = await import("../../chat/renderer")
        await startChat(agentType)
        break
      }
      case "skills": {
        const { handleSkills } = await import("./skills")
        await handleSkills({})
        break
      }
      case "setup": {
        const { runSetupFlow } = await import("../../wizard/flows/setup")
        const { createClackPrompter } = await import("../../wizard/clack-prompter")
        const prompter = createClackPrompter()
        await runSetupFlow(prompter)
        break
      }
      default:
        console.log(theme.info(`Unknown mode: ${value}`))
    }
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      cancel("Operation cancelled")
      process.exit(0)
    }
    throw err
  }
}
