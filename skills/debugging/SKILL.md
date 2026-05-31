---
name: debugging
description: Systematic debugging workflow for isolating and fixing bugs
tags: [debug, fix, troubleshoot]
---

# Systematic Debugging

## Process

1. **Reproduce**: Get a reliable reproduction. Note the exact command/input and output/error.
2. **Isolate**: Narrow down the bug to the smallest possible scope. Binary search through code.
3. **Diagnose**: Read the relevant code. What should happen vs what actually happens?
4. **Hypothesis**: Form a hypothesis about the root cause.
5. **Fix**: Apply the minimal fix that addresses the root cause.
6. **Verify**: Run the reproduction case to confirm the fix works.
7. **Regression**: Run related tests to ensure nothing is broken.

## Tools

- Use `bash` to run the failing command
- Use `grep` to find related code
- Use `read` to examine suspicious files
- Use `edit` to apply the fix

## State Tracking

Maintain state across debugging steps:

```

## Step N: <current step>

### Hypothesis
<what I think is wrong>

### Evidence
<what I found>

### Action
<what I'm doing next>

```
