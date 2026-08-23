import type { Issue, Rule } from "../types.js";

export const missingRule: Rule = {
  name: "missing",
  run({ envVars, exampleKeys }) {
    const issues: Issue[] = [];
    for (const key of exampleKeys) {
      if (!envVars.has(key)) {
        issues.push({
          rule: this.name,
          severity: "error",
          key,
          message: `"${key}" is declared in .env.example but missing from .env`,
        });
      }
    }
    return issues;
  },
};
