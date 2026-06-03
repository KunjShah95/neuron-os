Title: Add skill marketplace integration and hot-reload

Description:
Implements Issue #008. Adds a full skill marketplace workflow — search, install, update, uninstall — plus hot-reload without restart.

Changes:

- Added `aegis skill search/install/update/uninstall` CLI commands
- Extended skills.sh API client in `src/skills/remote.ts` with marketplace endpoints
- Implemented skill hot-reload via fs.watch on `skills/` directory
- Added version, author, and dependency display in skills mode
- Created `skills.json` manifest for tracking installed versions

Testing:

- Skill CRUD operations tested end-to-end
- Hot-reload verified: adding/removing skill files updates available skills immediately
- Error handling tested for network failures and version conflicts

Closes #008
