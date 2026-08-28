import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(process.cwd(), "dist", "cli.js");

function run(args: string[], cwd?: string) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    windowsHide: true,
  });
}

test("CLI --help documents sarif, history, and config", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /sarif/);
  assert.match(r.stdout, /--history/);
  assert.match(r.stdout, /--config/);
  assert.match(r.stdout, /fetch-depth: 0/);
});

test("CLI --format rejects unknown values", () => {
  const r = run(["--format", "xml"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /text.*json.*sarif/);
});

test("CLI --format sarif writes valid SARIF without leaking secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "dd-cli-sarif-"));
  writeFileSync(join(dir, ".env"), "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n");
  writeFileSync(join(dir, ".env.example"), "AWS_ACCESS_KEY_ID=\n");
  const out = join(dir, "out.sarif");
  const r = run(
    ["--env", join(dir, ".env"), "--example", join(dir, ".env.example"), "--format", "sarif", "--output", out, "--no-color"],
  );
  assert.equal(r.status, 1);
  const body = readFileSync(out, "utf8");
  assert.ok(!body.includes("AKIAIOSFODNN7EXAMPLE"));
  const sarif = JSON.parse(body);
  assert.equal(sarif.version, "2.1.0");
  assert.ok(sarif.runs[0].results.some((x: { ruleId: string }) => x.ruleId === "secret"));
});

test("CLI flags override config file", () => {
  const dir = mkdtempSync(join(tmpdir(), "dd-cli-cfg-"));
  writeFileSync(join(dir, ".env"), "PORT=3000\n");
  writeFileSync(join(dir, ".env.example"), "PORT=\n");
  writeFileSync(join(dir, ".env.prod"), "PORT=abc\n");
  writeFileSync(join(dir, ".env.prod.example"), "PORT=\n");
  writeFileSync(
    join(dir, ".dotenv-doctor.json"),
    JSON.stringify({ env: ".env.prod", example: ".env.prod.example", disable: ["type"] }),
  );
  const withoutFlags = run(["--no-color", "--format", "json"], dir);
  assert.equal(withoutFlags.status, 0, withoutFlags.stderr);
  const withFlags = run(
    ["--env", ".env.prod", "--example", ".env.prod.example", "--disable", "empty", "--no-color", "--format", "json"],
    dir,
  );
  assert.equal(withFlags.status, 1, withFlags.stderr);
  const parsed = JSON.parse(withFlags.stdout);
  assert.ok(parsed.issues.some((i: { rule: string }) => i.rule === "type"));
});

test("CLI --history on a non-git directory exits 2 with a clear error", () => {
  const dir = mkdtempSync(join(tmpdir(), "dd-cli-nongit-"));
  writeFileSync(join(dir, ".env"), "PORT=3000\n");
  writeFileSync(join(dir, ".env.example"), "PORT=\n");
  const r = run(["--history", "--no-color"], dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a git repository/);
});

test("CLI --history cannot be combined with --fix", () => {
  const r = run(["--history", "--fix"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot be combined/);
});
