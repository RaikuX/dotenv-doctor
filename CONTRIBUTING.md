# Contributing to dotenv-doctor

Thanks for helping out! This project aims to stay small, fast, and dependency-free.

## Getting started

```bash
git clone <your-fork>
cd dotenv-doctor
npm install
npm test
```

## Ground rules

1. **No runtime dependencies.** The value proposition is zero-dep. Use Node built-ins.
2. **Every rule needs tests.** Include at least one positive and one negative case.
3. **Never print secret values unmasked** in output.
4. Update the README rules table when adding/changing rules.
5. Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Adding a rule

1. Create `src/rules/<name>.ts` exporting a `Rule` object (see `src/rules/empty.ts` for the minimal shape).
2. Register it in `src/rules/index.ts`.
3. Add tests in `tests/rules.test.ts`.
4. Document severity and purpose in `README.md`.

## AI-assisted contributions

AI coding agents are welcome. Please read `AGENTS.md` first — it documents architecture, conventions, and the verification commands that must pass. Contributions must be human-reviewed; the PR author is responsible for their agent's output.

## Reporting security issues

Found a way dotenv-doctor misses a real credential class, or a false-positive storm? Open an issue with a redacted sample. Please don't paste live secrets anywhere — not even in issues.
