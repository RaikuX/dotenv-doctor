import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnvFile } from "./parser.js";

export interface FixResult {
  /** keys appended to the env file */
  addedToEnv: string[];
  /** keys appended to the example file */
  documentedInExample: string[];
  /** example file was created from scratch */
  createdExample: boolean;
}

function detectEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/** atomic-ish write: content lands via rename so a crash can't truncate the target */
function safeWrite(path: string, content: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

function appendKeys(
  path: string,
  original: string,
  keys: string[],
): void {
  const eol = detectEol(original);
  let base = original;
  if (base !== "" && !base.endsWith("\n")) base += eol;
  const addition = keys.map((k) => `${k}=`).join(eol) + eol;
  safeWrite(path, base + addition);
}

/**
 * Safely syncs env/example in both directions without ever removing anything:
 *  - keys declared in the example but absent from the env are appended to the env
 *  - keys present in the env but undocumented are appended to the example
 * Existing lines, comments and ordering are left untouched.
 */
export function applyFix(
  envPath: string,
  examplePath: string,
): FixResult | { error: string } {
  if (resolve(envPath) === resolve(examplePath)) {
    return { error: "env and example point to the same file" };
  }

  let envContent: string;
  let exContent: string;
  let exampleExists = true;

  try {
    envContent = readFileSync(envPath, "utf8");
  } catch {
    return { error: `cannot read ${envPath}` };
  }
  try {
    exContent = readFileSync(examplePath, "utf8");
  } catch {
    exampleExists = false;
    exContent = "";
  }

  const envParsed = parseEnvFile(envContent);
  const exParsed = exampleExists ? parseEnvFile(exContent) : { vars: [], errors: [] };
  if (envParsed.errors.length > 0 || exParsed.errors.length > 0) {
    return {
      error:
        "refusing to fix files with syntax errors — resolve them first:\n  " +
        [...envParsed.errors, ...exParsed.errors].join("\n  "),
    };
  }

  const result: FixResult = {
    addedToEnv: [],
    documentedInExample: [],
    createdExample: !exampleExists,
  };

  // 1) append example-declared keys missing from the env
  const envKeys = new Set(envParsed.vars.map((v) => v.key));
  result.addedToEnv = exParsed.vars.map((v) => v.key).filter((k) => !envKeys.has(k));
  if (result.addedToEnv.length > 0) {
    appendKeys(envPath, envContent, result.addedToEnv);
    envContent = readFileSync(envPath, "utf8");
  }

  // 2) document env keys missing from the example
  const envAll = parseEnvFile(envContent);
  const exKeys = new Set(exParsed.vars.map((v) => v.key));
  result.documentedInExample = envAll.vars
    .map((v) => v.key)
    .filter((k) => !exKeys.has(k));
  if (result.documentedInExample.length > 0) {
    appendKeys(examplePath, exContent, result.documentedInExample);
  }

  return result;
}
