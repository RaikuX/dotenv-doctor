import { parseEnvFile, type EnvVar, type ParseResult } from "./parser.js";
import { readFileSync } from "node:fs";
import {
  missingRule,
  driftRule,
  emptyRule,
  placeholderRule,
  secretRule,
  typeRule,
  duplicateRule,
} from "./rules/index.js";
import type { Issue, Rule, TypeKind } from "./types.js";

/** rules that need both files */
const EXAMPLE_DEPENDENT = new Set([missingRule.name, driftRule.name]);

const ALL_RULES: Rule[] = [
  missingRule,
  driftRule,
  emptyRule,
  placeholderRule,
  typeRule,
  duplicateRule,
  secretRule,
];

export const RULE_NAMES = ALL_RULES.map((r) => r.name);

export interface AuditOptions {
  /** rule names to disable */
  disabled?: string[];
  /** per-key type annotations (from config); override name-based inference */
  types?: Record<string, TypeKind>;
}

export interface AuditResult {
  issues: Issue[];
  varCount: number;
  parseErrors: string[];
  envPath: string;
  examplePath: string;
}

export function auditFiles(
  envPath: string,
  examplePath: string,
  options: AuditOptions = {},
): AuditResult {
  const disabled = new Set(options.disabled ?? []);
  const types = options.types ?? {};

  let envParsed: ParseResult;
  try {
    envParsed = parseEnvFile(readFileSync(envPath, "utf8"));
  } catch {
    return {
      issues: [],
      varCount: 0,
      parseErrors: [`Cannot read ${envPath} — does the file exist?`],
      envPath,
      examplePath,
    };
  }

  let exParsed: ParseResult | null;
  const parseErrors: string[] = [...envParsed.errors];
  try {
    exParsed = parseEnvFile(readFileSync(examplePath, "utf8"));
    parseErrors.push(...exParsed.errors);
  } catch {
    exParsed = null;
    parseErrors.push(
      `Cannot read ${examplePath} — every project should ship one as documentation`,
    );
  }

  const ctx = {
    envVars: indexVars(envParsed.vars),
    rawVars: envParsed.vars.map((v) => ({ key: v.key, value: v.value, line: v.line })),
    exampleKeys: new Set(exParsed ? exParsed.vars.map((v) => v.key) : []),
    types,
  };

  // Security and hygiene rules run against the env alone, so a missing
  // .env.example never hides committed credentials.
  const issues: Issue[] = [];
  for (const rule of ALL_RULES) {
    if (disabled.has(rule.name)) continue;
    if (exParsed === null && EXAMPLE_DEPENDENT.has(rule.name)) continue;
    for (const issue of rule.run(ctx)) {
      issues.push({ ...issue, file: issue.file ?? envPath });
    }
  }

  return { issues, varCount: envParsed.vars.length, parseErrors, envPath, examplePath };
}

export function indexVars(vars: EnvVar[]): Map<string, { value: string; line: number }> {
  const map = new Map<string, { value: string; line: number }>();
  for (const v of vars) {
    map.set(v.key, { value: v.value, line: v.line });
  }
  return map;
}

/** Merge extra findings, skipping duplicates of the same file+key+rule. */
export function mergeIssues(base: Issue[], extra: Issue[]): Issue[] {
  const seen = new Set(
    base.map((i) => `${i.file ?? ""}\0${i.key ?? ""}\0${i.rule}`),
  );
  const out = [...base];
  for (const issue of extra) {
    const fp = `${issue.file ?? ""}\0${issue.key ?? ""}\0${issue.rule}`;
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(issue);
  }
  return out;
}
