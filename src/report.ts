import { isAbsolute, relative } from "node:path";
import type { AuditResult } from "./audit.js";
import { RULE_NAMES } from "./audit.js";
import type { Issue, Severity } from "./types.js";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

const SARIF_SCHEMA =
  "https://json.schemastore.org/sarif-2.1.0.json";

const RULE_DOCS: Record<string, { short: string; full: string }> = {
  missing: {
    short: "Key declared in .env.example but missing from .env",
    full: "A variable is documented in the example/template file but is not set in the env file. Deploys will fail or silently use undefined.",
  },
  drift: {
    short: "Key in .env is not documented in .env.example",
    full: "A variable exists in the env file but is missing from the example, so other environments will not know to set it.",
  },
  empty: {
    short: "Empty value",
    full: "The variable is declared but has an empty value.",
  },
  placeholder: {
    short: "Value still looks like a placeholder",
    full: "The value matches a placeholder pattern such as changeme, <your-key>, or {{template}}.",
  },
  type: {
    short: "Value does not match the type implied by the key name",
    full: "Ports must be numeric, _URL/_URI/_ENDPOINT values must be URLs, emails and booleans are validated against known shapes.",
  },
  duplicate: {
    short: "The same key is defined more than once",
    full: "Duplicate keys mean only the last assignment takes effect, which is easy to miss.",
  },
  secret: {
    short: "Committed credential or high-entropy secret",
    full: "A value matches a known credential format or a high-entropy string in a secret-named key. Rotate the credential and remove it from the file (and git history).",
  },
  parse: {
    short: "Env file could not be read or parsed",
    full: "The env or example file is missing, unreadable, or contains syntax errors.",
  },
};

function issueJson(i: Issue) {
  return {
    rule: i.rule,
    severity: i.severity,
    key: i.key ?? null,
    line: i.line ?? null,
    file: i.file ?? null,
    commit: i.commit ?? null,
    message: i.message,
  };
}

export function renderJson(result: AuditResult, version?: string): string {
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warn").length;
  return JSON.stringify(
    {
      ...(version != null ? { version } : {}),
      varCount: result.varCount,
      parseErrors: result.parseErrors,
      summary: { errors, warnings, total: result.issues.length },
      issues: result.issues.map(issueJson),
    },
    null,
    2,
  );
}

/** Convert a filesystem path into a repo-relative SARIF URI (forward slashes). */
export function toSarifUri(file: string, cwd = process.cwd()): string {
  let p = file.replace(/\\/g, "/");
  if (p.startsWith("./")) p = p.slice(2);
  if (isAbsolute(file)) {
    const rel = relative(cwd, file);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
      return rel.replace(/\\/g, "/");
    }
  }
  return p;
}

function sarifLevel(severity: Severity): "error" | "warning" {
  return severity === "error" ? "error" : "warning";
}

export function renderSarif(result: AuditResult, version?: string): string {
  const ruleIds = [...RULE_NAMES, "parse"];
  const rules = ruleIds.map((id) => {
    const docs = RULE_DOCS[id] ?? { short: id, full: id };
    return {
      id,
      shortDescription: { text: docs.short },
      fullDescription: { text: docs.full },
      helpUri: "https://github.com/RaikuX/dotenv-doctor#rules",
      defaultConfiguration: {
        level: id === "drift" || id === "empty" || id === "placeholder" || id === "type" || id === "duplicate"
          ? "warning"
          : "error",
      },
    };
  });
  const ruleIndex = new Map(ruleIds.map((id, i) => [id, i]));

  type SarifResult = {
    ruleId: string;
    ruleIndex?: number;
    level: "error" | "warning";
    message: { text: string };
    locations: {
      physicalLocation: {
        artifactLocation: { uri: string };
        region?: { startLine: number };
      };
    }[];
  };

  const results: SarifResult[] = [];

  for (const err of result.parseErrors) {
    const fileMatch = /Cannot read (\S+)/.exec(err);
    const uri = toSarifUri(fileMatch?.[1] ?? result.envPath);
    results.push({
      ruleId: "parse",
      ruleIndex: ruleIndex.get("parse"),
      level: "error",
      message: { text: err },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri },
          },
        },
      ],
    });
  }

  for (const issue of result.issues) {
    const uri = toSarifUri(issue.file ?? result.envPath);
    const loc: SarifResult["locations"][number] = {
      physicalLocation: {
        artifactLocation: { uri },
        ...(issue.line != null && issue.line > 0
          ? { region: { startLine: issue.line } }
          : {}),
      },
    };
    results.push({
      ruleId: issue.rule,
      ruleIndex: ruleIndex.get(issue.rule),
      level: sarifLevel(issue.severity),
      message: { text: issue.message },
      locations: [loc],
    });
  }

  const doc = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "dotenv-doctor",
            version: version ?? "unknown",
            informationUri: "https://github.com/RaikuX/dotenv-doctor",
            rules,
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(doc, null, 2);
}

export function renderReport(result: AuditResult, useColor = true): string {
  const c = (code: string) => (useColor ? code : "");
  const lines: string[] = [];

  for (const err of result.parseErrors) {
    lines.push(`${c(RED)}parse error${c(RESET)}  ${err}`);
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warn");

  const order = { error: 0, warn: 1 } as const;
  const sorted = [...result.issues].sort(
    (a, b) => order[a.severity] - order[b.severity] || (a.key ?? "").localeCompare(b.key ?? ""),
  );

  for (const issue of sorted) {
    const tag = issue.severity === "error" ? `${c(RED)}error${c(RESET)}` : `${c(YELLOW)}warn ${c(RESET)}`;
    let loc = "";
    if (issue.commit) {
      const where = `${issue.file ?? "?"}${issue.line != null ? `:${issue.line}` : ""}`;
      loc = ` ${c(DIM)}(${where} @ ${issue.commit.slice(0, 7)})${c(RESET)}`;
    } else if (issue.line != null) {
      loc = ` ${c(DIM)}(${issue.line})${c(RESET)}`;
    }
    lines.push(`${tag}  ${c(DIM)}[${issue.rule}]${c(RESET)} ${issue.message}${loc}`);
  }

  lines.push("");
  const total = result.issues.length + result.parseErrors.length;
  if (total === 0) {
    lines.push(`${c(GREEN)}✔ ${c(BOLD)}All checks passed.${c(RESET)} ${result.varCount} vars audited.`);
  } else {
    const parts: string[] = [];
    parts.push(`${c(RED)}${errors.length} error(s)${c(RESET)}`);
    parts.push(`${c(YELLOW)}${warnings.length} warning(s)${c(RESET)}`);
    if (result.parseErrors.length > 0) {
      parts.push(`${c(RED)}${result.parseErrors.length} file issue(s)${c(RESET)}`);
    }
    lines.push(`${c(BOLD)}✖ Found ${parts.join(", ")}${c(RESET)} across ${result.varCount} vars.`);
  }

  return lines.join("\n");
}
