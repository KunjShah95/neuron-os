Title: Rotate/revoke exposed API keys and remove secrets from history

Description:
An API key was accidentally committed in `.openclaude-profile.json`. Immediate rotation is required and the repository history should be cleaned to remove the file from all commits.

Action items:

1. Revoke/rotate the exposed OpenRouter/OpenAI API key immediately (owner/maintainer action).
2. Remove `.openclaude-profile.json` from the repository history using `git-filter-repo` or BFG, then force-push the cleaned history.
3. Add `.openclaude-profile.json` to `.gitignore` (done locally).
4. Notify collaborators to re-clone the repository due to rewritten history.

Commands (recommended):

- pip install git-filter-repo
- git clone https://github.com/OWNER/REPO.git repo-clean
- cd repo-clean
- git filter-repo --invert-paths --path .openclaude-profile.json
- git push --force origin main

Notes:

- Rotating the key is critical even if history is rewritten; treat the key as compromised.
- This operation requires force-push and coordination with collaborators.

Estimated effort: 30-60 minutes (plus key rotation time).
