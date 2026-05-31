Title: Complete in-TUI session management (delete / rename / export) UX

Description:
The TUI session list supports replay, but session management actions (delete, rename, export) need a full UI/UX flow with confirmations and prompts.

Scope:

- Add keybindings when `ui.focus === 'sessions'` for:
  - D / Delete: prompt `Are you sure? (y/N)` before deleting
  - R / Rename: prompt for new name and validate uniqueness
  - E / Export: prompt for path to export JSON to
- Implement confirmation modals or inline prompt area in the TUI renderer.
- Ensure operations update the `state.sessions` list and persist appropriately.
- Add unit tests covering delete/rename/export flows (mock `sessionStore`).

Acceptance criteria:

- Delete confirms before removing session and removes file from `data/sessions/`.
- Rename updates the stored filename and the sessions list.
- Export writes session JSON to user-provided path and reports success/failure in activity log.
- Tests added and passing.

Estimated effort: 4-6 hours.
