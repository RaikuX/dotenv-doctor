export type Severity = "error" | "warn";

export interface Issue {
  rule: string;
  severity: Severity;
  key?: string;
  line?: number;
  message: string;
}

export interface AuditContext {
  envVars: Map<string, { value: string; line: number }>;
  /** every parsed var including duplicates, in file order */
  rawVars: { key: string; value: string; line: number }[];
  exampleKeys: Set<string>;
}

export interface Rule {
  name: string;
  run(ctx: AuditContext): Issue[];
}
