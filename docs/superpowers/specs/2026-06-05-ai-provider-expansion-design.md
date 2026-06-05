# AI Provider Expansion — Design Spec

**Date:** 2026-06-05
**Status:** Draft
**Sprint:** Sub-project A of the 4-scope "provider systems" brainstorm
**Scope:** Add 4 new AI/LLM providers (xAI, Perplexity, Cohere, AWS Bedrock), refactor the OpenAI-compatible boilerplate into a helper, add tests, and update docs.

## Context

The user requested work on "adding multiple providers to the systems." After decomposing the 4 possible interpretations (AI, channel, tool, storage providers), the user picked **AI/LLM provider expansion** as the first sub-project. The other three (channel gateway, tool providers, storage/vector) become future specs.

A prior commit (`f6a7137` — "feat: add Mistral, Azure OpenAI, and Together AI providers") already shipped 3 of the originally-provisioned 7 providers. The current state is:

- **11 providers implemented:** `anthropic`, `openai`, `deepseek`, `ollama`, `custom`, `gemini`, `groq`, `openrouter`, `mistral`, `azure`, `togetherai`
- **Type, models, factory, env-key, base-URL, and setup-wizard entries** all in place for those 11
- **No tests** for the provider layer
- **No helper** — `providers.ts` is a flat sequence of 11 near-identical `registerProvider(...)` calls
- **`.env.example`** lists the keys but not Azure or Together yet (line 33-39)
- **Bedrock is missing from the doc table** as a result

This spec completes the work by adding 4 more providers and the supporting test/helper/docs infrastructure.

## 1. Goals

1. Add **4 new providers**: xAI (Grok), Perplexity, Cohere, AWS Bedrock — wired into type, model catalog, factory registry, env map, setup wizard, setup-keys wizard (with `testKey` functions), and `.env.example`.
2. **Refactor `src/ai/providers.ts`** to a `registerOpenAICompatible({ name, baseUrl })` helper that replaces the 6 existing OpenAI-compatible blocks (deepseek, ollama, gemini, groq, openrouter, togetherai) and absorbs the 2 new ones (xai, perplexity). Special-case providers (`openai`, `anthropic`, `mistral`, `azure`, `cohere`, `bedrock`, `custom`) keep their own factories.
3. **Build a `BedrockAdapter`** that implements the Vercel AI SDK's `LanguageModel` interface on top of AWS Bedrock's `Converse` / `ConverseStream` APIs.
4. **Add test coverage** for the provider registry, env-key resolution, base-URL resolution, model catalog, and the Bedrock adapter (mocked, no live network).
5. **Update docs** — README env-var table, new `docs/providers.md` provider reference, CHANGELOG.

## 2. Non-Goals (v1)

- Vision / image inputs for any provider (Bedrock supports it; out of scope for the AI SDK adapter in v1).
- Bedrock prompt caching (`cachePoint` blocks).
- Bedrock extended thinking (Anthropic-specific on Bedrock).
- Streaming tool-use deltas from Bedrock (we consume `contentBlockStop` and parse the final tool input).
- Per-provider cost tracking (covered by `docs/superpowers/specs/2026-06-05-cost-attribution-design.md`).
- Migrating `src/chat/provider.ts` env chain (currently hardcoded list of 8 env var names) to use `resolveApiKey` — out of scope; the chat path has its own precedence rules and changing it risks regressions. The new env keys are added to `chat/provider.ts:30-38` but the refactor is deferred.
- Removing or renaming any existing provider.
- Changing the dashboard's provider UI (it already iterates `listProviders()` and `MODEL_REFERENCES`).

## 3. Architecture

