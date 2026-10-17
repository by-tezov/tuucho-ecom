import { createHash, createPublicKey, timingSafeEqual, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../../config/env.js';

export interface VerifiedAppleProfile {
  sub: string;
  /** Present on first authorization; may be omitted on later Sign in with Apple. */
  email: string | undefined;
  emailVerified: boolean;
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

type AppleJwk = {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
};

let jwksCache: { fetchedAt: number; keys: AppleJwk[] } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

export function isAppleSignInConfigured(): boolean {
  return Boolean(config.apple.clientId);
}

async function loadAppleJwks(): Promise<AppleJwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch(APPLE_JWKS_URL);
  if (!response.ok) {
    throw new Error('invalid_apple_token');
  }
  const body = (await response.json()) as { keys?: AppleJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('invalid_apple_token');
  }
  jwksCache = { fetchedAt: now, keys: body.keys };
  return body.keys;
}

async function applePublicKeyForKid(kid: string): Promise<KeyObject> {
  const keys = await loadAppleJwks();
  let jwk = keys.find((key) => key.kid === kid);
  if (!jwk) {
    jwksCache = null;
    const refreshed = await loadAppleJwks();
    jwk = refreshed.find((key) => key.kid === kid);
  }
  if (!jwk) {
    throw new Error('invalid_apple_token');
  }
  return createPublicKey({ key: jwk, format: 'jwk' });
}

function appleEmailVerified(value: unknown): boolean {
  return value === true || value === 'true';
}

/** SHA-256 hex of the client raw nonce (what Apple JS receives in `nonce`). */
function hashAppleNonce(rawNonce: string): string {
  return createHash('sha256').update(rawNonce, 'utf8').digest('hex');
}

function assertAppleNonce(payload: jwt.JwtPayload, rawNonce: string): void {
  const claimed = typeof payload.nonce === 'string' ? payload.nonce : '';
  if (!claimed) {
    throw new Error('invalid_apple_token');
  }
  const expected = hashAppleNonce(rawNonce);
  const claimedBuf = Buffer.from(claimed, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (claimedBuf.length !== expectedBuf.length || !timingSafeEqual(claimedBuf, expectedBuf)) {
    throw new Error('invalid_apple_token');
  }
}

/** Verify an Apple-signed JWS (identity token or S2S notification) with JWKS. */
export async function verifyAppleJws(token: string, audiences: string | string[]): Promise<jwt.JwtPayload> {
  const audienceList = (Array.isArray(audiences) ? audiences : [audiences])
    .map((value) => value.trim())
    .filter(Boolean);
  if (audienceList.length === 0) {
    throw new Error('invalid_apple_token');
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('invalid_apple_token');
  }

  const publicKey = await applePublicKeyForKid(decoded.header.kid);
  try {
    const audienceOption: jwt.VerifyOptions['audience'] =
      audienceList.length === 1 ? audienceList[0] : (audienceList as [string, ...string[]]);
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      audience: audienceOption,
      issuer: APPLE_ISSUER,
    }) as jwt.JwtPayload;
  } catch {
    throw new Error('invalid_apple_token');
  }
}

/**
 * Verifies a Sign in with Apple identity token (JWT) from the browser.
 * `rawNonce` is the client-generated value; the front must pass
 * `sha256(rawNonce)` hex to Apple JS and the same raw string to this API.
 */
export async function verifyAppleIdentityToken(
  idToken: string,
  rawNonce: string,
): Promise<VerifiedAppleProfile> {
  const clientId = config.apple.clientId;
  if (!clientId) {
    throw new Error('apple_sign_in_disabled');
  }
  if (!rawNonce || typeof rawNonce !== 'string') {
    throw new Error('invalid_apple_token');
  }

  const payload = await verifyAppleJws(idToken, clientId);
  assertAppleNonce(payload, rawNonce);

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('invalid_apple_token');
  }

  const rawEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;
  if (rawEmail && !appleEmailVerified(payload.email_verified)) {
    throw new Error('invalid_apple_token');
  }

  return {
    sub: payload.sub,
    email: rawEmail || undefined,
    emailVerified: rawEmail ? true : false,
  };
}
