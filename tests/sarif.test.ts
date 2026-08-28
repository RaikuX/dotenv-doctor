import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditFiles } from "../src/audit.js";
import { renderSarif, toSarifUri } from "../src/report.js";

function setup(envContent: string, exampleContent: string) {
  const dir = mkdtempSync(join(tmpdir(), "dd-sarif-"));
  const envPath = join(dir, ".env");
  const exPath = join(dir, ".env.example");
  writeFileSync(envPath, envContent);
  writeFileSync(exPath, exampleContent);
  return { envPath, exPath };
}

test("SARIF document is version 2.1.0 with tool driver and results", () => {
  const { envPath, exPath } = setup(
    "PORT=abc\nAPI_KEY=\n",
    "PORT=\nAPI_KEY=\nMISSING=\n",
  );
  const result = auditFiles(envPath, exPath);
  const sarif = JSON.parse(renderSarif(result, "0.3.0"));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0].tool.driver.name, "dotenv-doctor");
  assert.equal(sarif.runs[0].tool.driver.version, "0.3.0");
  const ruleIds = sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
  assert.ok(ruleIds.includes("secret"));
  assert.ok(ruleIds.includes("missing"));
  assert.ok(ruleIds.includes("parse"));
  const ids = sarif.runs[0].results.map((r: { ruleId: string }) => r.ruleId);
  assert.ok(ids.includes("type"));
  assert.ok(ids.includes("missing"));
  for (const r of sarif.runs[0].results) {
    assert.ok(r.message.text);
    assert.ok(r.locations[0].physicalLocation.artifactLocation.uri);
    assert.equal(r.locations[0].physicalLocation.region?.snippet, undefined);
  }
});

test("SARIF never includes raw secret values", () => {
  const secret = "AKIAIOSFODNN7EXAMPLE";
  const { envPath, exPath } = setup(
    `AWS_ACCESS_KEY_ID=${secret}\n`,
    "AWS_ACCESS_KEY_ID=\n",
  );
  const result = auditFiles(envPath, exPath);
  const sarif = renderSarif(result, "0.3.0");
  assert.ok(!sarif.includes(secret), "raw AWS key must not appear in SARIF");
  const parsed = JSON.parse(sarif);
  const secretResult = parsed.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "secret");
  assert.ok(secretResult, "secret finding must be present");
  assert.equal(secretResult.level, "error");
  const uri: string = secretResult.locations[0].physicalLocation.artifactLocation.uri;
  assert.match(uri, /\.env$/);
  assert.ok(!uri.includes("\\"), "SARIF URIs must use forward slashes");
});

test("SARIF maps findings to env file path and startLine", () => {
  const { envPath, exPath } = setup("PORT=abc\n", "PORT=\n");
  const result = auditFiles(envPath, exPath);
  const parsed = JSON.parse(renderSarif(result, "0.3.0"));
  const typeResult = parsed.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "type");
  assert.ok(typeResult);
  assert.equal(typeResult.locations[0].physicalLocation.region.startLine, 1);
});

test("toSarifUri normalizes backslashes and strips ./", () => {
  assert.equal(toSarifUri("./.env"), ".env");
  assert.equal(toSarifUri("foo\\bar.env"), "foo/bar.env");
});

test("SARIF parse errors become results with ruleId parse", () => {
  const dir = mkdtempSync(join(tmpdir(), "dd-sarif-missing-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "A=1\n");
  const result = auditFiles(envPath, join(dir, "nope.example"));
  const parsed = JSON.parse(renderSarif(result, "0.3.0"));
  const parseHits = parsed.runs[0].results.filter((r: { ruleId: string }) => r.ruleId === "parse");
  assert.ok(parseHits.length >= 1);
  assert.equal(parseHits[0].level, "error");
});
