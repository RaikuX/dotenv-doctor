import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isTypeKind, TYPE_KINDS, type TypeKind } from "./types.js";

export interface FileConfig {
  env?: string;
  example?: string;
  disable?: string[];
  types?: Record<string, TypeKind>;
}

export interface LoadConfigOptions {
  cwd?: string;
  /** explicit --config path; if set, the file must exist and parse */
  configPath?: string;
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function readJsonFile(path: string): { value: unknown } | { error: string } | { missing: true } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (isEnoent(err)) return { missing: true };
    return { error: `cannot read ${path}: ${err instanceof Error ? err.message : err}` };
  }
  try {
    return { value: JSON.parse(raw) as unknown };
  } catch (err) {
    return { error: `invalid JSON in ${path}: ${err instanceof Error ? err.message : err}` };
  }
}

function parseFileConfig(
  raw: unknown,
  source: string,
): FileConfig | { error: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: `${source} must be a JSON object` };
  }
  const obj = raw as Record<string, unknown>;
  const out: FileConfig = {};

  if (obj.env != null) {
    if (typeof obj.env !== "string" || obj.env.trim() === "") {
      return { error: `${source}: "env" must be a non-empty string` };
    }
    out.env = obj.env;
  }
  if (obj.example != null) {
    if (typeof obj.example !== "string" || obj.example.trim() === "") {
      return { error: `${source}: "example" must be a non-empty string` };
    }
    out.example = obj.example;
  }
  if (obj.disable != null) {
    if (Array.isArray(obj.disable)) {
      if (!obj.disable.every((x) => typeof x === "string")) {
        return { error: `${source}: "disable" must be an array of strings` };
      }
      out.disable = obj.disable.map((s) => s.trim()).filter(Boolean);
    } else if (typeof obj.disable === "string") {
      out.disable = obj.disable.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      return { error: `${source}: "disable" must be a string or array of strings` };
    }
  }
  if (obj.types != null) {
    if (typeof obj.types !== "object" || obj.types === null || Array.isArray(obj.types)) {
      return { error: `${source}: "types" must be an object of key -> type` };
    }
    const types: Record<string, TypeKind> = {};
    for (const [key, value] of Object.entries(obj.types as Record<string, unknown>)) {
      if (typeof value !== "string" || !isTypeKind(value)) {
        return {
          error: `${source}: types.${key} must be one of ${TYPE_KINDS.join(", ")}`,
        };
      }
      types[key] = value;
    }
    out.types = types;
  }
  return out;
}

function overlay(base: FileConfig, over: FileConfig): FileConfig {
  return {
    env: over.env ?? base.env,
    example: over.example ?? base.example,
    disable: over.disable ?? base.disable,
    types: { ...(base.types ?? {}), ...(over.types ?? {}) },
  };
}

/**
 * Load config from package.json#dotenv-doctor (lowest precedence) then
 * `.dotenv-doctor.json` or an explicit --config path (highest file precedence).
 * CLI flags are applied by the caller on top of this result.
 */
export function loadConfig(
  options: LoadConfigOptions = {},
): FileConfig | { error: string } {
  const cwd = options.cwd ?? process.cwd();
  let merged: FileConfig = {};

  const pkgPath = join(cwd, "package.json");
  const pkg = readJsonFile(pkgPath);
  if ("error" in pkg) {
    // A broken package.json is only fatal if it is the only config source we
    // were asked to read; otherwise skip the field.
  } else if (!("missing" in pkg) && pkg.value && typeof pkg.value === "object" && !Array.isArray(pkg.value)) {
    const field = (pkg.value as Record<string, unknown>)["dotenv-doctor"];
    if (field !== undefined) {
      const parsed = parseFileConfig(field, `${pkgPath} "dotenv-doctor"`);
      if ("error" in parsed) return parsed;
      merged = overlay(merged, parsed);
    }
  }

  const explicit = options.configPath;
  const jsonPath = explicit
    ? isAbsolute(explicit)
      ? explicit
      : join(cwd, explicit)
    : join(cwd, ".dotenv-doctor.json");

  const file = readJsonFile(jsonPath);
  if ("missing" in file) {
    if (explicit) {
      return { error: `config file not found: ${jsonPath}` };
    }
    return merged;
  }
  if ("error" in file) return file;
  const parsed = parseFileConfig(file.value, jsonPath);
  if ("error" in parsed) return parsed;
  return overlay(merged, parsed);
}

