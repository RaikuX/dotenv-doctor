import type { Issue, Rule } from "../types.js";

const PLACEHOLDER_PATTERNS = [
  /^change[-_]?me$/i,
  /^your[-_].*$/i,
  /^<.*>$/,
  /^\[.*\]$/,
  /^\$\{.*\}$/,
  /^xxx+$/i,
  /^todo$/i,
  /^fixme$/i,
  /^placeholder/i,
  /^example\.com$/,
  /^(get|insert|put)[-_]?(your|an?)?[-_]?key$/i,
  /^my[-_]/i,
];

export const placeholderRule: Rule = {
  name: "placeholder",
  run({ envVars }) {
    const issues: Issue[] = [];
    for (const [key, meta] of envVars) {
      if (meta.value.trim() === "") continue;
      if (PLACEHOLDER_PATTERNS.some((p) => p.test(meta.value.trim()))) {
        issues.push({
          rule: this.name,
          severity: "warn",
          key,
          line: meta.line,
          message: `"${key}" still contains a placeholder value ("${mask(meta.value)}")`,
        });
      }
    }
    return issues;
  },
};

function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "*".repeat(v.length);
  return v.slice(0, 2) + "*".repeat(Math.min(Math.max(v.length - 4, 3), 12)) + v.slice(-2);
}
