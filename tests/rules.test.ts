import { test } from "node:test";
import assert from "node:assert/strict";
import { auditFiles, RULE_NAMES } from "../src/audit.js";

function ctx(envContent: string, exampleContent = "") {
  return { envContent, exampleContent };
}

// We cannot easily write temp files per test without fs, so integration tests
// below use real temp files.
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function setup(envContent: string, exampleContent: string): [string, string] {
  const dir = mkdtempSync(join(tmpdir(), "ddd-"));
  const envPath = join(dir, ".env");
  const exPath = join(dir, ".env.example");
  writeFileSync(envPath, envContent);
  writeFileSync(exPath, exampleContent);
  return [envPath, exPath];
}

test("missing rule: flags example keys absent from .env", () => {
  const [envPath, exPath] = setup("A=1\n", "MISSING_KEY=\nA=\n");
  const r = auditFiles(envPath, exPath);
  const missing = r.issues.filter((i) => i.rule === "missing");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].key, "MISSING_KEY");
});

test("drift rule: flags undocumented .env keys", () => {
  const [envPath, exPath] = setup("EXTRA_ONLY=x\n", "");
  const r = auditFiles(envPath, exPath);
  const drift = r.issues.filter((i) => i.rule === "drift");
  assert.equal(drift.length, 1);
  assert.equal(drift[0].key, "EXTRA_ONLY");
});

test("secret rule: detects AWS access key", () => {
  const [envPath, exPath] = setup('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n', "");
  const r = auditFiles(envPath, exPath);
  const secrets = r.issues.filter((i) => i.rule === "secret" && i.severity === "error");
  assert.equal(secrets.length, 1);
  assert.match(secrets[0].message, /AWS access key/);
});

test("secret rule: detects GitHub token", () => {
  const [envPath, exPath] = setup("GH_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "secret" && i.severity === "error"));
});

test("secret rule: does not flag ordinary values", () => {
  const [envPath, exPath] = setup('APP_NAME=my-cool-app\n', "");
  const r = auditFiles(envPath, exPath);
  assert.equal(r.issues.filter((i) => i.rule === "secret").length, 0);
});

test("placeholder rule: catches changeme", () => {
  const [envPath, exPath] = setup("DB_PASSWORD=changeme\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "placeholder"));
});

test("type rule: port must be numeric", () => {
  const [envPath, exPath] = setup("SERVER_PORT=not_a_number\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "type" && i.key === "SERVER_PORT"));
});

test("type rule: URL must be valid", () => {
  const [envPath, exPath] = setup("API_BASE_URL=nonsense\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "type" && i.key === "API_BASE_URL"));
});

test("NODE_ENV accepts standard environment names without warnings", () => {
  for (const v of ["development", "production", "test"]) {
    const [envPath, exPath] = setup(`NODE_ENV=${v}\n`, "");
    const r = auditFiles(envPath, exPath);
    assert.equal(
      r.issues.filter((i) => i.rule === "type" && i.key === "NODE_ENV").length,
      0,
      `NODE_ENV=${v} should be valid`,
    );
  }
});

test("NODE_ENV rejects unknown values", () => {
  const [envPath, exPath] = setup("NODE_ENV=staging\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "type" && i.key === "NODE_ENV"));
});

test("multi-line private key value parses cleanly and still triggers secret rule", () => {
  const content = 'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA\\n-----END RSA PRIVATE KEY-----"\n';
  const [envPath, exPath] = setup(content, "");
  const r = auditFiles(envPath, exPath);
  assert.equal(r.parseErrors.length, 0, `unexpected parse errors: ${r.parseErrors.join("; ")}`);
  assert.ok(r.issues.some((i) => i.rule === "secret"));
});

test("empty rule: warns on empty values", () => {
  const [envPath, exPath] = setup("EMPTY_VAR=\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "empty"));
});

test("duplicate rule: flags repeated keys with both line numbers", () => {
  const [envPath, exPath] = setup("DUP=first\nOTHER=x\nDUP=second\n", "DUP=\n");
  const r = auditFiles(envPath, exPath);
  const dupes = r.issues.filter((i) => i.rule === "duplicate");
  assert.equal(dupes.length, 1);
  assert.match(dupes[0].message, /2 times \(lines 1, 3\)/);
});

test("duplicate rule: stays silent on unique keys", () => {
  const [envPath, exPath] = setup("A=1\nB=2\n", "");
  const r = auditFiles(envPath, exPath);
  assert.equal(r.issues.filter((i) => i.rule === "duplicate").length, 0);
});

test("type rule: display-name email format is accepted", () => {
  const [envPath, exPath] = setup('MAIL_FROM=John Doe <john@acme.com>\n', "MAIL_FROM=\n");
  const r = auditFiles(envPath, exPath);
  assert.equal(r.issues.filter((i) => i.rule === "type" && i.key === "MAIL_FROM").length, 0);
});

test("type rule: malformed display-name email is still flagged", () => {
  const [envPath, exPath] = setup("MAIL_FROM=John Doe <not-an-email>\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "type" && i.key === "MAIL_FROM"));
});

test("secret rule: detects Anthropic API key", () => {
  const [envPath, exPath] = setup(`ANTHROPIC_KEY=sk-ant-api03-${"A".repeat(50)}\n`, "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "secret" && /Anthropic/.test(i.message)));
});

test("secret rule: detects SendGrid API key", () => {
  const [envPath, exPath] = setup("SENDGRID_API_KEY=SG.ABCDEFGHIJKLMNOPqrstuv.wxYZ1234567890abcdefghijk\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "secret" && /SendGrid/.test(i.message)));
});

test("secret rule: detects legacy OpenAI key", () => {
  const [envPath, exPath] = setup(`OPENAI_API_KEY=sk-${"A".repeat(48)}\n`, "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "secret" && /OpenAI/.test(i.message)));
});

test("RULE_NAMES covers every implemented rule", () => {
  assert.deepEqual(
    [...RULE_NAMES].sort(),
    ["drift", "duplicate", "empty", "missing", "placeholder", "secret", "type"],
  );
});

test("disable option skips rules", () => {
  const [envPath, exPath] = setup("EXTRA_ONLY=x\nEMPTY_VAR=\n", "");
  const r = auditFiles(envPath, exPath, { disabled: ["drift", "empty"] });
  assert.equal(r.issues.filter((i) => i.rule === "drift").length, 0);
  assert.equal(r.issues.filter((i) => i.rule === "empty").length, 0);
});

test("clean project passes with zero issues", () => {
  const [envPath, exPath] = setup(
    'PORT=3000\nDATABASE_URL=postgres://localhost:5432/db\nDEBUG=false\n',
    "PORT=\nDATABASE_URL=\nDEBUG=\n",
  );
  const r = auditFiles(envPath, exPath);
  assert.equal(r.issues.length, 0);
});

test("missing example file produces parse error", () => {
  const dir = mkdtempSync(join(tmpdir(), "ddd-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "A=1\n");
  const r = auditFiles(envPath, join(dir, "nope.example"));
  assert.equal(r.parseErrors.length, 1);
  assert.match(r.parseErrors[0], /Cannot read/);
});
