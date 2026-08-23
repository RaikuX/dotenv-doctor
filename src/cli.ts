#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditFiles, RULE_NAMES } from "./audit.js";
import { renderReport, renderJson } from "./report.js";
import { applyFix } from "./fixer.js";

const VERSION = (() => {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    return JSON.parse(readFileSync(pkgPath, "utf8")).version as string;
  } catch {
    return "unknown";
  }
})();

interface Args {
  env: string;
  example: string;
  disable: string[];
  noColor: boolean;
  format: "text" | "json";
  fix: boolean;
  version: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): { args?: Args; error?: string } {
  const args: Args = {
    env: ".env",
    example: ".env.example",
    disable: [],
    noColor: !process.stdout.isTTY || process.env.NO_COLOR != null,
    format: "text",
    fix: false,
    version: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--env":
      case "--example":
      case "--disable": {
        const val = argv[++i];
        if (val == null || val.startsWith("--")) {
          return { error: `flag "${a}" requires a value` };
        }
        if (a === "--env") args.env = val;
        else if (a === "--example") args.example = val;
        else
          args.disable.push(
            ...val.split(",").map((s) => s.trim()).filter(Boolean),
          );
        break;
      }
      case "--format": {
        const val = argv[++i];
        if (val !== "text" && val !== "json") {
          return { error: `--format must be "text" or "json"` };
        }
        args.format = val;
        break;
      }
      case "--fix":
        args.fix = true;
        break;
      case "--no-color":
        args.noColor = true;
        break;
      case "--version":
      case "-V":
        args.version = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (a.startsWith("-") && a !== "-") {
          return { error: `unknown flag "${a}" (see --help)` };
        }
        return { error: `unexpected argument "${a}" (see --help)` };
    }
  }
  return { args };
}

function usage(): string {
  return `dotenv-doctor v${VERSION} — audit .env hygiene

Usage:
  dotenv-doctor [options]

Options:
  --env <path>        path to your env file          (default: .env)
  --example <path>    path to the example/template   (default: .env.example)
  --fix               sync both files safely: append missing keys to .env,
                      document undocumented keys in .env.example (never removes)
  --format <text|json> output style; json is stable for CI/machines
  --disable <rules>   comma-separated rules to skip  (e.g. drift,type)
  --no-color          disable colored output (also honors NO_COLOR env var)
  -V, --version       print version
  -h, --help          show this help

Rules:
  missing       key in .env.example but absent from .env
  drift         key in .env not documented in .env.example
  empty         empty value
  placeholder   value still looks like a placeholder ("changeme", "<...>")
  type          value doesn't match what its key name implies (URL, port, ...)
  duplicate     the same key defined more than once (last one wins)
  secret        committed credential or high-entropy secret

Exit codes:
  0  all checks passed
  1  issues found
  2  runtime error`;
}

let parsed: ReturnType<typeof parseArgs>;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`dotenv-doctor: ${err instanceof Error ? err.message : err}`);
  process.exit(2);
}

if (parsed.error) {
  console.error(`dotenv-doctor: ${parsed.error}`);
  process.exit(2);
}

const args = parsed.args!;

if (args.help) {
  console.log(usage());
  process.exit(0);
}

if (args.version) {
  console.log(VERSION);
  process.exit(0);
}

const unknownRules = args.disable.filter((r) => !RULE_NAMES.includes(r));
if (unknownRules.length > 0) {
  console.error(
    `dotenv-doctor: unknown rule(s): ${unknownRules.join(", ")}\nValid rules: ${RULE_NAMES.join(", ")}`,
  );
  process.exit(2);
}

try {
  if (args.fix) {
    const fix = applyFix(args.env, args.example);
    if ("error" in fix) {
      console.error(`dotenv-doctor: ${fix.error}`);
      process.exit(2);
    }
    if (args.format === "json") {
      console.log(JSON.stringify(fix, null, 2));
    } else {
      for (const key of fix.addedToEnv) {
        console.log(`added   ${key} to ${args.env}`);
      }
      for (const key of fix.documentedInExample) {
        console.log(`documented ${key} in ${args.example}`);
      }
      if (fix.createdExample) {
        console.log(`created ${args.example} from scratch`);
      }
      if (fix.addedToEnv.length === 0 && fix.documentedInExample.length === 0) {
        console.log("nothing to fix — files already in sync");
      }
    }
    process.exit(0);
  }

  const result = auditFiles(args.env, args.example, { disabled: args.disable });

  if (args.format === "json") {
    console.log(renderJson(result, VERSION));
  } else {
    console.log(renderReport(result, !args.noColor));
    const missingCount = result.issues.filter((i) => i.rule === "missing").length;
    const driftCount = result.issues.filter((i) => i.rule === "drift").length;
    if (missingCount > 0 || driftCount > 0) {
      console.error(
        `\nhint: run \`dotenv-doctor --fix\` to add ${missingCount} missing key(s) and document ${driftCount} undocumented one(s)`,
      );
    }
  }

  if (result.parseErrors.length > 0 && result.issues.length === 0) process.exit(1);
  process.exit(result.issues.length > 0 ? 1 : 0);
} catch (err) {
  console.error(`dotenv-doctor: unexpected error: ${err instanceof Error ? err.message : err}`);
  process.exit(2);
}