```
    ┌────────────────────────┐
    │ LLM call sites         │
    │ (agent/engine.ts,      │
    │  chat/provider.ts, …)  │
    └─────────┬──────────────┘
              │ provider / model
              ▼
    ┌────────────────────────────────┐
    │ src/ai/provider.ts             │
    │ AIProviderManager              │
    │   ↓ getModel()                 │
    │   registry.get(name)(config)   │
    └─────────┬──────────────────────┘
              │
              ▼
    ┌────────────────────────────────────────────┐
    │ src/ai/providers.ts                        │
    │ Map<name, ProviderFactory>                 │
    │   ├─ registerOpenAICompatible() helper     │ ← NEW: 8 entries use this
    │   │  (6 existing + xai + perplexity)       │
    │   ├─ openai / anthropic / mistral /        │   (native SDK packages)
    │   │  azure / cohere / custom               │
    │   └─ bedrock → BedrockAdapter              │ ← NEW
    └─────────┬──────────────────────────────────┘
              │
              ▼
    ┌────────────────────────────────────────────┐
    │ src/ai/bedrock-adapter.ts        (NEW)     │
    │ createBedrockModel(config): LanguageModel │
    │   → @aws-sdk/client-bedrock-runtime       │
    │      Converse / ConverseStream             │
    └────────────────────────────────────────────┘
```

The `registerOpenAICompatible` helper consolidates the OpenAI-compatible block:

```ts
function registerOpenAICompatible(args: {
  name: string
  baseUrl: string
}): void
```

The factory it installs is equivalent to the existing per-provider blocks (passes `apiKey` and `baseURL` to `createOpenAI`, calls `.chat(model)`). The API key is read from `cfg.apiKey` at call time — same as today — so the helper does not need an `envKey` parameter. No behavior change.

## 4. Provider list and categorization

### 4.1 OpenAI-compatible (2 new + refactored existing 6 = 8 total use the helper)

| Provider | Env var | Base URL | Default models |
|----------|---------|----------|----------------|
| xAI (Grok) | `XAI_API_KEY` | `https://api.x.ai/v1` | `grok-2-latest`, `grok-2-mini`, `grok-vision-beta`, `grok-beta` |
| Perplexity | `PERPLEXITY_API_KEY` | `https://api.perplexity.ai` | `sonar-pro`, `sonar`, `sonar-reasoning-pro` |
| (existing) deepseek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | (unchanged) |
| (existing) ollama | (none — uses base URL) | `http://localhost:11434/v1` | (unchanged) |
| (existing) gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta/openai` | (unchanged) |
| (existing) groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | (unchanged) |
| (existing) openrouter | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | (unchanged) |
| (existing) togetherai | `TOGETHERAI_API_KEY` | `https://api.together.ai/v1` | (unchanged) |

All 8 use the new helper. **Net line delta in `providers.ts`:** helper function adds ~10 lines, the 6 refactored entries shrink by ~3 lines each (−18), the 2 new entries add ~5 lines each (+10), the 1 new cohere native factory adds ~5 lines, the 1 new bedrock factory adds ~3 lines (delegating to the adapter). **Net: roughly −10 lines** in `providers.ts` despite 4 new providers being added.

### 4.2 Native SDK (1 new + 4 existing stay as-is)

| Provider | Dep | Factory shape |
|----------|-----|---------------|
| (existing) openai | `@ai-sdk/openai` | `createOpenAI({...}).chat(model)` — kept verbatim because it's the canonical native factory |
| (existing) anthropic | `@ai-sdk/anthropic` | `createAnthropic({...})(model)` |
| (existing) mistral | `@ai-sdk/mistral` | `createMistral({...})(model)` |
| (existing) azure | `@ai-sdk/azure` | `createAzure({ apiKey, baseURL })(model)` |
| **Cohere (new)** | `@ai-sdk/cohere` | `createCohere({ apiKey, baseURL })(model)` |

### 4.3 Custom adapter (1 new)

| Provider | Dep | Why special |
|----------|-----|-------------|
| **AWS Bedrock (new)** | `@aws-sdk/client-bedrock-runtime` (new dep) | AWS sigv4, region, model IDs like `anthropic.claude-3-5-sonnet-20241022-v2:0`. Adapter wraps Bedrock `Converse` / `ConverseStream` API. See §5. |

## 5. AWS Bedrock adapter design

**File:** `src/ai/bedrock-adapter.ts` (~150-200 lines). Implements the Vercel AI SDK's `LanguageModelV2` interface (verified at implementation start by reading `ai`'s `LanguageModelV2Specification` — this is a v1 risk noted in §9).

**Public API:**

