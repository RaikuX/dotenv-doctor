import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile } from "../src/parser.js";

test("parses basic KEY=VALUE pairs", () => {
  const r = parseEnvFile("A=1\nB=hello\n");
  assert.equal(r.vars.length, 2);
  assert.deepEqual(r.vars[0], { key: "A", value: "1", line: 1 });
});

test("strips quotes and keeps inner content", () => {
  const r = parseEnvFile(`A="hello world"\nB='single'\nC=no_quotes\n`);
  assert.equal(r.vars[0].value, "hello world");
  assert.equal(r.vars[1].value, "single");
  assert.equal(r.vars[2].value, "no_quotes");
});

test("handles comments and blank lines", () => {
  const r = parseEnvFile("# comment\n\nA=1 # trailing comment\n  # indented comment\n");
  assert.equal(r.vars.length, 1);
  assert.equal(r.vars[0].value, "1");
});

test("handles export prefix", () => {
  const r = parseEnvFile("export A=1\n");
  assert.equal(r.vars[0].key, "A");
});

test("reports malformed lines without values", () => {
  const r = parseEnvFile("JUST_A_KEY\nBAD LINE HERE\nOK=1\n");
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Line 1/);
});

test("records line numbers correctly", () => {
  const r = parseEnvFile("\n\n\nKEY=value\n");
  assert.equal(r.vars[0].line, 4);
});

test("multi-line double-quoted value is joined into one var", () => {
  const content = 'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"\nNEXT=1\n';
  const r = parseEnvFile(content);
  assert.equal(r.vars.length, 2);
  assert.equal(r.vars[0].key, "PRIVATE_KEY");
  assert.ok(r.vars[0].value.includes("BEGIN RSA"));
  assert.ok(r.vars[0].value.includes("END RSA"));
  assert.equal(r.errors.length, 0);
});

test("unterminated multi-line quote reports an error and is skipped", () => {
  const content = 'BROKEN="starts but never ends\nAFTER=1\n';
  const r = parseEnvFile(content);
  assert.equal(r.vars.filter((v) => v.key === "BROKEN").length, 0);
  assert.ok(r.errors.some((e) => /unterminated/i.test(e)));
});

test("escaped quotes inside double-quoted values are preserved", () => {
  const r = parseEnvFile('QUOTE="he said \\"hi\\""\n');
  assert.equal(r.vars[0].value, 'he said "hi"');
});

test("malformed-line errors do not echo the raw line (secrets stay masked)", () => {
  const r = parseEnvFile("AKIAIOSFODNN7EXAMPLE leaked\nJUST_A_KEY\nOK=1\n");
  assert.equal(r.errors.length, 2);
  const blob = r.errors.join("\n");
  assert.ok(!blob.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(!blob.includes("JUST_A_KEY"));
});
