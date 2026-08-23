import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

async function loadLib() {
  return import(pathToFileURL(join(process.cwd(), "dist", "index.js")).href);
}

test("public library API exposes the documented surface", async () => {
  const lib = await loadLib();
  for (const name of ["auditFiles", "parseEnvFile", "renderReport", "RULE_NAMES"]) {
    assert.ok(name in lib, `missing export: ${name}`);
  }
  assert.deepEqual(
    [...(lib.RULE_NAMES as readonly string[])].sort(),
    ["drift", "duplicate", "empty", "missing", "placeholder", "secret", "type"],
  );
});

test("library auditFiles + renderReport work without the CLI", async () => {
  const lib = await loadLib();
  const dir = mkdtempSync(join(tmpdir(), "dd-lib-"));
  const envPath = join(dir, ".env");
  const exPath = join(dir, ".env.example");
  writeFileSync(envPath, "PORT=abc\nSECRET=changeme\n");
  writeFileSync(exPath, "PORT=\nSECRET=\nAPI_KEY=\n");

  const result = lib.auditFiles(envPath, exPath);
  const rules = new Set(result.issues.map((i: { rule: string }) => i.rule));
  assert.ok(rules.has("missing"), "should flag API_KEY missing");
  assert.ok(rules.has("type"), "should flag PORT=abc");
  assert.ok(rules.has("placeholder"), "should flag changeme");

  const report = lib.renderReport(result, false);
  assert.match(report, /Found 1 error\(s\), 2 warning\(s\)/);
});
