import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyFix } from "../src/fixer.js";

function setup(envContent: string | null, exampleContent: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "dd-fix-"));
  const envPath = join(dir, ".env");
  const exPath = join(dir, ".env.example");
  if (envContent !== null) writeFileSync(envPath, envContent);
  if (exampleContent !== null) writeFileSync(exPath, exampleContent);
  return { dir, envPath, exPath };
}

test("fix appends missing keys to .env and documents drift", () => {
  const { envPath, exPath } = setup("PORT=3000\nSECRET=real\n", "PORT=\nAPI_KEY=\n");
  const r = applyFix(envPath, exPath);
  assert.ok(!("error" in r));
  assert.deepEqual(r.addedToEnv, ["API_KEY"]);
  assert.deepEqual(r.documentedInExample, ["SECRET"]);
  assert.equal(r.createdExample, false);

  const env = readFileSync(envPath, "utf8");
  assert.match(env, /^PORT=3000\n/m);
  assert.match(env, /^API_KEY=\n/m);
  const ex = readFileSync(exPath, "utf8");
  assert.match(ex, /^SECRET=\n/m);
});

test("fix never removes existing content or reorders lines", () => {
  const { envPath, exPath } = setup("B=2\nA=1\n", "C=\nA=\n");
  applyFix(envPath, exPath);
  const env = readFileSync(envPath, "utf8");
  const idxB = env.indexOf("B=2"), idxA = env.indexOf("A=1"), idxC = env.indexOf("C=");
  assert.ok(idxB < idxA && idxA < idxC);
  const ex = readFileSync(exPath, "utf8");
  assert.match(ex, /^C=\n/m);
});

test("fix creates the example file when it does not exist", () => {
  const { envPath, exPath } = setup("X=1\nY=2\n", null);
  assert.equal(existsSync(exPath), false);
  const r = applyFix(envPath, exPath);
  assert.ok(!("error" in r));
  assert.equal(r.createdExample, true);
  assert.deepEqual(r.documentedInExample, ["X", "Y"]);
  const ex = readFileSync(exPath, "utf8");
  assert.match(ex, /^X=\n/m);
  assert.match(ex, /^Y=\n/m);
});

test("fix refuses files with syntax errors", () => {
  const { envPath, exPath } = setup("BAD LINE\n", "");
  const r = applyFix(envPath, exPath);
  assert.ok("error" in r);
  assert.match((r as { error: string }).error, /refusing to fix/);
});

test("fix preserves CRLF style of the target file", () => {
  const { envPath, exPath } = setup("A=1\r\nB=2\r\n", "C=\r\n");
  applyFix(envPath, exPath);
  const env = readFileSync(envPath, "utf8");
  assert.ok(env.includes("C=\r\n"));
  assert.equal(env.split("\r\n").length - 1 >= 3, true);
});

test("fix is idempotent — second run changes nothing", () => {
  const { envPath, exPath } = setup("A=1\n", "B=\n");
  const first = applyFix(envPath, exPath);
  assert.ok(!("error" in first));
  const envAfterFirst = readFileSync(envPath, "utf8");
  const second = applyFix(envPath, exPath);
  assert.ok(!("error" in second));
  assert.equal(second.addedToEnv.length + second.documentedInExample.length, 0);
  assert.equal(readFileSync(envPath, "utf8"), envAfterFirst);
});

test("fix on an empty env file does not produce a leading blank line", () => {
  const { envPath, exPath } = setup("", "A=\nB=\n");
  const r = applyFix(envPath, exPath);
  assert.ok(!("error" in r));
  assert.deepEqual(r.addedToEnv, ["A", "B"]);
  const env = readFileSync(envPath, "utf8");
  assert.equal(env.startsWith("\n"), false);
  assert.match(env, /^A=\nB=\n$/);
});
