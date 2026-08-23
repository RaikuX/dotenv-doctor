# How to use this project for the Codex for OSS application

This file is for YOU (the maintainer). Delete it before publishing if you want.

## What the program offers

OpenAI's **Codex for Open Source** program (https://developers.openai.com/community/codex-for-oss) gives maintainers:

- 6 months of ChatGPT Pro with Codex
- API credits from the Codex Open Source Fund for projects **that use Codex in PR review, triage, release workflows**
- Conditional access to Codex Security

Apply at: https://openai.com/form/codex-for-oss/

## Why this project fits

The form asks how you use Codex in core OSS work. This repo answers directly:

1. `.github/workflows/codex-pr-review.yml` — Codex reviews every PR
2. `.github/workflows/codex-issue-triage.yml` — Codex labels and summarizes new issues
3. `.github/workflows/codex-release.yml` — Codex drafts release notes on `v*` tags
4. `AGENTS.md` — Codex-native maintenance conventions
5. Versioned prompts under `.github/codex/prompts/`

## Before you apply — do these honestly

The program verifies usage, ecosystem importance, active maintenance, and your real maintainer role (via GitHub partnership). Star inflation or fake activity gets benefits revoked per their terms. Research of accepted/ghosted applicants shows **being depended-on matters more than stars** (a 29k-star repo was ghosted; mycli at 11.7k got in), so:

1. **Fill in your identity**: set `author` and `repository.url` in `package.json`
2. **Publish to GitHub** under your account:
   ```bash
   git init && git add -A && git commit -m "feat: initial release"
   gh repo create dotenv-doctor --public --source . --push
   ```
3. **Publish to npm** (`npm publish`) — monthly download numbers matter on the form
4. **Enable the Codex workflows**: add `OPENAI_API_KEY` as a repo secret so the two Codex workflows actually run on real PRs/issues
5. **Use it genuinely**: run `npx @raikux/dotenv-doctor` in your own other projects, fix issues, answer bug reports, merge community PRs. A few weeks of real activity history helps a lot.
6. **Grow adoption legitimately**: post on relevant communities (r/node, Hacker News Show HN, Discord servers), write one short blog post ("I audited my .env hygiene and you should too")

## On the form

- Project link: your GitHub URL
- Metrics: stars, npm weekly downloads, dependents if any
- "How do you use Codex": quote the three workflows above verbatim — that's exactly what the fund credits
- Tools question: mention you use both the Codex CLI locally and codex-action in CI

## Realistic expectations

There's no hard star threshold published, but acceptance correlates with demonstrated real usage and active maintenance. Even without immediate acceptance, everything above makes this a healthier project — keep at it and reapply; review is rolling.
