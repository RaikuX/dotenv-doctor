You are writing release notes for **dotenv-doctor** — a zero-runtime-dependency TypeScript CLI that audits `.env` files.

You are given the version tag and the list of commits since the previous tag. Produce release notes that:

1. Open with a one-line summary of the release's theme (e.g. "parser hardening and two new rules").
2. Group changes under `### Added`, `### Fixed`, `### Changed`, `### Removed` as applicable, based on conventional-commit prefixes in the commit list (`feat:` → Added/Changed, `fix:` → Fixed, etc.). Rewrite commit subjects into user-facing sentences; drop pure chore/refactor noise unless it affects users.
3. Call out any breaking changes at the top under `> ⚠️ Breaking:` if present.
4. End with a short install reminder:
   `npm install -g dotenv-doctor@<version without v prefix>`

Keep it under 30 lines total. Plain Markdown only.
