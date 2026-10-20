import { decryptJsonPii, encryptJsonPii } from '../../../platform/security/piiCrypto.js';

const SEAL_PREFIX = 'v1:';

/** JSONB string produced by `encryptJsonPii` of the whole secrets map. */
export function isSealedPluginSecrets(stored: unknown): stored is string {
  return typeof stored === 'string' && stored.startsWith(SEAL_PREFIX);
}

function asSecretMap(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) out[key] = entry;
  }
  return out;
}

/** Leftover plaintext JSONB object with at least one non-empty secret. */
export function pluginSecretsNeedSeal(stored: unknown): boolean {
  return (
    typeof stored === 'object' &&
    stored !== null &&
    !Array.isArray(stored) &&
    Object.keys(asSecretMap(stored as Record<string, unknown>)).length > 0
  );
}

/** Decrypt a sealed column, or accept a leftover plaintext object. Never logs values. */
export function unsealPluginSecrets(stored: unknown, keyRaw?: string): Record<string, string> {
  if (stored == null) return {};
  if (isSealedPluginSecrets(stored)) {
    const parsed = decryptJsonPii<unknown>(stored, keyRaw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return asSecretMap(parsed as Record<string, unknown>);
  }
  if (typeof stored === 'object' && !Array.isArray(stored)) {
    return asSecretMap(stored as Record<string, unknown>);
  }
  throw new Error('Unsupported plugin secrets column (expected sealed v1: ciphertext or leftover object).');
}

export function sealPluginSecrets(secrets: Record<string, string>, keyRaw?: string): string {
  const sealed = encryptJsonPii(secrets, keyRaw);
  if (!sealed) throw new Error('Failed to seal plugin secrets.');
  return sealed;
}
