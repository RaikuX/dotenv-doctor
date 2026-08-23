import type { Issue, Rule } from "../types.js";

export const driftRule: Rule = {
  name: "drift",
  run({ envVars, exampleKeys }) {
    const issues: Issue[] = [];
    for (const [key, meta] of envVars) {
      if (!exampleKeys.has(key)) {
        issues.push({
          rule: this.name,
          severity: "warn",
          key,
          line: meta.line,
          message: `"${key}" exists in .env but is not documented in .env.example`,
        });
      }
    }
    return issues;
  },
};
