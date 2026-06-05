---
title: Contributing
description: How to contribute to Aegis — setup, code style, commits, PRs, and testing
---

# Contributing to Aegis (Neuron OS)

Thank you for considering contributing to Aegis. This document explains how to set up a development environment, the expected workflow for changes, and conventions for code, commits, and PRs.

## Getting started

1. Fork the repository and clone your fork:

```bash
git clone git@github.com:KunjShah95/neuron-os.git
cd "neuron os"
bun install
```

2. Create a branch for your work:

```bash
git checkout -b feature/short-description
```

3. Run the typechecker and tests locally before pushing:

```bash
bun run tsc --noEmit
bun run scripts/run-tests.ts
```

## Code style

- **TypeScript**: follow `tsconfig.json` (strict) and prefer explicit types for public APIs.
- **Formatting**: the project uses Prettier. Run `bun run prettier --write .` before committing.
- **Linting**: keep lint warnings to a minimum and fix new lint errors.

## Commit messages

Use concise, imperative-style commit messages with Conventional Commit prefixes:

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `style:` — formatting, no code change
- `refactor:` — code change that neither fixes bug nor adds feature
- `test:` — adding or updating tests
- `chore:` — maintenance tasks

Example:

```
feat(agent): add graceful shutdown to AgentManager

Add unit tests for shutdown sequence and update README with new command.
```

## Branches & PRs

- Keep changes small and focused — one logical change per PR.
- Rebase onto the latest `main` before opening the PR.
- Include unit tests for new behavior.
- Update relevant documentation (`docs/`, `README.md`).
- Describe the change, motivation, and testing steps in the PR description.

## Review process

- Assign reviewers with appropriate domain knowledge (agent, TUI, chat, etc.).
- Address requested changes promptly and keep the PR updated.

## Tests

- Unit and integration tests should be deterministic and runnable locally.
- When adding features, include tests to validate critical behaviors (spawn/recover, IPC messages, TUI rendering logic where feasible).

## Security & responsible disclosure

- Do not include secrets, API keys, or credentials in your changes.
- If you discover a security issue, open a private issue tagged `security` so maintainers can triage privately.
- See [SECURITY.md](/security) for our full disclosure policy.

---

Thanks for contributing — we look forward to your patch! If you'd like, open an issue first to discuss larger changes.
