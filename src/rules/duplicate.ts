import type { Issue, Rule } from "../types.js";

export const duplicateRule: Rule = {
  name: "duplicate",
  run({ rawVars }) {
    const seen = new Map<string, number[]>();
    for (const v of rawVars) {
      const lines = seen.get(v.key);
      if (lines) lines.push(v.line);
      else seen.set(v.key, [v.line]);
    }
    const issues: Issue[] = [];
    for (const [key, lines] of seen) {
      if (lines.length > 1) {
        issues.push({
          rule: this.name,
          severity: "warn",
          key,
          line: lines[lines.length - 1],
          message: `"${key}" is defined ${lines.length} times (lines ${lines.join(", ")}) — only the last one takes effect`,
        });
      }
    }
    return issues;
  },
};
