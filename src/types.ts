export type Severity = "error" | "warn";

export const TYPE_KINDS = ["port", "url", "email", "boolean", "string"] as const;
export type TypeKind = (typeof TYPE_KINDS)[number];

export function isTypeKind(value: string): value is TypeKind {
  return (TYPE_KINDS as readonly string[]).includes(value);
}

export interface Issue {
  rule: string;
  severity: Severity;
  key?: string;
  line?: number;
  /** env file path this finding refers to (relative when possible) */
  file?: string;
  /** git commit SHA when the finding comes from --history */
  commit?: string;
  message: string;
}

export interface AuditContext {
  envVars: Map<string, { value: string; line: number }>;
  /** every parsed var including duplicates, in file order */
  rawVars: { key: string; value: string; line: number }[];
  exampleKeys: Set<string>;
  /** optional per-key type annotations from config */
  types: Record<string, TypeKind>;
}

export interface Rule {
  name: string;
  run(ctx: AuditContext): Issue[];
}
