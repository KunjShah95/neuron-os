# Toolsets & Programmatic Tool Calling — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v0.7.x — composable toolsets + `execute_code` for token-economy collapse

## Context

Aegis currently has 14 agent types with hardcoded tool permissions (see `AGENTS.md`) and a ReAct loop in `src/agent/agent-worker.ts`. Tools are individually addressable but not **composable**: you cannot say "give me the `web` + `code_execution` + `delegation` toolset" and have the agent receive a derived, conflict-checked set.

Hermes Agent pioneered two related capabilities that are missing in Aegis:

1. **Toolsets with recursive resolution** — `{ name, description, tools: string[], includes: string[] }`, composed at runtime with cycle detection and a `*`/`all` alias. Lets the user request "everything for a research task" in one line and the agent gets the right surface.
2. **Programmatic Tool Calling (`execute_code`)** — the agent writes a TypeScript script that calls Aegis tools programmatically over IPC. Intermediate tool results never enter the LLM context window. A 10-step LLM loop collapses into one turn.

Aegis is already TypeScript/Bun, so unlike Hermes (Python+UDS) we use **Bun subprocess + named pipe on Windows / Unix domain socket on POSIX**, reusing the existing JSON-line IPC protocol from `src/agent/`.

## 1. Goals

1. **Composable toolsets** — `resolveToolset(name)` with cycle detection, diamond-dep dedup, `*`/`all` alias, and runtime registration.
2. **`execute_code` tool** — accepts TS/JS, runs in isolated child Bun process, communicates over the existing IPC, returns only `print()` output to the LLM.
3. **Token economy** — collapse 5+ step LLM loops into one turn; expected ~10x context reduction for complex multi-tool tasks.
4. **Security parity with `terminal()`** — env scrubbing, resource caps, approval flow, recursion block.
5. **CLI surface** — `aegis toolset {list, show, new, test}` and `aegis agent spawn --toolset <name>`.

## 2. Non-Goals (v1)

- Python execution (Bun is the stack; tracked for v2 if users ask)
- Persistent interactive REPL / pty support for `execute_code` (only `terminal()` gets that)
- Background or detached scripts (foreground only)
- Cross-toolset permission inheritance beyond the `includes` model
- Toolset marketplace / Hub for toolsets (skills Hub is separate; tracked for v1.x)

## 3. Architecture

```
                     ┌──────────────────────────────┐
                     │  ~/.aegis/toolsets/*.yaml     │  user-defined
                     │  src/toolsets/bundled/*.yaml  │  shipped
                     └────────────┬─────────────────┘
                                  │ load on boot
                                  ▼
   ┌──────────────────────────────────────────────────┐
   │  src/toolsets/registry.ts                         │
   │    - register(toolset)                            │
   │    - resolveToolset(name, visited?) → string[]   │
   │    - resolveMultipleToolsets(names) → string[]   │
   │    - getToolsetInfo(name) → full details         │
   └────────────┬─────────────────────────────────────┘
                │ tool list
                ▼
   ┌──────────────────────────────────────────────────┐
   │  src/agent/agent-worker.ts (existing ReAct loop) │
   │    - loads toolset at spawn time                  │
   │    - injects resolved tool list into LLM         │
   └────────────┬─────────────────────────────────────┘
                │ when LLM emits tool_call "execute_code"
                ▼
   ┌──────────────────────────────────────────────────┐
   │  src/tools/execute-code.ts                        │
   │    - validates against approval policy            │
   │    - writes <staging>/aegis_tools.ts (stub)      │
   │    - writes <staging>/<uuid>.ts (script)         │
   │    - spawns bun run <uuid>.ts (scrubbed env)    │
   │    - mediates IPC: tool calls go parent→child   │
   │    - returns { output, duration_ms, tool_calls } │
   └──────────────────────────────────────────────────┘
```

## 4. Toolset Schema (Zod)

```ts
const ToolsetDef = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  tools: z.array(z.string()).default([]),
  includes: z.array(z.string()).default([]),   // other toolsets
})
```

Bundled toolsets ship in `src/toolsets/bundled/`:

| Name | Includes | Tools |
|---|---|---|
| `web` | — | `web_search`, `web_extract` |
| `search` | — | `web_search` |
| `vision` | — | `vision_analyze` |
| `code-execution` | — | `execute_code` |
| `delegation` | — | `delegate_task` |
| `file-ops` | — | `read_file`, `write_file`, `patch`, `search_files` |
| `shell` | — | `terminal`, `process` |
| `research` | `web`, `file-ops` | — |
| `full-stack` | `research`, `shell`, `code-execution`, `delegation` | — |
| `*` / `all` | all registered | — |

## 5. `execute_code` Tool Spec

**Input:**
```ts
{ code: string, language: 'typescript' | 'javascript' }
```

**Output:**
```ts
{
  output: string,        // stdout from print() and console.log()
  duration_ms: number,
  tool_calls: Array<{ name: string, args: unknown, result_summary: string }>,
  truncated: boolean,
  reason?: 'timeout' | 'tool_cap' | 'stdout_cap' | 'ipc_disconnected' | 'syntax_error',
}
```

