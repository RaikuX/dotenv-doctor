import { maskFor } from "../mask.js";
import type { Issue, Rule } from "../types.js";

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s"']+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_EMAIL_RE = /^[^<>]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/;
const BOOL_OK = new Set(["true", "false", "1", "0", "yes", "no", "on", "off"]);
const NODE_ENV_OK = new Set(["development", "production", "test"]);

function looksLikeEmail(value: string): boolean {
  const inner = /^.*<([^>]+)>$/.exec(value);
  const candidate = inner ? inner[1] : value.trim();
  return EMAIL_RE.test(candidate) || DISPLAY_NAME_EMAIL_RE.test(value.trim());
}

function isPortKey(key: string): boolean {
  return /(^|_)PORT(_|$)/i.test(key);
}
function isUrlKey(key: string): boolean {
  return /(_URL|_URI|_ENDPOINT|_HOST_URL|URL_|URI_)/i.test(key);
}
function isEmailKey(key: string): boolean {
  return /(^|_)(EMAIL|MAIL)(_|$)/i.test(key) && !/(SMTP_HOST|MAILER_PATH|FROM_NAME)/i.test(key);
}
function isBoolKey(key: string): boolean {
  return /(_ENABLED?|_DEBUG|_VERBOSE|_DRY_RUN|^DEBUG$)/i.test(key);
}

export const typeRule: Rule = {
  name: "type",
  run({ envVars }) {
    const issues: Issue[] = [];
    for (const [key, meta] of envVars) {
      const value = meta.value.trim();
      if (value === "") continue;

      const shown = (v: string) => maskFor(key, v, (s) => (s.length <= 8 ? s : s.slice(0, 8) + "…"));
      if (isPortKey(key) && !/^\d{1,5}$/.test(value)) {
        issues.push(issue(key, meta.line, `"${key}" looks like a port but "${shown(value)}" is not numeric`));
      } else if (isUrlKey(key) && !URL_RE.test(value)) {
        issues.push(issue(key, meta.line, `"${key}" should be a valid URL (scheme://host) but got "${shown(value)}"`));
      } else if (isEmailKey(key) && !looksLikeEmail(value)) {
        issues.push(issue(key, meta.line, `"${key}" should be an email address but got "${shown(value)}"`));
      } else if (/^NODE_ENV$/i.test(key) && !NODE_ENV_OK.has(value.toLowerCase())) {
        issues.push(issue(key, meta.line, `"${key}" should be development, production or test but got "${shown(value)}"`));
      } else if (isBoolKey(key) && !BOOL_OK.has(value.toLowerCase())) {
        issues.push(issue(key, meta.line, `"${key}" should be a boolean-like value (true/false/1/0/yes/no) but got "${shown(value)}"`));
      }
    }
    return issues;
  },
};

function issue(key: string, line: number, message: string): Issue {
  return { rule: "type", severity: "warn", key, line, message };
}

