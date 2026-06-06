# Frontend Docs Section Update — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** Add all 43 CLI commands to both the dashboard and the website docs, sourced from `src/cli/commands/*.ts` via a small tested generator script. Replace the hand-maintained command lists in both frontends with a view over generated data.

## Context

The user reported that the docs sections in the frontend are stale. Investigation confirms the diagnosis and shows it's worse than just "out of date" — both frontends list commands that **don't exist** in the current CLI.

**Current state:**

- `dashboard/src/routes/Docs.tsx` — hardcodes 13 command groups covering a subset of CLI commands (some shown are stale: `aegis audit list --agent`, `aegis provenance check`, `aegis memory forget` — none of which exist in the current source).
- `website/src/sections/DocsSection.tsx` — hand-curated marketing copy. Says "14 agent types", has a "Reflection loop" topic with `aegis agent-run --ratchet` (doesn't exist).
- `src/cli/commands/index.ts` registers **43 top-level command modules** (44 `.ts` files minus `index.ts`). Some modules define subcommands (e.g. `agent` defines `agent types`, `agent list`, `agent spawn`, `agent kill`, `agent logs`, `agent inspect`). The total number of leaf commands a user can type is **higher than 43** — to be discovered by running the generator.
- `docs/modes-and-commands.md` and `docs/tui-cheatsheet.md` are accurate (and were the source of comparison).

**Why this matters:** the docs page is a *contract surface* — if we show a command, users will try it. Showing commands that don't exist is a trust bug, not a polish bug. The right fix is to make the UI a view over a single source of truth, not another hand-maintained list.

## 1. Goals

1. **Generate command metadata from source.** A small script parses `src/cli/commands/*.ts` via the TypeScript Compiler API and emits `shared/commands.json` with name, alias, description, and options for every command.
2. **Commit the generated JSON.** Both frontends import it directly — no build-step required for devs.
3. **Make the frontends views over the generated data.** Delete the hand-maintained command arrays. Add a small per-frontend presentation layer (icons/tags for the dashboard, descriptions/code-samples for the website).
4. **Catch drift in CI.** A `docs:check` script regenerates to a temp file, diffs against the committed version, and exits non-zero on drift. Wired to `pretest` and `prebuild`.
5. **Test the generator itself.** A small golden-file test suite covering 3-4 representative commands.

## 2. Non-Goals (v1)

- Replacing the dashboard's `Docs.tsx` or website's `DocsSection.tsx` designs (layouts stay as-is).
- Live API integration (e.g. `GET /api/v1/commands`).
- Auto-generating the marketing copy / code samples for the website.
- Auto-generating icons, tags, or color categories for the dashboard.
- Refreshing `docs/modes-and-commands.md` or `docs/tui-cheatsheet.md` (they are already accurate).
- Changing the CLI itself.
- Translating the generator to handle every conceivable commander.js pattern (we accept "skip with warning" for the few non-standard commands).

## 3. Architecture

```
┌─────────────────────────────┐
│ src/cli/commands/*.ts       │   Source of truth (commander.js chains)
│ (43 command modules)        │
└──────────────┬──────────────┘
               │ parses via TypeScript Compiler API
               ▼
┌─────────────────────────────┐
│ scripts/extract-commands.ts │   NEW ~150 lines
│                             │   Tested via scripts/__tests__/extract-commands.test.ts
└──────────────┬──────────────┘
               │ writes
               ▼
┌─────────────────────────────┐
│ shared/commands.json        │   NEW, committed
│ { generatedAt, commands[] } │   Mechanical facts only — no human copy
└──────┬──────────────┬───────┘
       │              │
       │ imported by  │ imported by
       ▼              ▼
┌──────────────────┐  ┌─────────────────────────┐
│ dashboard        │  │ website                 │
│ data/command-    │  │ data/docTopics.ts       │
│ Groups.ts        │  │                         │
│                  │  │                         │
│ adds: icon,      │  │ adds: description,      │
│       tags,      │  │        codeLines,       │
│       category   │  │        tableRows        │
└──────┬───────────┘  └──────┬──────────────────┘
       │                     │
       ▼                     ▼
   Docs.tsx              DocsSection.tsx
```

**Key invariant:** generated JSON holds only mechanical facts (name, alias, description, options). The presentation layer (icons, code samples, marketing copy) is a *separate file per frontend* that augments the data, never replaces it. If a command appears in the JSON, both UIs show it. If it disappears, both UIs hide it.

## 4. Generated data schema

`shared/commands.json`:

```ts
{
  generatedAt: string,                    // ISO 8601
  commands: Array<{
    name: string,                         // e.g. "agent list" (includes parent prefix for subcommands)
    parent?: string,                      // e.g. "agent" — derived from nested .command()
    alias?: string,
    description: string,                  // from .description()
    options: Array<{
      flag: string,                       // e.g. "--status <status>" or "-f, --force"
      description: string,
      required: boolean,                  // from .requiredOption() vs .option()
      defaultValue?: string | boolean,    // from .option(flag, desc, default)
    }>,
    sourceFile: string                    // e.g. "src/cli/commands/agent.ts"
  }>
}
```

**Edge cases the generator handles:**

| Case | Behavior |
|---|---|
| `registerXxx` not found in file | Skip with warning to stderr |
| No `.command()` call in `registerXxx` | Skip with warning |
| Multiple `.command()` chains in one file | Emit one entry per chain |
| Nested `.command()` for subcommands | Walk into the chain, prepend parent name with space |
| Dynamic strings (template literals with variables) | Use AST-level evaluation where possible; otherwise emit placeholder + warning |
| `.requiredOption()` vs `.option()` | Differentiate `required: true/false` |
| Aliases set via `.alias()` | Capture into `alias` field |
| Hidden commands (`.hidden()`) | Filter out |
| Default commander commands (`--help`, `--version`) | Filter out |

## 5. Generator script

**File:** `scripts/extract-commands.ts`

**Algorithm:**

1. Glob `src/cli/commands/*.ts` (depth 1).
2. For each file, read + parse with `ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true)`.
3. Find the exported function matching `/^register[A-Z]/`.
4. Walk its body looking for a top-level expression statement of the form `program.command("name")...`.
5. Walk the chain (left-to-right), tracking:
   - `.command(name)` → start of a command; record name
   - `.alias(alias)` → record alias
   - `.description(desc)` → record description
   - `.option(flag, desc, default?)` or `.requiredOption(flag, desc, default?)` → record option
   - `.action(fn)` → end of command
   - Nested `.command(name)` after `.command(parent)` → emit a subcommand
6. Build the entry, push to results.
7. After processing all files, write JSON.

**Output:** `shared/commands.json` (formatted with 2-space indent, trailing newline).

**CLI args:**

- `bun run scripts/extract-commands.ts` → writes `shared/commands.json`
- `bun run scripts/extract-commands.ts --check` → writes to temp file, compares the `commands[]` array (ignoring `generatedAt`) against the committed version, exits 1 on drift, 0 on match
- `bun run scripts/extract-commands.ts --stdout` → writes JSON to stdout (used by the test suite to capture output without touching disk)

**Test coverage** (`scripts/__tests__/extract-commands.test.ts`):

- 3-4 golden files under `scripts/__tests__/fixtures/commands/`, each a representative command file (simple, with options, with subcommands, with alias).
- Test asserts: (a) generator output for the fixture matches the stored golden JSON, (b) `--check` exits 1 on a modified source, (c) unknown patterns produce a warning to stderr but don't crash.
- Tests are deterministic — no timestamps in golden files. The `generatedAt` field is checked separately with a regex.

## 6. Frontend data layer

### 6.1 Dashboard — `dashboard/src/data/commandGroups.ts` (NEW)

```ts
import commandsJson from "../../../shared/commands.json"

export interface CommandGroup {
  name: string       // group key, e.g. "agent", "memory"
  icon: string       // single-char glyph
  tags: string[]     // for filter chips
  commands: CommandDef[]
}

export interface CommandDef {
  name: string
  sub?: string
  desc: string
  usage: string
  options?: { flag: string; desc: string }[]
}

export const commandGroups: CommandGroup[] = [
  { name: "agent", icon: "⬡", tags: ["agent", "process"], commands: /* derived from commandsJson */ },
  // ... one entry per command family
]
```

**Derivation rule:** commands are grouped by their top-level name (the part before the first space, or the name itself if no space). Each group gets a hand-picked icon and tag set. Command `desc`, `usage`, and `options` come from the JSON.

**Group count:** the new array will have one entry per top-level command family in the generated JSON (expected ~15-20 groups, exact count discovered by running the generator in step 2 of the migration plan).

### 6.2 Website — `website/src/data/docTopics.ts` (NEW)

```ts
import commandsJson from "../../../shared/commands.json"

export interface DocTopic {
  id: string                                // e.g. "agent"
  label: string                             // e.g. "Agent system"
  navGroup: string                          // matches website's navGroup.label
  description: string
  codeLines: { tone: "comment" | "default" | "blank"; text: string }[]
  tableRows: { name: string; type: string; desc: string }[]
  sourceCommands: string[]                 // names from commandsJson used to build tableRows
}
```

**Marketing copy** (description, codeLines) is fully hand-written — this is the curated layer. The generator does *not* produce marketing copy.

**Imports:** `DocsSection.tsx` is rewritten to import `docTopics` from this file plus a hand-maintained `navGroups` array (topic groupings for the sidebar). The existing `docContent` object is replaced.

## 7. File-by-file changes

| File | Change |
|---|---|
| `scripts/extract-commands.ts` | **NEW** ~150 lines. TS Compiler API parser per §5. |
| `scripts/__tests__/extract-commands.test.ts` | **NEW** ~80 lines. Golden-file tests per §5. |
| `scripts/__tests__/fixtures/commands/*.ts` | **NEW** 3-4 representative command files. |
| `shared/commands.json` | **NEW** generated output, committed. |
| `package.json` | Add scripts: `docs:generate`, `docs:check`. Add `pretest`: `bun run docs:check`. Add `prebuild`: `bun run docs:generate`. |
| `dashboard/src/data/commandGroups.ts` | **NEW** imports JSON, adds icons + tags. |
| `dashboard/src/routes/Docs.tsx` | Delete the hardcoded `commandGroups` array; import from new data file. |
| `website/src/data/docTopics.ts` | **NEW** imports JSON, adds marketing copy. |
| `website/src/sections/DocsSection.tsx` | Delete the hardcoded `docContent` and `navGroups` arrays; import from new data file. |
| `CHANGELOG.md` | Add a "Docs" entry under unreleased. |

**No source code changes** in `src/cli/commands/`. No changes to `docs/modes-and-commands.md` or `docs/tui-cheatsheet.md`.

## 8. Build wiring

```jsonc
// package.json (root)
"scripts": {
  "docs:generate": "bun run scripts/extract-commands.ts",
  "docs:check":    "bun run scripts/extract-commands.ts --check",
  "prebuild":      "bun run docs:generate",
  "pretest":       "bun run docs:check"
  // ... existing scripts preserved
}
```

- **`docs:generate`** — writes `shared/commands.json` from current source.
- **`docs:check`** — regenerates to a temp path, diffs against the committed file, exits 1 on drift. This is what `pretest` runs so CI catches a CLI change that wasn't followed by a doc regen.
- **`prebuild`** — keeps prod builds fresh.
- **`pretest`** — runs `docs:check` so the test suite is a hard gate on drift.

**Idempotency:** the generator sorts entries by `name` and emits deterministic JSON for the `commands[]` array. The `generatedAt` field is written on every run but is excluded from `docs:check` comparisons (see §5 and §9).

## 9. Risks and open questions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TS Compiler API output is non-deterministic (whitespace, source-map noise) | Medium | Diff in `docs:check` for no real change | Use `ts.createSourceFile` with `setParentNodes: false` and walk only what we need; emit JSON via `JSON.stringify(parsed, null, 2)`. Sort the commands array. |
| `generatedAt` field changes on every run | High | `docs:check` always fails | The `--check` mode compares only the `commands[]` array, not the `generatedAt` field. Documented in §5. |
| Some CLI files use commander patterns we don't recognize (e.g. dynamic subcommand names) | Low | That command won't appear in the UI | Skip with a clear stderr warning. Add a `--strict` flag later if the user wants to fail the build on unparsed commands. |
| Adding `pretest` could slow the existing test suite by ~50ms (one extra script invocation) | Low | CI time | Acceptable. Could optimize to in-process check later. |
| `shared/commands.json` is committed but feels redundant with the generator | Low | Confusion | Add a header comment to the file: `// Generated by scripts/extract-commands.ts — do not edit. Run \`bun run docs:generate\`.` |
| Bun + TypeScript Compiler API version mismatch | Low | Generator crashes at runtime | Pin `typescript` version, test on a representative CI image. |
| Marketing copy on the website drifts from the actual CLI | High (over time) | Stale docs page | Out of scope for this spec. Future spec could add a CI check that flags doc topics whose `sourceCommands` reference no longer exist in the JSON. |

## 10. Migration plan (implementation order)

1. Read `node_modules/typescript/package.json` to confirm the bundled Compiler API version.
2. Write `scripts/extract-commands.ts` with the algorithm in §5. Run it manually against the current `src/cli/commands/`. Inspect output: should have 43 entries. Tweak until clean.
3. Add `shared/commands.json` to git, with the header comment.
4. Write `scripts/__tests__/extract-commands.test.ts` with 3-4 fixtures. Confirm tests pass.
5. Add `package.json` scripts: `docs:generate`, `docs:check`, `pretest`, `prebuild`. Run `bun run docs:check` to confirm idempotency.
6. Create `dashboard/src/data/commandGroups.ts` — import JSON, add icons + tags for all 25 groups.
7. Update `dashboard/src/routes/Docs.tsx` to import from the new data file. Delete the old hardcoded array.
8. Run `bun run --cwd dashboard test` and `bun run --cwd dashboard typecheck`. Both must be green.
9. Create `website/src/data/docTopics.ts` — import JSON, write marketing copy for the 12-15 topics that match the current sidebar groupings.
10. Update `website/src/sections/DocsSection.tsx` to import from the new data file. Delete the old hardcoded arrays.
11. Run `bun run --cwd website build` and `bun run --cwd website typecheck`. Both must be green.
12. Visually verify both pages in a browser.
13. Update `CHANGELOG.md` with a "Docs" entry under unreleased.
14. Commit. Push branch. Open PR.

## 11. Out of scope (deferred to future specs)

- Live API endpoint exposing command metadata (e.g. `GET /api/v1/commands`).
- Auto-generating the marketing copy / code samples for the website.
- A CI check that flags doc topics whose `sourceCommands` reference no longer exists.
- Refreshing `docs/modes-and-commands.md` or `docs/tui-cheatsheet.md` (already accurate).
- Translating the generator to handle every conceivable commander.js pattern (we accept "skip with warning" for non-standard cases).
- A `--strict` mode that fails the build on unparsed commands.

## 12. Verification

Before claiming done, run all of the following and confirm green output:

```bash
bun run typecheck                                    # 0 errors
bun run test                                         # all suites green, including new generator tests
bun run docs:check                                   # exits 0
bun run --cwd dashboard test                         # 0 failures
bun run --cwd dashboard typecheck                    # 0 errors
bun run --cwd website typecheck                      # 0 errors
bun run --cwd website build                          # 0 errors
```

Smoke test (manual):

1. `bun run docs:generate` — produces `shared/commands.json` with 43 entries.
2. `bun run docs:check` — exits 0.
3. Manually edit `src/cli/commands/agent.ts` to add `--foo <bar>` to `agent list`. Run `bun run docs:check` — exits 1 with a clear diff. Revert, run again — exits 0.
4. Open `http://localhost:<dashboard-dev-port>/docs` in a browser. Verify all 43 commands are present with correct names, aliases, options.
5. Open the website in a browser. Verify the DocsSection shows curated topics with accurate command snippets.