**Stub module auto-generated into the staging dir:**
```ts
// <staging>/aegis_tools.ts (regenerated per call)
import { sendRpc } from "./aegis_ipc.ts"
export const web_search = (q: string) => sendRpc("web_search", { query: q })
export const web_extract = (url: string) => sendRpc("web_extract", { url })
export const read_file = (p: string) => sendRpc("read_file", { path: p })
export const write_file = (p: string, c: string) => sendRpc("write_file", { path: p, content: c })
export const search_files = (q: string) => sendRpc("search_files", { query: q })
export const patch = (p: string, oldS: string, newS: string) => sendRpc("patch", { path: p, old_string: oldS, new_string: newS })
export const terminal = (cmd: string) => sendRpc("terminal", { command: cmd }) // foreground only
```

**Resource limits (configurable in `~/.aegis/config.yaml`):**
- `code_execution.timeout_ms` — default 30_000
- `code_execution.tool_call_cap` — default 50
- `code_execution.stdout_cap_bytes` — default 1_048_576 (1 MB)
- `code_execution.staging_dir` — default `os.tmpdir()/aegis-exec-<uuid>` (always cleaned up)

**Block list (cannot be called from inside a script):**
- `execute_code` (no recursion)
- `delegate_task` (would explode the context)
- MCP tools (security boundary)

**Env scrubbing (per spec, identical to Hermes):**
- Strip: `*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AEGIS_VAULT_KEY`
- Pass-through (opt-in, explicit allowlist): `PATH`, `HOME`, `LANG`, `NODE_ENV`

## 6. Data Flow

1. LLM emits `tool_call` for `execute_code` with `{ code, language }`.
2. Engine checks the agent-type approval policy (same as `terminal()` in `AGENTS.md`).
3. If dangerous → `approval_callback` waits for user OK (TUI prompt, dashboard modal, or gateway "y/n" reply).
4. Engine creates staging dir, writes stub + script.
5. Engine spawns `bun run <uuid>.ts` in a new process group with scrubbed env + resource limits.
6. Script runs; `aegis_tools.<x>()` calls send JSON-line messages over the IPC channel (named pipe on Windows, UDS on POSIX).
7. Parent's `handleFunctionCall` dispatcher executes the underlying tool (reusing the existing `src/tools/` registry) and returns the result.
8. Only the script's captured stdout (from `print()`) and the metadata block are returned to the LLM.
9. Staging dir is deleted; tool-call record is appended to the audit log (with secrets scrubbed from `args`).

## 7. Error Handling

| Failure | Behavior |
|---|---|
| Syntax error | Returned as `{ output: '', reason: 'syntax_error' }` — does NOT count as a tool-call failure; LLM can retry |
| Timeout | Kill process group; return `{ truncated: true, reason: 'timeout' }`; partial stdout preserved |
| Tool-call cap exceeded | Send SIGTERM; return `{ truncated: true, reason: 'tool_cap' }`; final tool's result included |
| Stdout cap exceeded | Truncate at 1 MB with `<...truncated>` marker; return `{ truncated: true, reason: 'stdout_cap' }` |
| IPC disconnect | Child exits non-zero; return `{ output: '', reason: 'ipc_disconnected' }`; parent logs the disconnect |
| Recursion attempt (`execute_code` called from inside) | Reject at stub-generation time; child gets `Error: execute_code is not callable from inside a script` |
| Staging dir cleanup failure | Log warning; rely on OS tempdir rotation |

## 8. Testing

**Unit:**
- `resolveToolset()` — cycles, diamond deps, `*`/`all` alias, missing toolset, plugin composition
- Stub generator — handles all 6 exported tools, regenerates per call
- Env scrubber — strips all patterns, preserves allowlist, handles unset vars
- Approval callback — fires for dangerous patterns, returns LLM-friendly message on reject

**Integration:**
- Agent loop calls `execute_code`; inner script calls `web_search` + `terminal` + `read_file`; assert LLM only sees the final `print()` output (verify by counting `tool_call` events emitted)
- Timeout fires after 5s on a `while(true)` script
- Recursion block: script tries to import `execute_code` from a custom stub — fails
- Staging dir is empty after run

**E2E:**
- TUI task: "Find the 3 most recent GitHub issues for `KunjShah95/neuron-os`, summarize each, and write a markdown report to `/tmp/issues.md`." — done via `execute_code` with `web_extract` + `write_file` inside.

## 9. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(toolsets): registry + resolveToolset + bundled toolsets` | Foundation; CLI `aegis toolset list/show` |
| 2 | `feat(execute-code): Bun subprocess + named pipe/UDS IPC` | Tool works on POSIX; CLI `aegis agent spawn --toolset research` |
| 3 | `feat(execute-code): Windows named pipe support` | Parity |
| 4 | `feat(execute-code): approval flow + env scrubbing` | Security gates |
| 5 | `feat(execute-code): skill_manage integration` | Skills can declare they require `code-execution` toolset; auto-loaded |
| 6 | `docs(toolsets): guide + examples` | User-facing docs |

## 10. Open Questions (for the user during plan review)

- Should `execute_code` be opt-in per-agent-type (default off) or opt-out (default on for `build` type)?
- Should we expose the `aegis_tools.ts` stub to the LLM as a read-only reference file, or keep it auto-generated and invisible?
- For the `full-stack` toolset — should it require explicit `--danger-allow-full-stack` or just be available to `build` agents by default?