```ts
export interface BedrockAdapterConfig {
  modelId: string                  // e.g., "anthropic.claude-3-5-sonnet-20241022-v2:0"
  region?: string                  // default: AWS_REGION || AWS_BEDROCK_REGION || "us-east-1"
  apiKey?: string                  // bearer-token shortcut (uses AWS_BEDROCK_API_KEY if set)
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  temperature?: number
  maxTokens?: number
}

export function createBedrockModel(config: BedrockAdapterConfig): LanguageModel
```

**AI SDK → Bedrock translation map (doGenerate):**

| AI SDK input | Bedrock `ConverseCommand` |
|--------------|---------------------------|
| `messages: AIMessage[]` | `messages: Message[]` (content blocks) |
| System prompt | `system: SystemContentBlock[]` |
| `temperature` | `inferenceConfig.temperature` |
| `maxTokens` | `inferenceConfig.maxTokens` |
| Tool definitions | `toolConfig.tools: ToolSpecification[]` |
| Tool result message | Separate `role: "user"` message with `toolResult` content block |
| Usage tokens | Read from `response.usage.inputTokens` / `outputTokens` |

**Streaming (doStream):** `ConverseStreamCommand` returns `AsyncIterable<ConverseStreamResponse>`. Map events to AI SDK `TextStreamPart`s: `contentBlockDelta` → `text-delta`, `messageStop` + `metadata` → `finish`.

**Credential resolution:** prefers `AWS_BEDROCK_API_KEY` (bearer), falls back to standard AWS chain via `@aws-sdk/credential-provider-node`'s `defaultProvider()`. If no credentials resolve, the factory throws with a clear message.

**v1 scope cuts:** vision inputs, prompt caching, extended thinking, streaming tool-use partials (we read final tool input from `contentBlockStop`).

## 6. Environment variables and config

### 6.1 New env vars (added to `.env.example` and `resolveApiKey`)

```bash
# OpenAI-compatible (new)
XAI_API_KEY=...                 # xAI (Grok)
PERPLEXITY_API_KEY=...          # Perplexity

# Native SDK (new)
COHERE_API_KEY=...              # Cohere

# AWS Bedrock (new — uses AWS env chain)
AWS_REGION=us-east-1            # region for Bedrock client (defaults to us-east-1)
AWS_BEDROCK_API_KEY=...         # optional bearer-token shortcut
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_PROFILE — standard chain
```

The env-var naming pattern follows the existing convention: `TOGETHERAI_API_KEY`, `AZURE_OPENAI_API_KEY` — no underscore between provider and `AI_KEY` when the provider name is one compound word. So `XAI_API_KEY` (not `X_AI_API_KEY`) and `PERPLEXITY_API_KEY`.

### 6.2 `AIConfig` shape — no change

The `extra: Record<string, string>` field proposed in the brainstorm is **NOT** added in v1. The Bedrock factory reads from `process.env` directly (region, credentials), not from `AIConfig.extra`. Azure's existing factory already handles its 3-var scheme from env. Adding `extra` to `AIConfig` is a wider refactor; deferred.

`src/chat/provider.ts:30-38` — extend the `apiKey` env-var chain to include `XAI_API_KEY`, `PERPLEXITY_API_KEY`, `COHERE_API_KEY`. Bedrock uses the standard AWS env, so no chat env change is needed (the user can set `AEGIS_AI_API_KEY` to their bearer token, or the AWS env chain provides credentials).

## 7. File-by-file changes

