---
name: git-commit
description: Generate conventional commit messages from staged changes
tags: [git, commit, vcs]
---

# Commit Message Generation

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Types

- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `test` — adding or updating tests
- `chore` — build, CI, dependencies
- `style` — formatting, linting (no production change)
- `perf` — performance improvement

## Rules

- Subject: imperative mood, no period, max 72 chars
- Body: explain WHAT and WHY (not HOW)
- Footer: `BREAKING CHANGE:` or issue references
- Scope is optional — use the module/directory name

## Workflow

1. Run `git diff --cached` to see staged changes
2. Categorize the change by type
3. Write a concise subject line
4. Add body details if the change is non-trivial
5. Suggest the exact commit command
