import type { Issue, Rule } from "../types.js";

export const emptyRule: Rule = {
  name: "empty",
  run({ envVars }) {
    const issues: Issue[] = [];
    for (const [key, meta] of envVars) {
      if (meta.value.trim() === "") {
        issues.push({
          rule: this.name,
          severity: "warn",
          key,
          line: meta.line,
          message: `"${key}" has an empty value`,
        });
      }
    }
    return issues;
  },
};
