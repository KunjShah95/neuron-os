Title: Tighten TypeScript types across TUI and chat modules

Description:
The repository currently contains many `any` casts and loosened types introduced during rapid iteration. This task is to remove unsafe casts, add proper interfaces, and ensure the project typechecks with `tsc --noEmit`.

Scope:

- Audit occurrences of `(state as any)` and similar casts (notably in `src/chat/*` and `src/tui/*`).
- Expand `AppState`/`ChatState` interfaces to include fields used across files.
- Replace casts with typed accessors or optional chaining and guards.
- Add unit-level type-focused tests where helpful.

Acceptance criteria:

- `bun run --bun tsc --noEmit` passes locally.
- No `as any` casts remain in `src/tui` or `src/chat` unless justified with a comment linking to this issue.
- Code compiles and TUI runs without runtime type errors.

Notes / hints:

- Start by running `rg "as any" src | rg tui|chat` to find hotspots.
- Consider introducing small helper accessors (e.g., `getProviderIndex(state): number`) to centralize undefined checks.

Estimated effort: 3-5 hours depending on edge cases and external types.
