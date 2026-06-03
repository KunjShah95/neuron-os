Title: Add end-to-end chat system integration tests with mock provider

Description:
Implements Issue #009. Adds comprehensive integration tests for the full chat TUI pipeline using a mock AI provider.

Changes:

- Created mock AI provider for deterministic chat testing
- Added integration tests for: message send/receive, streaming rendering, session CRUD, slash commands
- Tests cover keyboard input (Enter, Alt+Enter, Up/Down, Esc)
- Session management lifecycle: create → save → list → load → rename → export → delete
- Runtime provider switching via `/provider set` commands

Testing:

- 20+ new integration tests added
- All tests deterministic with mock streaming provider
- Runs as part of `bun run test` suite

Closes #009
