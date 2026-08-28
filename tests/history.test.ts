import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isEnvHistoryPath, scanGitHistory } from "../src/history.js";

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "dotenv-doctor-test",
  GIT_AUTHOR_EMAIL: "dd@test.local",
  GIT_COMMITTER_NAME: "dotenv-doctor-test",
  GIT_COMMITTER_EMAIL: "dd@test.local",
  GIT_TERMINAL_PROMPT: "0",
};

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv, windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r;
}

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "dd-hist-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "dd@test.local"]);
  git(dir, ["config", "user.name", "dotenv-doctor-test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

test("isEnvHistoryPath matches .env, .env.*, *.env and skips node_modules", () => {
  assert.equal(isEnvHistoryPath(".env"), true);
  assert.equal(isEnvHistoryPath(".env.local"), true);
  assert.equal(isEnvHistoryPath("prod.env"), true);
  assert.equal(isEnvHistoryPath("config/staging.env"), true);
  assert.equal(isEnvHistoryPath("src/app.ts"), false);
  assert.equal(isEnvHistoryPath(".environment"), false);
  assert.equal(isEnvHistoryPath("node_modules/.env"), false);
  assert.equal(isEnvHistoryPath("node_modules/pkg/.env.local"), false);
});

test("history scan finds a secret that was committed then removed", () => {
  const dir = repo();
  writeFileSync(join(dir, ".env"), "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nPORT=3000\n");
  git(dir, ["add", ".env"]);
  git(dir, ["commit", "-m", "add secret"]);
  writeFileSync(join(dir, ".env"), "PORT=3000\n");
  git(dir, ["add", ".env"]);
  git(dir, ["commit", "-m", "remove secret"]);

  const result = scanGitHistory({ cwd: dir });
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  const secrets = result.issues.filter((i) => i.rule === "secret");
  assert.equal(secrets.length, 1);
  assert.equal(secrets[0].key, "AWS_ACCESS_KEY_ID");
  assert.equal(secrets[0].file, ".env");
  assert.ok(secrets[0].commit);
  assert.ok(!JSON.stringify(result).includes("AKIAIOSFODNN7EXAMPLE"));
});

test("history findings are deduplicated across commits", () => {
  const dir = repo();
  writeFileSync(join(dir, ".env"), "GH_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL\n");
  git(dir, ["add", ".env"]);
  git(dir, ["commit", "-m", "one"]);
  writeFileSync(join(dir, ".env"), "GH_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL\nNOTE=x\n");
  git(dir, ["add", ".env"]);
  git(dir, ["commit", "-m", "two"]);

  const result = scanGitHistory({ cwd: dir });
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  assert.equal(result.issues.filter((i) => i.rule === "secret" && i.key === "GH_TOKEN").length, 1);
});

test("history skips node_modules and non-env files", () => {
  const dir = repo();
  mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "node_modules", ".env"), "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n");
  writeFileSync(join(dir, "src", "app.ts"), 'const t = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL";\n');
  writeFileSync(join(dir, "README.md"), "ok\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "noise"]);

  const result = scanGitHistory({ cwd: dir });
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  assert.equal(result.issues.length, 0);
});

test("history skips binary blobs", () => {
  const dir = repo();
  writeFileSync(join(dir, ".env"), Buffer.from([0x41, 0x3d, 0x00, 0x42, 0xff, 0x00]));
  git(dir, ["add", ".env"]);
  git(dir, ["commit", "-m", "binary"]);
  const result = scanGitHistory({ cwd: dir });
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  assert.equal(result.issues.length, 0);
});

test("history errors when git is missing", () => {
  const dir = repo();
  writeFileSync(join(dir, ".env"), "A=1\n");
  git(dir, ["add", ".env"]);
  git(dir, ["commit", "-m", "init"]);
  const result = scanGitHistory({ cwd: dir, gitBin: "dotenv-doctor-no-such-git-binary" });
  assert.ok("error" in result);
  assert.match(result.error, /git is not installed/);
});

test("history errors outside a git repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "dd-nongit-"));
  const result = scanGitHistory({ cwd: dir });
  assert.ok("error" in result);
  assert.match(result.error, /not a git repository/);
});

test("history errors on a shallow clone", () => {
  const src = repo();
  writeFileSync(join(src, ".env"), "PORT=3000\n");
  git(src, ["add", ".env"]);
  git(src, ["commit", "-m", "init"]);
  const dst = mkdtempSync(join(tmpdir(), "dd-shallow-"));
  const clone = spawnSync("git", ["clone", "--no-local", "--depth", "1", src, join(dst, "copy")], {
    encoding: "utf8",
    env: gitEnv,
    windowsHide: true,
  });
  assert.equal(clone.status, 0, clone.stderr);
  const result = scanGitHistory({ cwd: join(dst, "copy") });
  assert.ok("error" in result);
  assert.match(result.error, /shallow clone/);
  assert.match(result.error, /fetch-depth: 0/);
});
