import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseEnvFile } from "./parser.js";
import { secretRule } from "./rules/secret.js";
import { indexVars } from "./audit.js";
import type { Issue } from "./types.js";

export interface HistoryScanOptions {
  cwd?: string;
  gitBin?: string;
}

const SHA_RE = /^[0-9a-f]{40,64}$/i;
const MAX_BLOB_BYTES = 1_000_000;

function runGit(
  gitBin: string,
  args: string[],
  cwd: string,
  encoding: "utf8" | "buffer" = "utf8",
):
  | { ok: true; stdout: string | Buffer; stderr: string }
  | { ok: false; error: string; code?: string } {
  const result = spawnSync(gitBin, args, {
    cwd,
    encoding: encoding === "utf8" ? "utf8" : undefined,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {
        ok: false,
        code: "ENOENT",
        error: "git is not installed or not on PATH (required for --history)",
      };
    }
    return { ok: false, error: `git ${args[0] ?? ""} failed: ${err.message}` };
  }
  const stderr = (result.stderr ?? "").toString();
  if (result.status !== 0) {
    return {
      ok: false,
      error: stderr.trim() || `git ${args[0] ?? ""} exited ${result.status}`,
    };
  }
  return {
    ok: true,
    stdout: result.stdout ?? (encoding === "utf8" ? "" : Buffer.alloc(0)),
    stderr,
  };
}

/** True for `.env`, `.env.*`, and `*.env` paths, excluding `node_modules`. */
export function isEnvHistoryPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.split("/").includes("node_modules")) return false;
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  return base === ".env" || base.startsWith(".env.") || base.endsWith(".env");
}

function isBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  return sample.includes(0);
}

/**
 * Scan git history for previously committed secrets using the same secret
 * rule as a working-tree audit. Only `.env`, `.env.*` and `*.env` files are
 * read; `node_modules` and binary blobs are skipped. Findings are deduplicated
 * by file + key (oldest commit kept).
 *
 * Requires a full (non-shallow) clone — in GitHub Actions set
 * `actions/checkout` `fetch-depth: 0`.
 */
export function scanGitHistory(
  options: HistoryScanOptions = {},
): { issues: Issue[] } | { error: string } {
  const cwd = options.cwd ?? process.cwd();
  const gitBin = options.gitBin ?? "git";

  const version = runGit(gitBin, ["--version"], cwd);
  if (!version.ok) return { error: version.error };

  const inside = runGit(gitBin, ["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok || String(inside.stdout).trim() !== "true") {
    return { error: "not a git repository (required for --history)" };
  }

  const head = runGit(gitBin, ["rev-parse", "--verify", "HEAD"], cwd);
  if (!head.ok) {
    return { error: "git history is empty; --history needs at least one commit" };
  }

  const shallow = runGit(gitBin, ["rev-parse", "--is-shallow-repository"], cwd);
  if (shallow.ok && String(shallow.stdout).trim() === "true") {
    return {
      error:
        "git history is a shallow clone; checkout with full history (GitHub Actions: fetch-depth: 0)",
    };
  }

  const log = runGit(
    gitBin,
    [
      "log",
      "--all",
      "--reverse",
      "--pretty=format:%H",
      "--name-only",
      "--diff-filter=ACMR",
      "--",
      ".env",
      "*.env",
      ".env.*",
      ":(glob)**/.env",
      ":(glob)**/.env.*",
      ":(glob)**/*.env",
      ":(exclude,glob)**/node_modules/**",
    ],
    cwd,
  );
  if (!log.ok) return { error: `failed to read git history: ${log.error}` };

  const text = String(log.stdout).replace(/\r\n/g, "\n");
  const blocks = text.split("\n\n");
  const seen = new Set<string>();
  const blobSeen = new Set<string>();
  const issues: Issue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const commit = lines[0];
    if (!SHA_RE.test(commit)) continue;

    for (const file of lines.slice(1).filter(isEnvHistoryPath)) {
      if (file.includes("\0")) continue;
      const shown = runGit(gitBin, ["show", `${commit}:${file}`], cwd, "buffer");
      if (!shown.ok) continue;
      const buf = Buffer.isBuffer(shown.stdout)
        ? shown.stdout
        : Buffer.from(String(shown.stdout));
      if (buf.length === 0 || buf.length > MAX_BLOB_BYTES) continue;
      if (isBinary(buf)) continue;

      const content = buf.toString("utf8");
      const blobKey = `${file}\0${createHash("sha256").update(content).digest("hex")}`;
      if (blobSeen.has(blobKey)) continue;
      blobSeen.add(blobKey);

      const parsed = parseEnvFile(content);
      const ctx = {
        envVars: indexVars(parsed.vars),
        rawVars: parsed.vars.map((v) => ({ key: v.key, value: v.value, line: v.line })),
        exampleKeys: new Set<string>(),
        types: {},
      };
      for (const issue of secretRule.run(ctx)) {
        const fp = `${file}\0${issue.key ?? ""}\0${issue.rule}`;
        if (seen.has(fp)) continue;
        seen.add(fp);
        const short = commit.slice(0, 7);
        issues.push({
          ...issue,
          file,
          commit,
          message: `${issue.message} (committed in ${short}:${file})`,
        });
      }
    }
  }

  return { issues };
}
