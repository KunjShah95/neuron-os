---
name: code-review
description: Structured code review workflow for pull requests and individual files
tags: [review, quality, security, audit]
---

# Code Review

## Process

1. **Understand context**: Read the file to understand its purpose and how it fits in the codebase.
2. **Check for bugs**: Logic errors, edge cases, null safety, race conditions.
3. **Check for security**: Injection, XSS, path traversal, secrets exposure, insufficient validation.
4. **Check for quality**: Duplication, complexity, naming, error handling, test coverage.
5. **Check for patterns**: Does it follow the project's established conventions?

## Output Format

```

### file:path/to/file.ts:line
- Severity: critical|major|minor
- Issue: <description>
- Suggestion: <how to fix>

```

## Rules

- One file:line per issue
- Always include severity
- Suggest a fix, don't just report
- Skip style nits unless they affect readability
- flag unused imports, dead code, console.log in production
