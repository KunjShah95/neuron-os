Title: Add unit tests for TUI providers and sessions flows

Description:
We need reliable unit tests for the TUI flows (provider selection, sessions listing/replay, keyboard input handling). Some tests have been added but coverage is incomplete.

Scope:

- Add tests for `src/tui/input.ts` key handling (simulate provider/session focus and key events).
- Add tests for rendering components `renderProviders` and `renderSessions`.
- Mock `sessionStore` to avoid filesystem dependencies in unit tests.
- Integrate new tests into `scripts/run-tests.ts` so CI runs them.

Acceptance criteria:

- Tests run locally via `bun run scripts/run-tests.ts` and pass.
- CI workflow triggers include running these tests.

Estimated effort: 2-4 hours.
