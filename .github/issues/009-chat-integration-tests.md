Title: Add end-to-end chat system integration tests with mock provider

Description:
The chat TUI (`src/chat/`) has 164 unit tests but lacks integration tests that exercise the full UI pipeline: input handling → store → provider → renderer loop. This task adds comprehensive integration tests with a mock AI provider.

Scope:

- Create a mock AI provider that returns predefined responses for testing
- Add integration tests for: message send/receive, streaming text rendering, session save/load, slash commands
- Test keyboard input handling (Enter to send, Alt+Enter for newline, Up/Down for history, Esc to cancel)
- Test session management flow: create → save → list → load → rename → export → delete
- Test provider switching at runtime via `/provider set` commands

Acceptance criteria:

- Chat TUI integration tests cover: send message, receive response, scroll history, session CRUD, provider switch
- Mock provider returns streaming chunks without real API calls
- All tests run as part of `bun run test`
- Tests are deterministic (no race conditions with streaming)

Notes / hints:

- Use the existing mocking infrastructure from `src/agent/test-lifecycle-integration.ts` (AI SDK v6 mock)
- The chat store (`src/chat/store.ts`) already has `chat()` and `streamChat()` methods — test through those
- Consider using `src/chat/test-chat.ts` as a starting point

Estimated effort: 6-8 hours.
