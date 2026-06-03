Title: Add skill marketplace integration and hot-reload

Description:
Implements Issue #008. Adds skill marketplace CLI commands (install, update, uninstall) plus hot-reload without restart.

Changes:

- Extended `aegis skills` CLI command with subcommands:
  - `--install <name>` — install a skill from skills.sh: creates directory + SKILL.md with metadata
  - `--update [name]` — search for updates to all or specific skill
  - `--uninstall <name>` — remove a skill by deleting its directory
  - `--watch` — enable hot-reload via `fs.watch` on skills/ directory
  - `--search <query>` — search skills.sh registry (improved)
- Added `startSkillHotReload()` / `stopSkillHotReload()` — automatically reloads the `SkillRegistry` when SKILL.md files are added/modified/removed
- Updated skill display to show version, author, and dependency info
- Added `fetchTopSkills` import to support trending skills display

Testing:

- Skill CRUD operations work via CLI commands
- Hot-reload reloads registry on file changes
- Error handling for missing skills, network failures, and invalid names

Closes #008
