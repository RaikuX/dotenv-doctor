# dotenv-doctor

> Audit your `.env` hygiene before production audits you.

[![CI](https://github.com/RaikuX/dotenv-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/RaikuX/dotenv-doctor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@raikux/dotenv-doctor)](https://www.npmjs.com/package/@raikux/dotenv-doctor)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**dotenv-doctor** is a zero-dependency CLI that catches the environment-variable mistakes that cause 2am outages: keys declared but never set, placeholder secrets shipped to prod, real credentials accidentally committed, and values whose types don't match what your code expects.

```console
$ npx @raikux/dotenv-doctor

error  [missing]    "API_KEY" is declared in .env.example but missing from .env
error  [secret]     "AWS_ACCESS_KEY_ID" matches a real AWS access key format — rotate immediately
warn   [drift]      "DB_PASSWORD" exists in .env but is not documented in .env.example
warn   [placeholder] "DB_PASSWORD" still contains a placeholder value ("ch****me")
warn   [type]       "PORT" looks like a port but "abc" is not numeric

✖ Found 2 error(s), 3 warning(s) across 12 vars.
```

## Why

Every team has been burned by at least one of these:

- A deploy fails because a new var was added to `.env.example` but nobody updated staging's `.env`
- A developer ships `PASSWORD=changeme` because it *worked locally*
- An AWS key gets committed and crawlers find it within minutes
- Someone spends an hour debugging because `PORT=8_000` isn't numeric

dotenv-doctor turns all four into fast, deterministic CI checks — no config required.

## Install

```bash
npm install -g @raikux/dotenv-doctor
# or run once-off
npx @raikux/dotenv-doctor
```

Requires Node.js >= 18.

## Usage

```bash
dotenv-doctor                          # audit .env against .env.example
dotenv-doctor --fix                    # sync missing/undocumented keys safely
dotenv-doctor --format json            # machine-readable output for CI
dotenv-doctor --env .env.production    # audit a specific env file
dotenv-doctor --disable drift,type     # skip rules you don't want
```

Exit codes make it CI-friendly:

| Code | Meaning |
| ---- | ------- |
| `0` | All checks passed |
| `1` | Issues found (or files unreadable) |
| `2` | Runtime error |

## Rules

| Rule | Severity | Catches |
| ---- | -------- | ------- |
| `missing` | error | Keys in `.env.example` absent from `.env` |
| `drift` | warn | Keys in `.env` not documented in `.env.example` |
| `empty` | warn | Empty values |
| `placeholder` | warn | Values like `changeme`, `<your-key>`, `xxx` |
| `type` | warn | Port/URL/email/boolean/NODE_ENV keys with wrong-shaped values |
| `duplicate` | warn | The same key defined multiple times (last one silently wins) |
| `secret` | error/warn | Real credential formats (AWS, Stripe, GitHub, OpenAI incl. legacy, Anthropic, SendGrid, npm, PyPI, Slack, Google, JWT, private keys) plus generic high-entropy strings in secret-named keys |

> Security rules run even if `.env.example` is missing or unreadable — a missing example never hides committed credentials.

Secret detection never prints the value — only masked previews (`AK********AMPLE`).

## Use in CI

### One step with the official action

```yaml
name: env-hygiene
on: [push, pull_request]
jobs:
  dotenv-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: RaikuX/dotenv-doctor@v1
        with:
          disable: ""        # optional, e.g. "drift,type"
```

### Or plain npx

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npx @raikux/dotenv-doctor --no-color
```

## Maintained with Codex

This repository uses [Codex](https://github.com/openai/codex) as part of its day-to-day maintenance:

- **PR review**: every pull request gets an automated Codex review via [`openai/codex-action`](https://github.com/openai/codex-action), posted as a PR comment (`.github/workflows/codex-pr-review.yml`)
- **Issue triage**: newly opened issues are classified and labeled by Codex (`.github/workflows/codex-issue-triage.yml`)
- **Release notes**: pushing a `v*` tag makes Codex draft user-facing release notes from the commit history (`.github/workflows/codex-release.yml`)
- **Agent-native**: [`AGENTS.md`](./AGENTS.md) gives coding agents (Codex CLI included) the project conventions they need to contribute correctly

To enable the Codex workflows, add your `OPENAI_API_KEY` as a repository secret.

## Roadmap

- [x] `--fix` mode: sync missing keys into `.env` / document drift in `.env.example`
- [x] JSON output for CI/machine consumption
- [ ] Config file support (`.dotenv-doctor.json`) for custom type annotations
- [ ] Git history scanning (`--history`) for previously committed secrets
- [ ] SARIF output for GitHub Security tab integration

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Coding agents: read [AGENTS.md](./AGENTS.md) first.

## License

[MIT](./LICENSE)