| File | Change |
|------|--------|
| `src/ai/providers.ts` | Add `registerOpenAICompatible()` helper; replace 6 existing OpenAI-compatible blocks (deepseek, ollama, gemini, groq, openrouter, togetherai) with helper calls; add 2 new helper entries (xai, perplexity); add 1 new native entry (cohere); add 1 new bedrock entry |
| `src/ai/bedrock-adapter.ts` | **NEW** ~150-200 lines. Bedrock adapter per §5 |
| `src/ai/models.ts` | Extend `AIProviderType` union with `xai \| perplexity \| cohere \| bedrock`; add `MODEL_REFERENCES` entries; extend `getProviderBaseUrl` switch |
| `src/ai/provider.ts` | `resolveApiKey`: add `xai → XAI_API_KEY`, `perplexity → PERPLEXITY_API_KEY`, `cohere → COHERE_API_KEY`, `bedrock → AWS_BEDROCK_API_KEY` |
| `src/chat/provider.ts` | Extend apiKey env-var chain to include `XAI_API_KEY`, `PERPLEXITY_API_KEY`, `COHERE_API_KEY` |
| `src/wizard/flows/setup.ts` | Extend the provider select with 4 new options; add `providerLabel` cases; for Bedrock, prompt for region (skip base URL); Bedrock does NOT need an API key prompt (AWS chain) |
| `src/cli/commands/setup-keys.ts` | Add 4 new `ProviderConfig` entries to the `PROVIDERS` array with `testKey` functions that hit each provider's models endpoint (or for Bedrock, `ListFoundationModels`) |
| `package.json` | Add deps: `@ai-sdk/cohere`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/credential-provider-node` |
| `.env.example` | Add `XAI_API_KEY`, `PERPLEXITY_API_KEY`, `COHERE_API_KEY`, `AWS_REGION`, `AWS_BEDROCK_API_KEY`; update comment block listing providers |

### 7.1 New tests

| File | Purpose |
|------|---------|
| `src/ai/test-providers.test.ts` | Registry has 15 entries (11 existing + 4 new); each factory returns a `LanguageModel` (mocked SDK constructors); `listProviders()` returns sorted list; `resolveApiKey` returns correct env-var for each of 15 providers; `getProviderBaseUrl` returns correct URL for all 15 |
| `src/ai/test-bedrock-adapter.test.ts` | Adapter translates AI SDK `doGenerate` inputs into correct `ConverseCommand` fields (modelId, messages, inferenceConfig, system); `doStream` yields `text-delta` chunks in order from `contentBlockDelta` events; tool definitions flow through `toolConfig.tools`; AWS_BEDROCK_API_KEY env var → bearer-token auth; AWS_REGION env var → client region; throws clear error when no credentials resolvable |
| `src/chat/test-provider.test.ts` (new or extend) | `loadAIConfig()` picks up new env vars in its fallback chain |
| `scripts/run-tests.ts` | Register the 2 new test files |

**Estimated ~40-60 new test assertions.**

## 8. Setup wizard UX

### 8.1 `src/wizard/flows/setup.ts` — provider select

The current wizard lists 11 providers (per `src/wizard/flows/setup.ts:57-69`). Insert the 4 new options in this order (after Together AI, before Custom):

```
 8. Mistral AI       (existing)
 9. Azure OpenAI     (existing)
10. Together AI      (existing)
11. xAI (Grok)       ← new
12. Perplexity       ← new
13. Cohere           ← new
14. AWS Bedrock      ← new
15. Custom endpoint  (existing, last)
```

The `providerLabel()` switch and `needsApiKey()` / `needsBaseUrl()` helpers get cases for each new provider. Bedrock: `needsApiKey = false` (AWS chain), `needsBaseUrl = false` (region is enough). When the user picks Bedrock, the wizard adds an extra text prompt for region (defaulting to `us-east-1`).

### 8.2 `src/cli/commands/setup-keys.ts` — `testKey` functions

Each new provider gets a `testKey(apiKey, baseUrl?)` function that hits a public model-list endpoint:

- **xAI:** `GET https://api.x.ai/v1/models` (Bearer auth)
- **Perplexity:** `GET https://api.perplexity.ai/models` (Bearer auth; no `/v1` prefix in path)
- **Cohere:** `GET https://api.cohere.com/v1/models` (Bearer auth)
- **Bedrock:** `POST https://bedrock.{region}.amazonaws.com/foundation-models` with `ListFoundationModels` action and SigV4 signed request. Implement a small SigV4 helper in the test file (or use a stub that validates the region but skips the network call when no credentials are set). For the wizard, accept "saved without test" if the user is on a machine without AWS creds configured.

The `testKey` signature stays the same: `async (apiKey, baseUrl?) => { ok, error? }`. 10s timeout per request. Same wizard pattern as existing entries.

