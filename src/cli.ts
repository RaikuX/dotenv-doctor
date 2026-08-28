#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditFiles, mergeIssues, RULE_NAMES } from "./audit.js";
import { renderReport, renderJson, renderSarif } from "./report.js";
import { applyFix } from "./fixer.js";
import { loadConfig } from "./config.js";
import { scanGitHistory } from "./history.js";

const VERSION = (() => {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    return JSON.parse(readFileSync(pkgPath, "utf8")).version as string;
  } catch {
    return "unknown";
  }
})();

export type OutputFormat = "text" | "json" | "sarif";

interface Args {
  env?: string;
  example?: string;
  disable: string[];
  disableProvided: boolean;
  noColor: boolean;
  format: OutputFormat;
  fix: boolean;
  history: boolean;
  config?: string;
  output?: string;
  version: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): { args?: Args; error?: string } {
  const args: Args = {
    disable: [],
    disableProvided: false,
    noColor: !process.stdout.isTTY || process.env.NO_COLOR != null,
    format: "text",
    fix: false,
    history: false,
    version: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--env":
      case "--example":
      case "--disable":
      case "--config":
      case "--output": {
        const val = argv[++i];
        if (val == null || val.startsWith("--")) {
          return { error: `flag "${a}" requires a value` };
        }
        if (a === "--env") args.env = val;
        else if (a === "--example") args.example = val;
        else if (a === "--config") args.config = val;
        else if (a === "--output") args.output = val;
        else {
          args.disableProvided = true;
          args.disable.push(
            ...val.split(",").map((s) => s.trim()).filter(Boolean),
          );
        }
        break;
      }
      case "--format": {
        const val = argv[++i];
        if (val !== "text" && val !== "json" && val !== "sarif") {
          return { error: `--format must be "text", "json", or "sarif"` };
        }
        args.format = val;
        break;
      }
      case "--fix":
        args.fix = true;
        break;
      case "--history":
        args.history = true;
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
  --format <text|json|sarif>
                      output style; json/sarif are stable for CI
  --output <path>     write the report to a file instead of stdout
  --history           scan git history for previously committed secrets
                      (requires git and a full clone; CI: fetch-depth: 0)
  --config <path>     config file (default: .dotenv-doctor.json, then
                      package.json "dotenv-doctor")
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

Config:
  .dotenv-doctor.json (or package.json#dotenv-doctor) may set env, example,
  disable, and types. CLI flags override the config file.

Exit codes:
  0  all checks passed
  1  issues found
  2  runtime error`;
}

function emit(text: string, output?: string): void {
  if (output) {
    writeFileSync(output, text.endsWith("\n") ? text : text + "\n", "utf8");
  } else {
    console.log(text);
  }
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

if (args.fix && args.history) {
  console.error("dotenv-doctor: --history cannot be combined with --fix");
  process.exit(2);
}

const fileConfig = loadConfig({ configPath: args.config });
if ("error" in fileConfig) {
  console.error(`dotenv-doctor: ${fileConfig.error}`);
  process.exit(2);
}

const env = args.env ?? fileConfig.env ?? ".env";
const example = args.example ?? fileConfig.example ?? ".env.example";
const disable = args.disableProvided ? args.disable : (fileConfig.disable ?? []);
const types = fileConfig.types ?? {};

const unknownRules = disable.filter((r) => !RULE_NAMES.includes(r));
if (unknownRules.length > 0) {
  console.error(
    `dotenv-doctor: unknown rule(s): ${unknownRules.join(", ")}\nValid rules: ${RULE_NAMES.join(", ")}`,
  );
  process.exit(2);
}

try {
  if (args.fix) {
    const fix = applyFix(env, example);
    if ("error" in fix) {
      console.error(`dotenv-doctor: ${fix.error}`);
      process.exit(2);
    }
    if (args.format === "json") {
      emit(JSON.stringify(fix, null, 2), args.output);
    } else if (args.format === "sarif") {
      console.error("dotenv-doctor: --format sarif is not valid with --fix");
      process.exit(2);
    } else {
      const lines: string[] = [];
      for (const key of fix.addedToEnv) {
        lines.push(`added   ${key} to ${env}`);
      }
      for (const key of fix.documentedInExample) {
        lines.push(`documented ${key} in ${example}`);
      }
      if (fix.createdExample) {
        lines.push(`created ${example} from scratch`);
      }
      if (fix.addedToEnv.length === 0 && fix.documentedInExample.length === 0) {
        lines.push("nothing to fix — files already in sync");
      }
      emit(lines.join("\n"), args.output);
    }
    process.exit(0);
  }

  const result = auditFiles(env, example, { disabled: disable, types });

  if (args.history) {
    const hist = scanGitHistory();
    if ("error" in hist) {
      console.error(`dotenv-doctor: ${hist.error}`);
      process.exit(2);
    }
    result.issues = mergeIssues(result.issues, hist.issues);
  }

  if (args.format === "json") {
    emit(renderJson(result, VERSION), args.output);
  } else if (args.format === "sarif") {
    emit(renderSarif(result, VERSION), args.output);
  } else {
    emit(renderReport(result, !args.noColor), args.output);
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
