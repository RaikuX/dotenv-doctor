export interface EnvVar {
  key: string;
  value: string;
  line: number;
}

export interface ParseResult {
  vars: EnvVar[];
  errors: string[];
}

const LINE_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function countUnescapedQuotes(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length && s[i + 1] === '"') {
      i++;
      continue;
    }
    if (s[i] === '"') count++;
  }
  return count;
}

function startsOpenDoubleQuote(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  return trimmed.startsWith('"') && countUnescapedQuotes(trimmed) % 2 === 1;
}

function extractQuoted(
  rawValue: string,
): { value: string; rest: string } | null {
  const trimmed = rawValue.trim();
  const m = /^"((?:[^"\\]|\\.)*)"(.*)$/.exec(trimmed);
  if (!m) return null;
  return { value: m[1].replace(/\\"/g, '"'), rest: m[2] };
}

export function parseEnvFile(content: string): ParseResult {
  const vars: EnvVar[] = [];
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const match = LINE_RE.exec(raw);
    if (!match) {
      if (/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*$/.test(raw)) {
        errors.push(`Line ${i + 1}: key has no value (missing "=")`);
      } else if (!raw.includes("=")) {
        errors.push(`Line ${i + 1}: invalid entry`);
      }
      continue;
    }

    const [, key, rawValue] = match;
    let lineEnd = i;

    if (startsOpenDoubleQuote(rawValue)) {
      let joined = rawValue;
      while (countUnescapedQuotes(joined) % 2 === 1 && lineEnd + 1 < lines.length) {
        lineEnd++;
        joined += "\n" + lines[lineEnd];
      }
      if (countUnescapedQuotes(joined) % 2 === 1) {
        errors.push(
          `Line ${i + 1}: unterminated double-quoted value for "${key}"`,
        );
        continue;
      }
      const extracted = extractQuoted(joined);
      if (extracted) {
        const inlineComment = extracted.rest.trim();
        if (inlineComment !== "" && !inlineComment.startsWith("#")) {
          errors.push(
            `Line ${i + 1}: unexpected content after closing quote in "${key}"`,
          );
        }
        vars.push({ key, value: extracted.value, line: i + 1 });
        i = lineEnd;
        continue;
      }
    }

    let value = rawValue.trim();

    const doubleQuoted = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(value);
    if (doubleQuoted) {
      value = doubleQuoted[1].replace(/\\"/g, '"');
    } else {
      const singleQuoted = /^'([\s\S]*)'\s*(?:#.*)?$/.exec(value);
      if (singleQuoted) {
        value = singleQuoted[1];
      } else {
        const inlineComment = /\s+#/.exec(value);
        if (inlineComment) {
          value = value.slice(0, inlineComment.index).trim();
        }
      }
    }

    vars.push({ key, value, line: i + 1 });
  }

  return { vars, errors };
}
