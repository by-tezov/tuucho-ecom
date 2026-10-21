import type { Request } from 'express';
import type pg from 'pg';
import { generateOpaqueToken, hashOpaqueToken } from '@kernel/back/platform/security/opaqueToken';
import { failGift } from '../domain/errors.js';
import { parseAccessPin } from '../domain/pin.js';
import { giftPinBackoffSec, giftPinRetryAfterSec, giftPinRetryAt } from '../domain/pinThrottle.js';
import type { GiftOfferRow } from '../infrastructure/giftOfferRepo.js';
import { updateOfferFields } from '../infrastructure/giftOfferRepo.js';
import { clearPinAttempts, lockPinAttempts, recordPinFailure } from '../infrastructure/giftPinAttemptRepo.js';
import { findValidPinSession, insertPinSession, type GiftPinRole } from '../infrastructure/giftPinRepo.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { addHours } from './clocks.js';
import { hashGiftPin, verifyGiftPin } from './pinHash.js';

function throttleExtras(retryAfterSec: number, retryAt: Date | null) {
  return {
    retryAfterSec,
    ...(retryAt ? { retryAt: retryAt.toISOString() } : {}),
  };
}

function pinGrantFromRequest(req: Request): string | undefined {
  const raw = req.header('x-gift-pin-token');
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function giverOwnsSession(req: Request, offer: GiftOfferRow): boolean {
  if (!req.user) return false;
  if (offer.giverUserId && req.user.id === offer.giverUserId) return true;
  const sessionEmail = req.user.email.trim().toLowerCase();
  const giverEmail = offer.giverEmail.trim().toLowerCase();
  return sessionEmail.length > 0 && sessionEmail === giverEmail;
}

export async function assertGiftPinSession(
  db: pg.Pool | pg.PoolClient,
  req: Request,
  offer: GiftOfferRow,
  role: GiftPinRole,
): Promise<void> {
  if (!offer.pinHash) return;
  if (role === 'giver' && giverOwnsSession(req, offer)) return;
  const grant = pinGrantFromRequest(req);
  if (!grant) failGift('gift_pin_required');
  const ok = await findValidPinSession(db, offer.id, role, hashOpaqueToken(grant));
  if (!ok) failGift('gift_pin_required');
}

export async function unlockGiftPin(
  pool: pg.Pool,
  offer: GiftOfferRow,
  role: GiftPinRole,
  rawPin: unknown,
): Promise<{ pinToken: string; expiresAt: Date }> {
  if (!offer.pinHash) failGift('invalid_request');
  const settings = await getGiftSettings(pool);
  const freeFailures = settings.pinFreeFailures;
  const maxFailures = settings.pinMaxFailures;
  const pin = parseAccessPin(rawPin);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const attempts = await lockPinAttempts(client, offer.id, role);
    const now = new Date();

    if (attempts.failedCount >= maxFailures) {
      await client.query('rollback');
      failGift('gift_pin_locked');
    }

    const waitSec = giftPinRetryAfterSec(attempts.nextAllowedAt, now);
    if (waitSec > 0) {
      await client.query('rollback');
      failGift('gift_pin_throttled', throttleExtras(waitSec, attempts.nextAllowedAt));
    }

    if (!pin) {
      await rejectPin(client, offer.id, role, now, attempts.failedCount, freeFailures, maxFailures);
    }

    const verified = await verifyGiftPin(offer.id, pin!, offer.pinHash.trim());
    if (!verified.ok) {
      await rejectPin(client, offer.id, role, now, attempts.failedCount, freeFailures, maxFailures);
    }

    if (verified.needsRehash) {
      const nextHash = await hashGiftPin(offer.id, pin!);
      await updateOfferFields(client, offer.id, { pinHash: nextHash });
    }

    await clearPinAttempts(client, offer.id, role);
    const pinToken = generateOpaqueToken();
    const expiresAt = addHours(new Date(), settings.lockSessionTtlHours);
    await insertPinSession(client, offer.id, role, hashOpaqueToken(pinToken), expiresAt);
    await client.query('commit');
    return { pinToken, expiresAt };
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* already rolled back or never began */
    }
    throw error;
  } finally {
    client.release();
  }
}

async function rejectPin(
  db: pg.PoolClient,
  offerId: string,
  role: GiftPinRole,
  now: Date,
  previousFailedCount: number,
  freeFailures: number,
  maxFailures: number,
): Promise<never> {
  const nextCount = previousFailedCount + 1;
  if (nextCount >= maxFailures) {
    const recorded = await recordPinFailure(db, offerId, role, null);
    await db.query('commit');
    if (recorded.failedCount >= maxFailures) failGift('gift_pin_locked');
  }
  const backoffSec = giftPinBackoffSec(nextCount, freeFailures);
  const nextAllowedAt = giftPinRetryAt(now, backoffSec);
  const recorded = await recordPinFailure(db, offerId, role, nextAllowedAt);
  await db.query('commit');
  if (recorded.failedCount >= maxFailures) failGift('gift_pin_locked');
  if (backoffSec > 0) {
    failGift('gift_pin_throttled', throttleExtras(backoffSec, recorded.nextAllowedAt));
  }
  failGift('gift_pin_invalid');
}
