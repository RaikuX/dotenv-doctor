import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config.js";
import { auditFiles } from "../src/audit.js";

function dir() {
  return mkdtempSync(join(tmpdir(), "dd-cfg-"));
}

test("loads .dotenv-doctor.json env/example/disable/types", () => {
  const cwd = dir();
  writeFileSync(
    join(cwd, ".dotenv-doctor.json"),
    JSON.stringify({
      env: ".env.prod",
      example: ".env.example",
      disable: ["drift"],
      types: { WEIRD: "url" },
    }),
  );
  const cfg = loadConfig({ cwd });
  assert.ok(!("error" in cfg));
  assert.equal(cfg.env, ".env.prod");
  assert.equal(cfg.example, ".env.example");
  assert.deepEqual(cfg.disable, ["drift"]);
  assert.equal(cfg.types?.WEIRD, "url");
});

test("package.json dotenv-doctor field is used when no json file exists", () => {
  const cwd = dir();
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "app", "dotenv-doctor": { disable: ["type", "empty"] } }),
  );
  const cfg = loadConfig({ cwd });
  assert.ok(!("error" in cfg));
  assert.deepEqual(cfg.disable, ["type", "empty"]);
});

test(".dotenv-doctor.json overrides package.json field", () => {
  const cwd = dir();
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "app", "dotenv-doctor": { env: ".env.pkg", disable: ["type"] } }),
  );
  writeFileSync(
    join(cwd, ".dotenv-doctor.json"),
    JSON.stringify({ env: ".env.json", disable: ["drift"] }),
  );
  const cfg = loadConfig({ cwd });
  assert.ok(!("error" in cfg));
  assert.equal(cfg.env, ".env.json");
  assert.deepEqual(cfg.disable, ["drift"]);
});

test("explicit --config path is required to exist", () => {
  const cwd = dir();
  const cfg = loadConfig({ cwd, configPath: "missing.json" });
  assert.ok("error" in cfg);
  assert.match(cfg.error, /not found/);
});

test("invalid type annotation is rejected", () => {
  const cwd = dir();
  writeFileSync(join(cwd, ".dotenv-doctor.json"), JSON.stringify({ types: { PORT: "banana" } }));
  const cfg = loadConfig({ cwd });
  assert.ok("error" in cfg);
  assert.match(cfg.error, /types.PORT/);
});

test("custom type annotation flags keys the name heuristic would miss", () => {
  const cwd = dir();
  const envPath = join(cwd, ".env");
  const exPath = join(cwd, ".env.example");
  writeFileSync(envPath, "WEIRD=not-a-url\nPORT=abc\n");
  writeFileSync(exPath, "WEIRD=\nPORT=\n");
  const flagged = auditFiles(envPath, exPath, { types: { WEIRD: "url" } });
  assert.ok(flagged.issues.some((i) => i.rule === "type" && i.key === "WEIRD"));
  const skipped = auditFiles(envPath, exPath, { types: { PORT: "string" } });
  assert.equal(
    skipped.issues.filter((i) => i.rule === "type" && i.key === "PORT").length,
    0,
    "types.PORT=string must suppress inference",
  );
});

test("disable from config-equivalent options skips rules", () => {
  const cwd = dir();
  const envPath = join(cwd, ".env");
  const exPath = join(cwd, ".env.example");
  writeFileSync(envPath, "EXTRA=1\n");
  writeFileSync(exPath, "");
  const r = auditFiles(envPath, exPath, { disabled: ["drift"] });
  assert.equal(r.issues.filter((i) => i.rule === "drift").length, 0);
});

test("comma-separated disable string is accepted in config", () => {
  const cwd = dir();
  writeFileSync(join(cwd, ".dotenv-doctor.json"), JSON.stringify({ disable: "drift, type" }));
  const cfg = loadConfig({ cwd });
  assert.ok(!("error" in cfg));
  assert.deepEqual(cfg.disable, ["drift", "type"]);
});
