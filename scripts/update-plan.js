const fs = require("fs")

const path = "docs/harness-engineering-plan.md"
let content = fs.readFileSync(path, "utf8")
let changes = 0

// 1. Fix dependency graph: P6 parallel with P4 (already done by previous run)
// Check if already done by looking for "parallel with P4"
if (content.includes("parallel with P4")) {
  console.log("✅ P11 dependency graph already updated")
  changes++
} else {
  console.log("ℹ️ Need to check P11 dependency graph later")
}

// 2. Fix Appendix A: Add new P1 files after sandbox.ts
const oldP1Files = `├── sandbox.ts                           # NEW: Sandbox management`

const newP1Files = `├── sandbox.ts                           # NEW: Sandbox management
├── budget-controller.ts                 # NEW: Cost-aware eval budgeting (P1)
├── fixtures.ts                          # NEW: Test data factory (P1)
├── sandbox-policy.ts                    # NEW: Security sandbox policies (P1)
├── flaky-manager.ts                     # NEW: Flaky test management (P1)`

if (content.includes(oldP1Files)) {
  content = content.replace(oldP1Files, newP1Files)
  console.log("✅ P1 files added to Appendix A")
  changes++
} else {
  console.log("❌ P1 file list NOT FOUND")
}

// 3. Add new P4 files after ci-gate.ts
const oldP4Files = `├── ci-gate.ts                           # NEW: CI integration (P4)`

const newP4Files = `├── ci-gate.ts                           # NEW: CI integration (P4)
├── experiment.ts                        # NEW: Experiment tracking (P6.5)
├── hitl-review.ts                       # NEW: HITL review workflow (P6.6)`

if (content.includes(oldP4Files)) {
  content = content.replace(oldP4Files, newP4Files)
  console.log("✅ P4 files added to Appendix A")
  changes++
} else {
  console.log("❌ P4 file list NOT FOUND")
}

// 4. Add model-registry.ts to Appendix A (after distributed-runner.ts)
const oldLastHarnessFile = `├── distributed-runner.ts                # NEW: Distributed execution (P3)`

const newLastHarnessFile = `├── distributed-runner.ts                # NEW: Distributed execution (P3)
├── model-registry.ts                    # NEW: Model registry (Appendix D)`

if (content.includes(oldLastHarnessFile)) {
  content = content.replace(oldLastHarnessFile, newLastHarnessFile)
  console.log("✅ model-registry.ts added to Appendix A")
  changes++
} else {
  console.log("❌ Last harness file NOT FOUND")
}

// 5. Add Appendices D and E after the ending paragraph
const oldEnding = `---

*This plan was generated from research across Cursor, OpenAI, Anthropic, LangChain, NeurIPS 2025, and industry best practices for agent evaluation harnesses. All phases are designed to leverage existing Aegis infrastructure in \`src/distributed/\`, \`src/observability/\`, \`src/improve/\`, \`src/experience/\`, and \`src/sandbox/\`.*

*Total estimated implementation effort: ~8-9 weeks for a focused team. Golden dataset curation is an ongoing effort that continues beyond the initial 8-week period.*`

