# Contributing to Neuron OS (Aegis)

Thank you for considering contributing to Aegis. This document explains how to set up a development environment, the expected workflow for changes, and conventions for code, commits, and PRs.

## Getting Started

1. Fork the repository and clone your fork:

```bash
git clone git@github.com:KunjShah95/neuron-os.git
cd "neuron os"
bun install
```

2. Create a `.env` file with at least one provider key:

```env
OPENAI_API_KEY=sk-...
```

3. Create a branch for your work:

```bash
git checkout -b feature/short-description
```

4. Run the typechecker, linters, and tests locally before pushing:

```bash
npm run typecheck
npm run lint
bun test
```

## Dev Setup

### Prerequisites

- **Bun** >= 1.0 (required runtime)
- **Node.js** >= 18 (for compatibility checks)
- **Docker** (optional, for container-isolated agents)

### Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run index.ts` | Launch TUI dashboard |
| `npm run typecheck` | TypeScript type checks |
| `npm run lint` | ESLint |
| `bun test` | Run all tests |
| `bun test <file>` | Run a single test file |
| `npm run coverage` | Generate coverage report |
| `npm run format` | Format with Prettier |

### Test Patterns

- Use `{ dbPath? }` option to make SQLite stores testable (temp dir)
- Use `makeMutation()` helper for creating test mutations with default values
- Dream/Evolution engines create internal stores — pass partial config via constructor
- Tests should be deterministic and runnable locally

## Code Conventions

### TypeScript

- Strict mode (`tsconfig.json` strict settings)
- Prefer explicit types for public APIs
- No comments in source code (unless requested)
- Use Zod schemas for API validation

### File Naming

- `kebab-case` for file names: `agent-manager.ts`
- `camelCase` for variables and functions: `agentManager`
- `PascalCase` for classes and types: `AgentManager`
- `UPPER_SNAKE_CASE` for constants: `DEFAULT_CONFIG`
- Index files (`index.ts`) re-export the public API of each module

### Import Style

```typescript
// External imports first
import { z } from "zod"

// Then internal imports
import { createLogger } from "../cli/logger"
import type { AgentInstance } from "./types"
```

### SQLite Stores

- Use WAL mode for concurrent reads
- Use `{ dbPath? }` constructor option for testability
- IDs: `id: "prefix-" + Date.now().toString(36)`

## PR Workflow

### Branch Naming

- `feature/short-description` — new features
- `fix/short-description` — bug fixes
- `docs/short-description` — documentation only
- `refactor/short-description` — code restructuring

### Commit Messages

Use Conventional Commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

Examples:

```
feat(agent): add graceful shutdown to AgentManager
fix(memory): prevent race condition in session persistence
docs(harness): add grader calibration documentation
test(dream): add counterfactual phase tests
```

### PR Checklist

- [ ] Branch rebased onto latest `main`
- [ ] Type checks pass (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Tests pass (`bun test`)
- [ ] New features include tests
- [ ] Documentation updated where relevant
- [ ] No secrets, API keys, or credentials committed
- [ ] PR description explains the change, motivation, and testing steps

### Review Process

- Assign reviewers with appropriate domain knowledge
- Address requested changes promptly
- Keep the PR updated

## How to Add New Components

### New Agent Type

1. Define the type in `src/agent/agent-types.ts`
2. Add a soul archetype mapping in `src/agent/soul.ts`
3. Create the agent implementation in `src/agent/spec/<type>.ts`
4. Register it in the agent types map
5. Add tests in `src/agent/engine.test.ts`

### New Adapter (Platform)

1. Create a new directory in `src/adapters/<platform>/`
2. Implement the adapter interface (see existing adapters for patterns)
3. Register in the adapter registry
4. Add configuration schema

### New Tool

1. Create `skills/<tool-name>/SOUL.md` with instructions
2. Implement the tool logic in `src/tools/` if it needs runtime code
3. Register in the tool registry
4. Add tests

### New Skill

1. Create `skills/<skill-name>/SKILL.md`
2. Define trigger phrases in the skill metadata
3. Register in `src/skills/registry.ts`
4. Test with `bun run index.ts skills run <skill-name>`

### New Module

1. Create `src/<module>/index.ts` (public API)
2. Create `src/<module>/types.ts` (type definitions)
3. Create `src/<module>/engine.ts` (main logic)
4. Add tests in `src/<module>/*.test.ts`
5. Export from the module index

## Security

- Never include secrets, API keys, or credentials in changes
- Use the vault system (`src/vault/`) for credential storage
- All plugin code is Ed25519-signed before installation
- Report security issues privately via GitHub issues tagged `security`

---

Thanks for contributing — we look forward to your patch! If you'd like, open an issue first to discuss larger changes.
