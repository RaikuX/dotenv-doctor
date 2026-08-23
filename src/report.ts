import type { AuditResult } from "./audit.js";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

export function renderJson(result: AuditResult, version?: string): string {
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warn").length;
  return JSON.stringify(
    {
      ...(version != null ? { version } : {}),
      varCount: result.varCount,
      parseErrors: result.parseErrors,
      summary: { errors, warnings, total: result.issues.length },
      issues: result.issues.map((i) => ({
        rule: i.rule,
        severity: i.severity,
        key: i.key ?? null,
        line: i.line ?? null,
        message: i.message,
      })),
    },
    null,
    2,
  );
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
    const loc = issue.line != null ? ` ${c(DIM)}(${issue.line})${c(RESET)}` : "";
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
