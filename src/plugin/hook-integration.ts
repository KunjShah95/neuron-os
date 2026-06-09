import { pluginHooks } from "./hooks"
import type { PlatformMessage } from "../adapters/types"
import type { ToolContext } from "../tools/registry"

export function createSpawnHookContext(agentId: string): Record<string, unknown> {
  return { agentId }
}

export function createToolHookContext(toolName: string, params: Record<string, unknown>, ctx: ToolContext): Record<string, unknown> {
  return { toolName, params, agentId: ctx.agentId, agentType: ctx.agentType }
}

export function createMessageHookContext(msg: PlatformMessage): Record<string, unknown> {
  return { message: msg, platform: msg.platform, channelId: msg.channelId, userId: msg.userId }
}

export async function runSpawnHooks(agentId: string): Promise<void> {
  await pluginHooks.run("on_agent_spawn", createSpawnHookContext(agentId))
}

export async function runToolCallHooks(
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ blocked: boolean }> {
  return pluginHooks.run("on_tool_call", createToolHookContext(toolName, params, ctx))
}

export async function runMessageHooks(msg: PlatformMessage): Promise<{ blocked: boolean }> {
  return pluginHooks.run("on_message", createMessageHookContext(msg))
}
