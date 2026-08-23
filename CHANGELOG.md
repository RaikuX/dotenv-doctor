# Changelog

All notable changes to dotenv-doctor are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
