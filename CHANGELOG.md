# Changelog

All notable changes to dotenv-doctor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-08-28

### Added

- `--format sarif`: SARIF 2.1.0 output suitable for `github/codeql-action/upload-sarif`. Findings map to the env file path and rule ids; raw secret values and source snippets are never included
- `--output <path>`: write the report (text/json/sarif) to a file
- `--history`: scan git history for previously committed secrets using the existing secret rule (`.env`, `.env.*`, `*.env` only; skips `node_modules` and binary blobs; deduplicates by file+key). Requires a full clone (`fetch-depth: 0`). Clear exit-2 errors if git/history is missing or the clone is shallow
- Config file: `.dotenv-doctor.json` and optional `package.json` `"dotenv-doctor"` field for `env`, `example`, `disable`, and custom `types` annotations. CLI flags override config
- GitHub Action inputs: `format`, `history`, `config`, `sarif-file`; `sarif-file` output for code-scanning upload

### Fixed

- Parser errors no longer echo the raw malformed line (could leak a secret that was not `KEY=value`)
- Codex issue-triage workflow used `gh issue label`, which is not a gh command; it now uses `gh issue edit --add-label`
- README Codex workflow paths now match the files in `.github/workflows/`
- `package-lock.json` version had drifted behind `package.json`

## [0.2.0] - 2026-08-23

### Added

- `--fix`: safe two-way sync — appends example-declared keys missing from `.env`, documents undocumented `.env` keys in `.env.example`; never removes anything, refuses files with syntax errors, preserves CRLF style, idempotent
- `--format json`: stable machine-readable output for CI pipelines (includes package version)
- Actionable hint after findings ("run with `--fix` to add N missing keys…")
- Library API now exports `applyFix`, `renderJson`
- Security rules now audit the env file even when `.env.example` is missing or unreadable — a missing example no longer hides committed credentials
- `exports` field in package.json for modern Node/bundler resolution

### Changed

- Test runner rewritten to support Node 18/20 (no CLI glob dependency)
- CI dogfood job now asserts real exit-code behavior instead of only `--help`

### Fixed

- GitHub workflows no longer use `secrets` inside step-level `if:` (rejected by GitHub's parser, invalidating the whole file)
- `--fix` no longer writes a leading blank line when the target file is empty
- Values under secret-named keys (`*KEY`, `*TOKEN`, `*SECRET`, `*PASSWORD`, `*CREDENTIAL`, `*AUTH`, `*WEBHOOK`, …) are now fully masked by every rule — previously the type rule could reveal up to 8 characters
- Placeholder rule now also detects `{{template}}` values

## [0.1.0] - 2026-08-23

### Added

- Seven audit rules: `missing`, `drift`, `empty`, `placeholder`, `type`, `duplicate`, `secret`
- Secret detection for AWS, Stripe, GitHub, OpenAI (modern + legacy), Anthropic, SendGrid, npm, PyPI, Slack, Google, JWTs, and embedded private keys; generic high-entropy heuristic for secret-named keys
- Masked output everywhere — secret values are never printed unmasked
- Parser support for multi-line double-quoted values (private keys in `.env`), escaped quotes, single quotes, inline comments, and `export` prefixes
- Type conventions with zero config: ports must be numeric, `_URL`/`_URI`/`_ENDPOINT` must be valid URLs, emails accept the `Name <addr>` form, booleans and `NODE_ENV` validated against known values
- CLI: `--env`, `--example`, `--disable` (with rule-name validation), `--no-color` (+ `NO_COLOR` env var), `-V/--version`, stable exit-code contract (`0` clean / `1` findings / `2` error)
- Library API (`import { auditFiles } from "dotenv-doctor"`) alongside the CLI
- Official GitHub Action (`action.yml`) for one-step CI adoption
- Codex-native maintenance: PR review, issue triage, and release-notes GitHub workflows powered by `openai/codex-action`; `AGENTS.md` agent conventions
- 32-test suite covering parser edge cases, every rule's positive and negative cases, and CLI contracts
