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
import type { Issue, Rule } from "./types.js";

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
}

export interface AuditResult {
  issues: Issue[];
  varCount: number;
  parseErrors: string[];
}

export function auditFiles(
  envPath: string,
  examplePath: string,
  options: AuditOptions = {},
): AuditResult {
  const disabled = new Set(options.disabled ?? []);
  const rules = ALL_RULES.filter((r) => !disabled.has(r.name));

  let envParsed: ParseResult;
  let exParsed: ParseResult;
  try {
    envParsed = parseEnvFile(readFileSync(envPath, "utf8"));
  } catch {
    return {
      issues: [],
      varCount: 0,
      parseErrors: [`Cannot read ${envPath} — does the file exist?`],
    };
  }

  try {
    exParsed = parseEnvFile(readFileSync(examplePath, "utf8"));
  } catch {
    return {
      issues: [],
      varCount: envParsed.vars.length,
      parseErrors: [
        `Cannot read ${examplePath} — every project should ship one as documentation`,
      ],
    };
  }

  const ctx = {
    envVars: indexVars(envParsed.vars),
    rawVars: envParsed.vars.map((v) => ({ key: v.key, value: v.value, line: v.line })),
    exampleKeys: new Set(exParsed.vars.map((v) => v.key)),
  };

  const issues: Issue[] = [];
  for (const rule of rules) {
    issues.push(...rule.run(ctx));
  }

  return { issues, varCount: envParsed.vars.length, parseErrors: [...envParsed.errors, ...exParsed.errors] };
}

function indexVars(vars: EnvVar[]): Map<string, { value: string; line: number }> {
  const map = new Map<string, { value: string; line: number }>();
  for (const v of vars) {
    map.set(v.key, { value: v.value, line: v.line });
  }
  return map;
}
