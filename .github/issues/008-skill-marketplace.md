Title: Add Agent skill marketplace integration and hot-reload

Description:
The skills system supports local skills (`skills/` directory) and remote skills via skills.sh API. This task adds a full marketplace flow: browse, install, update, uninstall skills, plus hot-reload without restart.

Scope:

- Add `aegis skill search <query>` — search skills.sh API for available skills
- Add `aegis skill install <name>` — download and register a skill locally
- Add `aegis skill update [name]` — update all or specific skills to latest version
- Add `aegis skill uninstall <name>` — remove a skill
- Implement skill hot-reload: detect changes to `skills/` directory and reload without restarting the TUI
- Add skill version display in `aegis skills` mode
- Add skill dependency resolution (skills that depend on other skills)

Acceptance criteria:

- Skills can be searched, installed, updated, and uninstalled via CLI
- Hot-reload works: adding/removing a skill file updates available skills without restart
- Skills mode shows version, author, and dependency info for each installed skill
- All skills operations have integration tests
- Error handling for network failures, missing skills, and version conflicts

Notes / hints:

- The remote API client is in `src/skills/remote.ts` — extend with marketplace endpoints
- For hot-reload, use `fs.watch` on the `skills/` directory
- Consider a `skills.json` manifest for tracking installed versions and metadata

Estimated effort: 8-12 hours.