## 9. Risks and open questions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI SDK v6 uses `LanguageModelV2`, not V1 — Bedrock adapter must target the right spec version | High | Adapter would no-op or throw at runtime | **First implementation step:** read `ai` package's `LanguageModelV2Specification`. Adapter is built against that, not V1. |
| `@ai-sdk/cohere` may not yet exist for v6 | Medium | Blocked | Check npm before implementation; if missing, use native `cohere-ai` SDK and write a thin adapter (similar to Bedrock but smaller). Adds ~1 day. |
| AWS SDK is a large dep — adds ~5MB to the bundle | Low | Bundle bloat | Tree-shake by importing only `BedrockRuntimeClient`, `ConverseCommand`, `ConverseStreamCommand`. Confirm in `bun build` output. |
| Bedrock `Converse` API doesn't match AI SDK's tool-calling model 1:1 | Medium | Tool-using agents may fail on Bedrock | v1: text-only chat fully supported. Tool use works for single-tool-call-per-turn with no streaming deltas. |
| `setup-keys` testKey for Bedrock requires SigV4 signing — non-trivial | Medium | Wizard complexity | Implement a minimal SigV4 helper in `setup-keys.ts` using Web Crypto API. ~50 lines. Or skip the network test and let the user save-without-test (matches wizard's "Save anyway?" path). |
| Existing test suite may not have coverage for the `providers.ts` registry | High | Risk of regressions | The new `test-providers.test.ts` is the safety net. The helper refactor should not change behavior — it's a pure code-organization change. |

## 10. Migration plan (implementation order)

1. Read `node_modules/ai/package.json` and `ai/dist/index.d.ts` to confirm the `LanguageModel` interface version (V1 vs V2) and field names.
2. Verify `@ai-sdk/cohere` is published for AI SDK v6; if not, fall back to native `cohere-ai` SDK and plan a thin adapter.
3. Add 4 new entries to `AIProviderType`, `MODEL_REFERENCES`, and `getProviderBaseUrl` in `src/ai/models.ts`.
4. Extend `resolveApiKey` in `src/ai/provider.ts` with the 4 new env mappings.
5. Add `registerOpenAICompatible` helper in `src/ai/providers.ts`; refactor 6 existing entries to use it; add 2 new helper entries (xai, perplexity); add 1 native entry (cohere).
6. Create `src/ai/bedrock-adapter.ts` (the only non-trivial new file).
7. Register the bedrock factory in `src/ai/providers.ts`.
8. Extend `src/chat/provider.ts` env chain.
9. Add `package.json` deps and run `bun install`.
10. Update `src/wizard/flows/setup.ts` — 4 new provider select entries + region prompt for Bedrock.
11. Update `src/cli/commands/setup-keys.ts` — 4 new `ProviderConfig` entries with `testKey` functions.
12. Update `.env.example`.
13. Add `src/ai/test-providers.test.ts` and `src/ai/test-bedrock-adapter.test.ts`.
14. Register new tests in `scripts/run-tests.ts`.
15. Update `README.md` env-var table, add `docs/providers.md`, update `CHANGELOG.md`.
16. Run `bun run typecheck` and `bun run test`. Both must be green.

## 11. Out of scope (deferred to future specs)

- **Channel/messaging providers** (Discord, Slack, Matrix, WebSocket) — Sprint 3 + 13 of `implementation_plan.md`. Future spec.
- **Pluggable tool providers** (Brave/Tavily/SerpAPI for web search, Firecrawl/native/Jina for fetch). Future spec.
- **Pluggable storage/vector providers** (Postgres, Qdrant, LanceDB). Future spec.
- **`AIConfig.extra` field** for provider-specific config — broader refactor.
- **Migrating `chat/provider.ts` env chain to use `resolveApiKey`** — chat has its own precedence rules; refactor is risky.
- **Per-provider cost tracking** — separate spec already drafted.
- **Bedrock vision / prompt caching / extended thinking** — YAGNI for v1.

## 12. Verification

Before claiming done, run all of the following and confirm green output:

```bash
bun run typecheck                                  # 0 errors
bun run test                                       # all suites green
bun run lint                                       # 0 errors
bun run src/ai/test-providers.test.ts              # new suite
bun run src/ai/test-bedrock-adapter.test.ts        # new suite
```

Smoke test (manual, not in CI):

```bash
# With a real test API key
export XAI_API_KEY=xai-...
bun run index.ts chat                              # pick xAI from /provider list
```

Successful chat completion with the new provider is the smoke test.
