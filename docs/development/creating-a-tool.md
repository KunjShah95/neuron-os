---
title: Creating a Tool
description: Step-by-step guide to building and registering a new Aegis tool — Tool interface, registry, permissions, and error handling
---

# Creating a Tool

> **Last updated:** May 2026  
> **Module:** `src/tools/`  
> **Registry:** `toolRegistry` singleton  

## Overview

Tools are the atomic capabilities that AI agents can call. Each tool implements a simple interface and is registered in the global `ToolRegistry`. Tools are automatically exposed to the agent engine via the Vercel AI SDK's `tool()` wrapper.

## The `Tool` Interface

```typescript
interface Tool {
  name: string                          // Unique identifier (e.g., "read", "bash")
  description: string                   // Verbose description for the AI model
  parameters: ToolParameter[]           // Declared parameters
  execute(params, ctx): Promise<ToolResult>
}

interface ToolParameter {
  name: string                          // Parameter name
  type: "string" | "number" | "boolean" | "array"
  description: string                   // Description for the AI model
  required?: boolean                    // Whether the param is mandatory
  default?: unknown                     // Default value if not provided
}

interface ToolResult {
  success: boolean
  output: string                        // Display output for the AI
  error?: string                        // Error message if failed
  metadata?: Record<string, unknown>    // Additional structured data
}

interface ToolContext {
  agentId: string
  agentType?: string
  cwd: string
  permissions: ToolPermission[]         // Agent's allowed tools
}
```

## Step-by-Step: Creating a New Tool

### 1. Create the Tool File

Create `src/tools/my-tool.ts`:

```typescript
import type { Tool, ToolContext, ToolResult } from "./registry"

async function execute(
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const name = params.name as string
  const greeting = params.formal ? `Good day, ${name}!` : `Hey ${name}!`

  return {
    success: true,
    output: greeting,
  }
}

export const myTool: Tool = {
  name: "greet",
  description: "Greet a person by name. Use this to say hello to users.",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "The person's name to greet",
      required: true,
    },
    {
      name: "formal",
      type: "boolean",
      description: "Use formal greeting style",
      required: false,
      default: false,
    },
  ],
  execute,
}
```

### 2. Register the Tool

Add your tool to the auto-registration in `src/tools/index.ts`:

```typescript
import { myTool } from "./my-tool"

export function registerBuiltinTools(): void {
  // ... existing registrations
  toolRegistry.register(myTool)
}
```

The `registerBuiltinTools()` function is called automatically on module import, so your tool will be available immediately.

### 3. Add Tool Permissions (Optional)

If your tool should be restricted to specific agent types, add it to the tool permission system in `src/agent/agent-types.ts`:

```typescript
const ALL_TOOLS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "greet", allow: true },  // ← add here
  // ...
]
```

## Built-in Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `read` | path (string), maxLines (number?) | Read file contents |
| `write` | path (string), content (string) | Create new files |
| `edit` | path (string), old, new (string), allowMultiple (bool?) | Search-and-replace edits |
| `bash` | command (string), timeout (number?) | Execute shell commands |
| `glob` | pattern (string) | File pattern matching |
| `grep` | pattern (string), path (string?), flags (string?) | Code search |
| `read_skill` | name (string) | Read a skill's instructions |
| `web_fetch` | url (string) | Fetch a web page |
| `web_search` | query (string) | Search the web |
| `computer` | action (string), coordinate (string?) | Screen interaction |

### Tool Implementation Patterns

**Read Tool** (`src/tools/read.ts`):
```typescript
export const readTool: Tool = {
  name: "read",
  description: `Read the contents of a file. Use this when you need to understand an existing file, check for bugs, or review code. Supports line limits.`,
  parameters: [
    { name: "path", type: "string", description: "File path", required: true },
    { name: "maxLines", type: "number", description: "Max lines to read", required: false },
  ],
  execute: async (params, ctx) => {
    const path = params.path as string
    try {
      const content = await readFile(resolve(ctx.cwd, path), "utf-8")
      const lines = content.split("\n")
      const maxLines = (params.maxLines as number) || lines.length
      return { success: true, output: lines.slice(0, maxLines).join("\n") }
    } catch (err: any) {
      return { success: false, output: "", error: err.message }
    }
  },
}
```

## Permission System

Each agent type has a set of `ToolPermission[]` that controls which tools the agent can call:

```typescript
interface ToolPermission {
  name: string
  allow: boolean
  patterns?: string[]   // E.g., for bash tool: allowed command patterns
}
```

The `ToolRegistry.execute()` checks permissions before running the tool:

```typescript
const perm = ctx.permissions.find((p) => p.name === name)
if (!perm || !perm.allow) {
  return { success: false, output: "", error: "Tool not permitted" }
}
```

## Error Handling

Always return `ToolResult` objects — never throw from `execute()`:

```typescript
// ✅ Good
return { success: false, output: "", error: "File not found" }

// ❌ Bad — throw non-ToolResult
throw new Error("File not found")
```

The registry wraps execution in try/catch, but explicit error handling is preferred for better error messages.

## Testing

```typescript
import { toolRegistry } from "../tools"

// Test tool execution
const result = await toolRegistry.execute("read", { path: "test.txt" }, {
  agentId: "test",
  cwd: process.cwd(),
  permissions: [{ name: "read", allow: true }],
})

assert(result.success, "Tool should execute successfully")
assert(result.output.includes("test content"), "Should read file content")
```