// Check if Appendices D/E already exist
if (content.includes("Appendix D: Model Registry")) {
  console.log("✅ Appendices D and E already exist")
  changes++
} else {
  const appendixD = `

## Appendix D: Model Registry Integration

> **Issue:** The plan references models by name strings ("claude-sonnet-4-6", "gpt-4o") but doesn't specify how models are registered, discovered, versioned, or compared across runs.

**File: \`src/harness/model-registry.ts\`** — NEW

\`\`\`typescript
interface ModelDefinition {
  id: string                          // Canonical ID (e.g. "claude-sonnet-4-6")
  provider: "anthropic" | "openai" | "deepseek" | "ollama" | "custom"
  displayName: string
  capabilities: string[]              // e.g. ["code", "vision", "json-mode", "tools"]
  maxTokens: number
  costPer1kInput: number              // USD
  costPer1kOutput: number             // USD
  contextWindow: number
  supportsStreaming: boolean
  supportsToolUse: boolean
  defaultConfig?: Record<string, unknown>
  aliases?: string[]                  // e.g. ["claude-sonnet", "sonnet"]
  tags?: string[]                     // e.g. ["fast", "cheap", "best-quality"]
}

interface ModelRegistryConfig {
  modelsDir: string                   // Default: .aegis/models/
  defaultModel: string
  fallbackChain: string[]             // e.g. ["claude-sonnet-4-6", "gpt-4o", "deepseek-v3"]
}

class ModelRegistry {
  private models: Map<string, ModelDefinition> = new Map()

  register(model: ModelDefinition): void
  get(id: string): ModelDefinition
  resolve(alias: string): ModelDefinition
  list(filters?: { provider?: string; capability?: string; tag?: string }): ModelDefinition[]
  compareCost(modelA: string, modelB: string, tokens: { input: number; output: number }): CostComparison

  getDefaultForTest(test: TestCase): ModelDefinition {
    const preferred = test.model ?? this.config.defaultModel
    return this.get(preferred)
  }

  selectForBudget(budget: number, requiredCapabilities: string[]): ModelDefinition {
    return this.models
      .filter(m => requiredCapabilities.every(c => m.capabilities.includes(c)))
      .filter(m => m.costPer1kInput * 1000 <= budget)
      .sort((a, b) => a.costPer1kInput - b.costPer1kInput)[0]
  }
}
\`\`\`

**Integration with experiment tracking:**
- Each experiment snapshots the model registry state (not just the model name)
- When comparing experiments, show model-level deltas
- Automatically detect model version changes between runs

**CLI commands:**
\`\`\`bash
aegis model list                              # List all registered models
aegis model list --capability=code             # Filter by capability
aegis model diff <model-a> <model-b>           # Compare cost/capabilities
aegis model compare --suite=full-suite          # Run same suite across models
aegis model registry import                    # Import from config file
\`\`\`

---

## Appendix E: Review Findings & Improvements

This appendix documents the 10 gaps identified during the review of the initial plan, along with their resolution status.

| # | Improvement | Priority | Status | Location |
|---|-------------|----------|--------|----------|
| 1 | Cost-aware evaluation budgeting | High | ✅ Added | §3.6 — \`src/harness/budget-controller.ts\` |
| 2 | Test data factory / fixture system | High | ✅ Added | §3.7 — \`src/harness/fixtures.ts\` |
| 3 | Security & sandboxing policy | Medium | ✅ Added | §3.8 — \`src/harness/sandbox-policy.ts\` |
| 4 | Migration strategy from old harness | Medium | ✅ Added | §3.9 — Migration plan + backward compat |
| 5 | Flaky test management | High | ✅ Added | §3.10 — \`src/harness/flaky-manager.ts\` |
| 6 | Experiment tracking & versioning | High | ✅ Added | §6.5 — \`src/harness/experiment.ts\` |
| 7 | Human-in-the-loop review workflow | Medium | ✅ Added | §6.6 — \`src/harness/hitl-review.ts\` |
| 8 | Model registry integration | Medium | ✅ Added | §Appendix D — \`src/harness/model-registry.ts\` |
| 9 | Dependency graph optimization (P6 parallel with P4) | Medium | ✅ Added | §11 — Dependency graph updated |
| 10 | Phase 1 scope extension (1→2 weeks) | Low | ✅ Added | §3.6-3.10 — Extended Phase 1 scope |

### Key Design Decisions from Review

| Decision | Rationale |
|----------|-----------|
| **Budget-controlled eval tiers** | Eval runs could cost $10+. Budget controller with tiered model selection prevents runaway costs. |
| **Silver→Gold pipeline for fixtures** | Fixture templates follow the same quality methodology as the golden dataset. |
| **Auto-quarantine flaky tests** | Agent tests are inherently non-deterministic. Auto-quarantine prevents flaky tests from eroding trust. |
| **Experiment as first-class concept** | Without experiments, you can't answer \\"what changed between run A and run B?\\" or reproduce configs. |
| **P6 parallel with P4** | Self-improvement only needs grader engine, not CI/CD. Saves ~2 weeks on timeline. |
| **Model registry as separate concern** | Model selection is a cross-cutting concern across evals, experiments, and production. Dedicated registry avoids coupling. |`

  if (content.includes(oldEnding)) {
    content = content.replace(oldEnding, appendixD + "\n\n" + oldEnding)
    console.log("✅ Appendices D and E added")
    changes++
  } else {
    console.log("❌ File ending NOT FOUND - checking for partial match")
    const idx = content.indexOf("This plan was generated from research")
    if (idx >= 0) {
      // The exact ending text might be different. Let's just append after line 3248
      const lines = content.split("\n")
      // Find the line with "Total estimated implementation effort"
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Total estimated implementation effort")) {
          // Append appendices before this line
          const beforeStuff = appendixD + "\n\n" + lines[i]
          lines[i] = beforeStuff
          content = lines.join("\n")
          console.log("✅ Appendices D and E added via line replacement")
          changes++
          break
        }
      }
    } else {
      console.log("❌ Could not find ending at all")
    }
  }
}

// 6. Update total counts in Appendix A (line 3240ish)
const oldTotal = `| **Total** | **~192** | **~9** | **~26** |`
const newTotal = `| **Total** | **~197** | **~9** | **~26** |`

if (content.includes(oldTotal)) {
  content = content.replace(oldTotal, newTotal)
  console.log("✅ Total counts updated")
  changes++
} else {
  console.log("ℹ️ Total counts already updated or different format")
}

fs.writeFileSync(path, content, "utf8")
console.log(`\n✅ Done! ${changes} changes applied.`)
