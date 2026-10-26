import { createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type argon2Module from 'argon2';
import { config } from '../../../config/env.js';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Node core's scrypt was the fallback while argon2's prebuilt binary crashed
 * on LWS shared hosting ("GLIBC_2.34 not found") — confirmed on 2026-09-11
 * that argon2@0.41.1 (unlike 0.43.0+, which switched to a build requiring
 * glibc 2.34) loads fine against the host's glibc 2.28. New hashes use
 * argon2; `verifyPassword` below still decodes `scryptp1$…` / `scrypt$…`
 * hashes already stored from before this migration, and a successful
 * password login rewrite upgrades those rows to argon2id. */

/** OWASP's second-tier argon2id recommendation (19 MiB, t=2, p=1) rather than
 * its 128MB-plus first tier — this deploys to memory-constrained LWS shared
 * hosting. DO NOT bump argon2's version or these costs without first
 * SSH-verifying on the actual LWS host: newer argon2 releases (0.43.0+) ship
 * prebuilt binaries requiring glibc 2.34, which the host does not have, and
 * there is no compiler on the host new enough to build from source instead
 * (g++ 8.5 rejects the module's required -std=gnu++20). A silent binary
 * mismatch crashes the whole process at import time. */
export const ARGON2_OPTIONS = {
  // argon2.argon2id, written as its value so building the options does not
  // load the module (see loadArgon2).
  type: 2 as typeof argon2Module.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/** Domain-separated password material. Reusing the already-required private
 * lookup pepper avoids a new deployment secret while ensuring the bytes fed
 * to the hash function are unrelated to email/OTP HMAC inputs. A
 * database-only leak can no longer verify guesses without the server-side
 * secret. */
/** argon2 is a native addon, loaded on the first hash or verify instead of
 * at server start: Passenger on the LWS host stops an idle app after a few
 * seconds, so most visitors meet a cold start, and loading it there cost
 * ~0.12s of every one of them (tuucho/docs/command/01-dev-build-deploy.md). */
let argon2Loaded: Promise<typeof argon2Module> | undefined;

export function loadArgon2(): Promise<typeof argon2Module> {
  argon2Loaded ??= import('argon2').then((mod) => mod.default);
  return argon2Loaded;
}

function pepperedPassword(plain: string): Buffer {
  return createHmac('sha256', config.pii.lookupPepper)
    .update('password_scrypt_v1\0', 'utf8')
    .update(plain, 'utf8')
    .digest();
}

export async function hashPassword(plain: string): Promise<string> {
  const argon2 = await loadArgon2();
  return argon2.hash(pepperedPassword(plain), ARGON2_OPTIONS);
}

export function isLegacyPasswordHash(hash: string): boolean {
  return hash.startsWith('scrypt$') || hash.startsWith('scryptp1$');
}

/** Rewrites a leftover scrypt row to argon2id. Failures are swallowed so a
 * successful login or step-up is never blocked by the upgrade write. */
export async function rewriteLegacyPasswordHash(
  stored: string,
  plain: string,
  write: (nextHash: string) => Promise<void>,
): Promise<void> {
  if (!isLegacyPasswordHash(stored)) return;
  try {
    await write(await hashPassword(plain));
  } catch {
    /* leftover scrypt; the login itself already succeeded */
  }
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    if (hash.startsWith('$argon2')) {
      const argon2 = await loadArgon2();
      return await argon2.verify(hash, pepperedPassword(plain));
    }
    const parts = hash.split('$');
    if (parts.length !== 6 || (parts[0] !== 'scrypt' && parts[0] !== 'scryptp1')) return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts as [string, string, string, string, string, string];
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const passwordMaterial = parts[0] === 'scryptp1' ? pepperedPassword(plain) : plain;
    const derivedKey = await scrypt(passwordMaterial, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}

export type PasswordComplexityViolation =
  'tooShort' | 'tooLong' | 'missingUppercase' | 'missingLowercase' | 'missingDigit' | 'missingSpecial';

/** Traditional complexity rules (length + character-class mix) rather than
 * NIST's modern breach-list approach — this project's deliberate choice.
 * Returns every violated rule, empty array when the password passes.
 * `maxLength` caps input before hashing (CPU DoS on megabyte passwords). */
export function validatePasswordComplexity(
  plain: string,
  minLength: number,
  maxLength: number,
): PasswordComplexityViolation[] {
  const violations: PasswordComplexityViolation[] = [];
  if (plain.length < minLength) violations.push('tooShort');
  if (plain.length > maxLength) violations.push('tooLong');
  if (!/[A-Z]/.test(plain)) violations.push('missingUppercase');
  if (!/[a-z]/.test(plain)) violations.push('missingLowercase');
  if (!/[0-9]/.test(plain)) violations.push('missingDigit');
  if (!/[^A-Za-z0-9]/.test(plain)) violations.push('missingSpecial');
  return violations;
}

/** Fixed hash used only to equalize login timing when the email is unknown —
 * never compared for real authentication. Generated once per process with
 * the same parameters as hashPassword. */
let timingDummyHashPromise: Promise<string> | undefined;

export function timingDummyPasswordHash(): Promise<string> {
  if (!timingDummyHashPromise) {
    timingDummyHashPromise = hashPassword('timing-oracle-dummy-not-a-real-password');
  }
  return timingDummyHashPromise;
}
