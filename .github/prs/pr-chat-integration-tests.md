Title: Add end-to-end chat system integration tests with mock provider

Description:
Implements Issue #009. Adds comprehensive integration tests for the full chat TUI pipeline using a mock AI provider.

Changes:

- Created `src/chat/test-chat-integration.ts` with 16 integration tests covering:
  - Chat store state management (creation, user/assistant messages, streaming, finalize, errors)
  - Checkpoint/rewind functionality
  - Session save/load
  - AgentEngine chat with mock AI (basic, streaming, multi-message, with memory, maxSteps)
  - Full pipeline: Memory → Runtime → Engine → Response (all data types, streaming, roundtrip)
- Added to CI test runner in `scripts/run-tests.ts`

Testing:

- 43 chat integration tests pass
- All tests deterministic with mock streaming provider
- Runs as part of `bun run test` suite

Closes #009
