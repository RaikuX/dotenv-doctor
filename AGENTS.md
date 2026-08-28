# AGENTS.md

Guidance for AI coding agents (Codex CLI, and any other agent) working in this repository.

## Project overview

dotenv-doctor is a **zero-runtime-dependency** TypeScript CLI that audits `.env` files. Do not add runtime dependencies. Dev dependencies (`typescript`, `@types/node`) are acceptable.

## Architecture

```
src/
  parser.ts        .env syntax parsing -> EnvVar[] (+ syntax errors)
  rules/           one file per rule; each exports a Rule object
  types.ts         Issue / Rule / AuditContext / TypeKind contracts
  audit.ts         loads files, runs enabled rules, returns AuditResult;
                   env-only rules (all except missing/drift) run even when
                   .env.example is unreadable — never hide committed secrets
  config.ts        .dotenv-doctor.json + package.json#dotenv-doctor loader
  history.ts       --history git log scan of env files for committed secrets
  fixer.ts         --fix engine: two-way safe sync, append-only,
                   refuses files with syntax errors
  report.ts        terminal rendering + renderJson + renderSarif
  cli.ts           argument parsing, exit codes, usage text
  index.ts         public library API
scripts/
  test.mjs             Node18-compatible test runner (no CLI glob dependency)
  check-workflows.mjs  js-yaml validation of all workflow/action YAML
tests/             node:test suites, compiled by tsconfig.test.json
```

## Conventions

- ESM everywhere (`"type": "module"`). Relative imports inside `src/` use **`.js` extensions** (they resolve after `tsc` compilation).
- Strict TypeScript. No `any`; prefer narrow interfaces in `types.ts`.
- Rules must be pure functions of `AuditContext` — no filesystem or process access inside rule bodies.
- New rules require: implementation in `src/rules/`, export from `src/rules/index.ts`, registration in `ALL_RULES` in `src/audit.ts`, tests in `tests/rules.test.ts`, and a row in the README rules table.
- Secret values must never be printed unmasked in reports or error messages.

## Commands

- Build: `npm run build` (outputs to `dist/`)
- Test: `npm test` (compiles to `dist-test/` then runs `node --test`)
- Typecheck: `npm run lint`

All three must pass before considering work complete.

## Exit-code contract

The CLI contract is `0 = clean, 1 = findings, 2 = runtime error`. Preserve it.

## Commits

Use conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
