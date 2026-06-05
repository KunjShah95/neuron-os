/**
 * agent-run — approval-based agent orchestrator.
 *
 * The AI agent uses tools to explore and modify the codebase.
 * All mutations are staged via ActionTracker + approval flow
 * before being applied to disk.
 */

import { createAgentRuntime } from "../agent/runtime"
import { AIProviderManager, type AIConfig, resolveApiKey } from "../ai"
import { AgentEngine } from "../agent/engine"
import type { AIProviderType } from "../ai/models"
import { ActionTracker, type ActionLog } from "../agent/action-tracker"
import { AgentToolExecutor } from "../agent/agent-tools"

interface AgentOrchestratorCallbacks {
  onStaged?: (pending: ActionLog[]) => Promise<boolean>
}

function buildAIConfig(): AIConfig {
  const provider = (process.env.AEGIS_AI_PROVIDER ?? "openai") as AIProviderType
  return {
    provider,
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY || resolveApiKey(provider),
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: 0.7,
  }
}

/**
 * Run the agent orchestrator with a goal and optional callbacks.
 * If onStaged is provided (e.g., for Telegram inline approval),
 * it will be called instead of the default CLI approval prompt.
 *
 * Returns a summary string of what was accomplished.
 */
export async function runAgentOrchestrator(
  goal: string,
  callbacks?: AgentOrchestratorCallbacks,
  project?: string,
): Promise<string> {
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker)
  const runtime = createAgentRuntime("agent-run-mode", "build", process.cwd())
  const ai = new AIProviderManager(buildAIConfig())
  const sessionId = `agent-${Date.now().toString(36)}`
  const engine = new AgentEngine(runtime, ai, {
    maxSteps: 25,
    sessionId,
    sessionName: goal.slice(0, 60),
    goal,
    project,
  })

  try {
  // Phase 1: AI explores and plans (result is used implicitly for context)
  await engine.chat([
    {
      role: "user",
      content: `You are a code modification agent. Your task is to accomplish the following goal by exploring the codebase, planning your changes, and reporting what changes need to be made.

First, explore the codebase to understand the structure. Then describe exactly what files need to be created, modified, or deleted and what shell commands need to be run.

IMPORTANT: Do NOT make any changes yet. Just explore and describe what needs to be done.

Goal: ${goal}

Format your response as a structured plan listing:
- Files to create (with full content)
- Files to modify (with full new content)
- Files to delete
- Shell commands to run`,
    },
  ])

  // Phase 2: Stage the changes based on the plan
  // (In a full implementation, this would parse the AI's plan and stage actions)
  // For now, we run a second round where the AI executes tools directly
  const executionResult = await engine.chat([
    {
      role: "user",
      content: `You are a code modification agent. Accomplish the following goal by using the available tools.

Go ahead and make the changes using the tools at your disposal. Create, modify, or delete files as needed.

Goal: ${goal}

IMPORTANT SAFETY RULES:
1. Always read the current file content before modifying it
2. Use modify_file for changes, not create_file (unless it's a genuinely new file)
3. Never modify files in node_modules, .git, or dist
4. After making changes, verify they work`,
    },
  ])

  // Phase 3: Check for pending changes and handle approval
  const pending = tracker.getPendingMutations()

  if (pending.length === 0) {
    await engine.completeSession("completed")
    return executionResult.text || "Goal complete. No file changes were needed."
  }

  // If we have a custom approval callback (e.g., Telegram), use it
  if (callbacks?.onStaged) {
    const approved = await callbacks.onStaged(pending)
    if (!approved) {
      tracker.rejectAll()
      await engine.completeSession("completed")
      return "Changes were rejected. No files were modified."
    }
  } else {
    // Default: use CLI approval prompt
    const { promptApproval } = await import("../agent/approval")
    const approved = await promptApproval(tracker)
    if (!approved) {
      return "Changes were rejected. No files were modified."
    }
  }

  // Apply approved changes
  const { errors } = executor.applyApproved()

  if (errors.length > 0) {
    await engine.completeSession("failed")
    return `Changes applied with ${errors.length} error(s):\n${errors.join("\n")}`
  }

  await engine.completeSession("completed")

  const summary = [
    `✅ Changes applied successfully.`,
    ``,
    `Summary:`,
    ...pending.map((a) => {
      if (a.type === "tool_execute") return `  🖥  ${a.details.command}`
      return `  📄 ${a.type.replace(/_/g, " ")}: ${a.path}`
    }),
  ].join("\n")

  return summary
  } catch (err) {
    await engine.completeSession("failed")
    throw err
  }
}
