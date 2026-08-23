const SECRET_KEY_NAME =
  /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|WEBHOOK|PRIVATE|CERT|SIGNATURE|SESSION|SALT|OTP)/i;

export function isSecretNamedKey(key: string): boolean {
  return SECRET_KEY_NAME.test(key);
}

/**
 * Masking policy for user-facing messages:
 *  - values under secret-named keys are never shown, not even partially
 *  - other values may show a short contextual preview via `fallback`
 */
export function maskFor(
  key: string,
  value: string,
  fallback: (v: string) => string,
): string {
  const v = value.trim();
  if (isSecretNamedKey(key)) return "*".repeat(Math.min(Math.max(v.length, 4), 12));
  return fallback(v);
}
