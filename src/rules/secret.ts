import type { Issue, Rule } from "../types.js";

interface Signature {
  id: string;
  regex: RegExp;
  provider: string;
  requireSecretKeyName?: boolean;
}

const SECRET_KEY_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;

const SIGNATURES: Signature[] = [
  {
    id: "aws-access-key",
    provider: "AWS access key",
    regex: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
    requireSecretKeyName: true,
  },
  { id: "stripe-live", provider: "Stripe live key", regex: /\b[sr]k_live_[0-9a-zA-Z]{20,}\b/ },
  { id: "stripe-webhook", provider: "Stripe webhook secret", regex: /\bwhsec_[0-9a-zA-Z]{20,}\b/, requireSecretKeyName: true },
  { id: "github-token", provider: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/ },
  { id: "github-pat", provider: "GitHub fine-grained PAT", regex: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/ },
  { id: "openai-key", provider: "OpenAI API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b/ },
  { id: "openai-legacy", provider: "OpenAI API key (legacy format)", regex: /\bsk-[A-Za-z0-9]{48}\b/, requireSecretKeyName: true },
  { id: "anthropic-key", provider: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/ },
  { id: "sendgrid-key", provider: "SendGrid API key", regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { id: "npm-token", provider: "npm publish token", regex: /\bnpm_[A-Za-z0-9]{36}\b/, requireSecretKeyName: true },
  { id: "pypi-token", provider: "PyPI token", regex: /\bpypi-[A-Za-z0-9_-]{60,}\b/, requireSecretKeyName: true },
  { id: "slack-token", provider: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "google-api", provider: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/, requireSecretKeyName: true },
  { id: "private-key", provider: "embedded private key", regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { id: "jwt", provider: "JWT", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, requireSecretKeyName: true },
];

const HIGH_ENTROPY = /^(?=.*[a-z])(?=.*[A-Z0-9])[A-Za-z0-9+/_=-]{40,}$/;

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export const secretRule: Rule = {
  name: "secret",
  run({ envVars }) {
    const issues: Issue[] = [];
    for (const [key, meta] of envVars) {
      if (meta.value.trim() === "") continue;
      const value = meta.value.trim();

      for (const sig of SIGNATURES) {
        if (!sig.regex.test(value)) continue;
        if (sig.requireSecretKeyName && !SECRET_KEY_NAME.test(key)) continue;
        issues.push({
          rule: this.name,
          severity: "error",
          key,
          line: meta.line,
          message: `"${key}" matches a real ${sig.provider} format — rotate this credential immediately and remove it from the file`,
        });
        break;
      }

      if (
        issues.some((i) => i.key === key) ||
        !SECRET_KEY_NAME.test(key)
      ) {
        continue;
      }

      if (
        value.length >= 32 &&
        HIGH_ENTROPY.test(value) &&
        shannonEntropy(value) >= 4.5 &&
        !/^(sha256|sha512|md5)-?/i.test(value)
      ) {
        issues.push({
          rule: this.name,
          severity: "warn",
          key,
          line: meta.line,
          message: `"${key}" contains a high-entropy string that looks like a committed credential`,
        });
      }
    }
    return issues;
  },
};
