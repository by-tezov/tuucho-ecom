import { createHmac, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../../../config/env.js';
import { ARGON2_OPTIONS, loadArgon2 } from '../../identity/application/password.js';
import { hashOpaqueToken } from '../../../platform/security/opaqueToken.js';
import { pinDigestInput } from '../domain/pin.js';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const LEGACY_SHA256_HEX = /^[0-9a-f]{64}$/i;

function pepperedPinMaterial(offerId: string, pin: string): Buffer {
  return createHmac('sha256', config.pii.lookupPepper)
    .update('gift_pin_scrypt_v1\0', 'utf8')
    .update(pinDigestInput(offerId, pin), 'utf8')
    .digest();
}

/** New PIN digests: argon2id of the peppered `{offer_id}:pin:{pin}` material. */
export async function hashGiftPin(offerId: string, pin: string): Promise<string> {
  const argon2 = await loadArgon2();
  return argon2.hash(pepperedPinMaterial(offerId, pin), ARGON2_OPTIONS);
}

/**
 * Verifies a PIN against stored digest. Supports:
 * - `$argon2id$…` peppered argon2id (current)
 * - `gscrypt1$…` peppered scrypt (lazy upgrade on success)
 * - legacy 64-hex SHA-256 of `hashOpaqueToken(pinDigestInput(...))` (lazy upgrade)
 */
export async function verifyGiftPin(
  offerId: string,
  pin: string,
  storedHash: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const stored = storedHash.trim();
  if (!stored) return { ok: false, needsRehash: false };

  if (stored.startsWith('$argon2')) {
    try {
      const argon2 = await loadArgon2();
      const ok = await argon2.verify(stored, pepperedPinMaterial(offerId, pin));
      return { ok, needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }

  if (stored.startsWith('gscrypt1$')) {
    try {
      const parts = stored.split('$');
      if (parts.length !== 6) return { ok: false, needsRehash: false };
      const [, nStr, rStr, pStr, saltHex, hashHex] = parts as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const derivedKey = await scrypt(pepperedPinMaterial(offerId, pin), salt, expected.length, {
        N: Number(nStr),
        r: Number(rStr),
        p: Number(pStr),
      });
      const ok = derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
      return { ok, needsRehash: ok };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }

  if (LEGACY_SHA256_HEX.test(stored)) {
    const legacy = hashOpaqueToken(pinDigestInput(offerId, pin));
    const a = Buffer.from(legacy, 'utf8');
    const b = Buffer.from(stored.toLowerCase(), 'utf8');
    const ok = a.length === b.length && timingSafeEqual(a, b);
    return { ok, needsRehash: ok };
  }

  createHash('sha256').update(stored).digest();
  return { ok: false, needsRehash: false };
}
