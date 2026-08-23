import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditFiles } from "../src/audit.js";

function setup(envContent: string, exampleContent: string) {
  const dir = mkdtempSync(join(tmpdir(), "dd-mask-"));
  const envPath = join(dir, ".env");
  const exPath = join(dir, ".env.example");
  writeFileSync(envPath, envContent);
  writeFileSync(exPath, exampleContent);
  return { envPath, exPath };
}

test("type rule never reveals values of secret-named keys", () => {
  const { envPath, exPath } = setup(
    "WEBHOOK_URL=supersecrettokenvalue99\n",
    "WEBHOOK_URL=\n",
  );
  const r = auditFiles(envPath, exPath);
  const issue = r.issues.find((i) => i.rule === "type" && i.key === "WEBHOOK_URL");
  assert.ok(issue, "type issue should exist");
  assert.ok(!issue!.message.includes("supersecret"), "must not leak value prefix");
  assert.ok(issue!.message.includes("*"));
});

test("non-secret URL keys keep their helpful preview", () => {
  const { envPath, exPath } = setup("API_BASE_URL=nonsensevalue\n", "API_BASE_URL=\n");
  const r = auditFiles(envPath, exPath);
  const issue = r.issues.find((i) => i.rule === "type" && i.key === "API_BASE_URL");
  assert.ok(issue);
  assert.match(issue!.message, /nonsense…/);
});

test("placeholder rule masks secret-named key values fully", () => {
  const { envPath, exPath } = setup("API_KEY=changeme\n", "API_KEY=\n");
  const r = auditFiles(envPath, exPath);
  const issue = r.issues.find((i) => i.rule === "placeholder" && i.key === "API_KEY");
  assert.ok(issue, "placeholder issue should exist");
  assert.ok(!issue!.message.includes("changeme"), "must not leak placeholder prefix on secret-named keys");
});

test("placeholder rule detects mustache-style templates", () => {
  const { envPath, exPath } = setup("DB_HOST={{db_host}}\n", "");
  const r = auditFiles(envPath, exPath);
  assert.ok(r.issues.some((i) => i.rule === "placeholder" && i.key === "DB_HOST"));
});

test("boolean flags like Prisma DATABASE_URL_DIRECT are not URL-checked", () => {
  const { envPath, exPath } = setup("DATABASE_URL_DIRECT=true\n", "");
  const r = auditFiles(envPath, exPath);
  assert.equal(
    r.issues.filter((i) => i.rule === "type" && i.key === "DATABASE_URL_DIRECT").length,
    0,
    "boolean _DIRECT flag must not be treated as a URL",
  );
});
