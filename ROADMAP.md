# Aegis (Neuron OS) Roadmap

This roadmap outlines planned features, milestones, and priorities for the Aegis project. It is intended as a living document — items may be re-prioritized based on user feedback and maintainers' capacity.

## Vision (long-term)

Build a local-first, extensible platform for running autonomous AI agents with a robust developer experience (TUI, programmatic APIs, and CI/CD integration) for safe experimentation, reproducible workflows, and production-grade automation.

## Near-term (0–3 months)

- Stabilize core agent lifecycle (spawn, heartbeat, graceful shutdown, auto-recovery)
- Harden TUI dashboard and chat rendering (accessibility, window-resize behavior)
- Add comprehensive unit and integration tests for AgentManager and IPC
- Provide official `CONTRIBUTING.md` and basic CI pipelines (typecheck, lint, tests)
- Improve provider abstraction for Anthropic/OpenAI/Ollama (pluggable providers)

## Mid-term (3–9 months)

- Plugins & skill marketplace (pluggable tools and community skills)
- Persistent session store and UI for replaying agent traces
- Remote management API (HTTP) with authentication for headless deployments
- First-class packaging/publishing for worker images and prebuilt bundles
- UI improvements: pane resizing, filterable activity logs, agent tagging

## Long-term (9+ months)

- Multi-host orchestration (run agents across multiple machines/VMs)
- Built-in policy engine and sandboxing for untrusted code execution
- Managed discovery & scheduling with capacity-aware placement
- Integrations: GitHub, Slack, Jira, and cloud builders (Azure, GCP, AWS)

## Milestones

1. v0.2.0 — Stability & tests
   - Complete unit/integration coverage for core modules
   - CI gating on PRs, stable release artifacts

2. v0.5.0 — Plugin system
   - Plugins API, simple registry, and sample plugins (lint, format, deploy)

3. v1.0.0 — Production-ready
   - Remote API, RBAC, audit logging, hardened runtimes

## How to contribute to the roadmap

- Open issues labeled `roadmap` with feature proposals and user scenarios.
- For larger efforts, open a discussion or RFC-style issue and propose a design.
