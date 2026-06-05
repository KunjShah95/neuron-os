---
title: Creating an Agent Type
description: Guide to defining and registering a new Aegis agent type — AgentType schema, SOUL files, tool permissions, and type config resolution
---

# Creating an Agent Type

> **Last updated:** May 2026  
> **Module:** `src/agent/agent-types.ts`  
> **Registry:** `AGENT_TYPES` map  

## Overview

Agent types define the personality, capabilities, and constraints of spawned agent workers. They control which tools an agent can use, what system prompt it receives, and which model it should use.

## The `AgentType` Interface

```typescript
interface AgentType {
  name: AgentTypeName                    // Unique identifier
  mode: "primary" | "subagent"          // Role classification
  description: string                    // Human-readable description
  tools: ToolPermission[]                // Allowed tools
  systemPrompt: string                   // Default system instructions
  modelHint?: string                     // Recommended model (e.g., "claude-opus-4")
  maxTurns?: number                      // Step limit
  temperature?: number                   // Model temperature override
}
```

**`mode` semantics:**
- `"primary"` — Shown in the mode selector, suitable as the main agent
- `"subagent"` — Used internally as a worker, not shown in the selector

## Step-by-Step: Creating a New Agent Type

### 1. Add the Type Name

In `src/agent/agent-types.ts`, add your type to the `AgentTypeName` union:

```typescript
export type AgentTypeName =
  | "build"
  | "plan"
  // ... existing types
  | "translator"   // ← add here
```

### 2. Define the Agent Type Object

Add your type to the `AGENT_TYPES` record:

```typescript
export const AGENT_TYPES: Record<AgentTypeName, AgentType> = {
  // ... existing types

  translator: {
    name: "translator",
    mode: "subagent",
    description: "Translate code between programming languages (read, write)",
    tools: [
      { name: "read", allow: true },
      { name: "read_skill", allow: true },
      { name: "write", allow: true },
      { name: "edit", allow: true },
    ],
    systemPrompt:
      "You are a code translation agent. Convert code between programming languages while preserving behavior, style, and idiomatic patterns. Always explain the translation decisions.",
    maxTurns: 30,
    temperature: 0.1,
  },
}
```

### 3. Create a SOUL File (Optional)

For deeper customization, create a `skills/translator/SOUL.md`:

```markdown
# Translator SOUL

You specialize in:
- Python ↔ TypeScript translation
- Idiomatic patterns in both languages
- Maintaining type safety during translation
- Preserving test coverage structure
```

The SOUL file is loaded automatically by `loadSoul()` when the agent type is used, augmenting the system prompt.

### 4. Use the Type

The agent type is used when spawning agents:

```typescript
// Via the API
const id = await agentManager.spawn({
  name: "my-translator",
  script: "src/agent/agent-worker.ts",
  agentType: "translator",
})

// Via the CLI
// aegis agent spawn --name my-translator --type translator
```

## Type Configuration Resolution

When a type is specified during spawn, the `AgentManager.spawn()` method:

1. Looks up the type via `getAgentType(name)`
2. Merges type tools with any explicitly provided tools (explicit wins)
3. Injects environment variables:
   - `AEGIS_AGENT_TYPE` — the type name
   - `AEGIS_SYSTEM_PROMPT` — the type's system prompt
   - `AEGIS_MODEL_HINT` — if set
   - `AEGIS_MAX_TURNS` — if set
   - `AEGIS_TEMPERATURE` — if set
4. Falls back to explicit field if agent type is not found

## Built-in Types Reference

| Type | Mode | Tools | Model | maxTurns | Temp |
|------|------|-------|-------|----------|------|
| `build` | primary | All 10 tools | — | — | — |
| `plan` | primary | read, grep, glob | opus-4 | — | 0.3 |
| `read` | subagent | read, grep, glob | — | 20 | — |
| `write` | subagent | write, edit, read | — | 30 | — |
| `test` | subagent | bash(test), read | — | — | — |
| `validate` | subagent | read, bash(lint) | — | — | — |
| `review` | subagent | read, grep, glob | opus-4 | — | 0.2 |
| `debug` | subagent | All 10 tools | opus-4 | 50 | — |
| `document` | subagent | read, write | — | — | — |
| `refactor` | subagent | write, edit, read | — | — | — |
| `deploy` | subagent | bash(deploy), read | — | — | — |
| `monitor` | subagent | bash, read | — | — | — |
| `explore` | subagent | read, grep, glob | — | 10 | — |

## Best Practices

1. **Minimal tool permissions** — Grant only the tools the agent type needs. Privilege of least access.
2. **Set `modelHint` for complex tasks** — Use `"claude-opus-4"` for agents doing planning, review, or debugging.
3. **Set `maxTurns` for cost control** — Prevent runaway agents by setting reasonable step limits.
4. **Lower temperature for deterministic tasks** — Use 0.1–0.3 for analysis/translation; leave default for creative tasks.
5. **Write specific system prompts** — Clear, focused instructions produce better results than generic ones.
6. **Use SOUL files for project-specific customization** — They're loaded automatically and can be checked into version control.
