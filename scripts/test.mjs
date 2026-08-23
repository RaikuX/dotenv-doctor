import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readdirSync } from "node:fs";

const TESTS_DIR = join("dist-test", "tests");

function collectTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTestFiles(p));
    else if (/\.test\.c?m?js$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = collectTestFiles(TESTS_DIR);
if (files.length === 0) {
  console.error(`no compiled test files found in ${TESTS_DIR}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
