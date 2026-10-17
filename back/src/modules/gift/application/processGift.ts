import type pg from 'pg';
import { config } from '../../../config/env.js';
import { isLanguage } from '../../../utils/language.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import {
  findOfferById,
  tryInsertReminderSend,
  updateOfferFields,
  type GiftOfferRow,
} from '../infrastructure/giftOfferRepo.js';
import { deleteGiftCart } from '../infrastructure/giftCart.js';
import { releaseGiftHold } from '../infrastructure/giftStock.js';
import {
  sendGiftCancelledMail,
  sendGiftReminderMail,
  sendGiftSelectReminderMail,
} from '../infrastructure/giftMail.js';
import { canExtendOffer, GIFT_EXTEND_DAYS } from '../domain/extend.js';
import { addDays, utcDayKey } from './clocks.js';

const BATCH = 100;
const ADVISORY = 87_216;

async function expireSelecting(client: pg.PoolClient): Promise<GiftOfferRow[]> {
  const settings = await getGiftSettings(client);
  const { rows } = await client.query<{ id: string }>(
    `select id from gift_offers
     where status = 'selecting'
       and offer_expires_at is not null and offer_expires_at <= now()
     order by offer_expires_at
     limit $1
     for update skip locked`,
    [BATCH],
  );
  const updated: GiftOfferRow[] = [];
  for (const row of rows) {
    updated.push(
      await updateOfferFields(client, row.id, {
        status: 'expired',
        receiverVisibleUntil: addDays(new Date(), settings.visibilityAfterTerminalDays),
      }),
    );
  }
  return updated;
}

async function releaseExpiredHolds(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `select sr.id from stock_reservations sr
     where sr.purpose = 'gift' and sr.state = 'held' and sr.expires_at <= now()
     order by sr.expires_at
     limit $1
     for update skip locked`,
    [BATCH],
  );
  for (const row of rows) {
    await releaseGiftHold(client, row.id);
  }
  return rows.length;
}

async function cancelUnpaid(client: pg.PoolClient): Promise<GiftOfferRow[]> {
  const settings = await getGiftSettings(client);
  const { rows } = await client.query<{
    id: string;
    cart_id: string | null;
    stock_reservation_id: string | null;
  }>(
    `select go.id, go.cart_id, go.stock_reservation_id
     from gift_offers go
     left join stock_reservations sr on sr.id = go.stock_reservation_id
     where go.status in ('awaiting_payment', 'paying')
       and go.pay_by_at is not null and go.pay_by_at <= now()
       and (sr.stripe_payment_intent_id is null)
     order by go.pay_by_at
     limit $1
     for update of go skip locked`,
    [BATCH],
  );
  const updated: GiftOfferRow[] = [];
  for (const row of rows) {
    await releaseGiftHold(client, row.stock_reservation_id);
    await deleteGiftCart(client, row.cart_id);
    updated.push(
      await updateOfferFields(client, row.id, {
        status: 'cancelled',
        stockReservationId: null,
        cartId: null,
        holdExpiresAt: null,
        receiverVisibleUntil: addDays(new Date(), settings.visibilityAfterTerminalDays),
      }),
    );
  }
  return updated;
}

export async function processGift(pool: pg.Pool): Promise<{
  expired: number;
  holdsReleased: number;
  cancelled: number;
  remindersSent: number;
}> {
  const client = await pool.connect();
  let expired = 0;
  let holdsReleased = 0;
  let cancelledOffers: GiftOfferRow[] = [];
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock($1)`, [ADVISORY]);
    expired = (await expireSelecting(client)).length;
    holdsReleased = await releaseExpiredHolds(client);
    cancelledOffers = await cancelUnpaid(client);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  for (const offer of cancelledOffers) {
    await sendGiftCancelledMail({
      to: offer.giverEmail,
      receiverName: offer.receiverName,
      language: offer.language,
    });
  }

  const remindersSent = await sendDueReminders(pool);
  return { expired, holdsReleased, cancelled: cancelledOffers.length, remindersSent };
}

async function sendDueReminders(pool: pg.Pool): Promise<number> {
  const { holdReminderBeforeMs, payReminderBeforeMs, selectReminderBeforeMs } = config.gift;
  const { rows: holdRows } = await pool.query<GiftOfferRowQuery>(
    `select id, language from gift_offers
     where status in ('awaiting_payment', 'paying')
       and hold_expires_at is not null
       and hold_expires_at > now()
       and hold_expires_at <= now() + make_interval(secs => $2::double precision / 1000)
     limit $1`,
    [BATCH, holdReminderBeforeMs],
  );
  const { rows: payRows } = await pool.query<GiftOfferRowQuery>(
    `select id, language from gift_offers
     where status in ('awaiting_payment', 'paying')
       and pay_by_at is not null
       and pay_by_at > now()
       and pay_by_at <= now() + make_interval(secs => $2::double precision / 1000)
     limit $1`,
    [BATCH, payReminderBeforeMs],
  );
  // Keyed on the expiry date rather than today: one mail per expiry, and a
  // "prolonger" click (new expiry) re-arms it for the next window.
  const { rows: selectRows } = await pool.query<GiftOfferRowQuery & { expiry_day: string }>(
    `select id, language, to_char(offer_expires_at at time zone 'UTC', 'YYYY-MM-DD') as expiry_day
     from gift_offers
     where status = 'selecting'
       and offer_expires_at is not null
       and offer_expires_at > now()
       and offer_expires_at <= now() + make_interval(secs => $2::double precision / 1000)
     limit $1`,
    [BATCH, selectReminderBeforeMs],
  );
  let sent = 0;
  const day = utcDayKey();
  const settings = selectRows.length > 0 ? await getGiftSettings(pool) : null;
  for (const row of selectRows) {
    if (!(await tryInsertReminderSend(pool, row.id, 'select', row.expiry_day))) continue;
    const offer = await findOfferById(pool, row.id);
    if (!offer) continue;
    const extendable =
      !!settings &&
      canExtendOffer(offer.status, offer.offerExpiresAt, settings.extendCeilingDays, new Date());
    await sendGiftSelectReminderMail({
      to: offer.giverEmail,
      giverToken: offer.giverToken,
      language: isLanguage(offer.language) ? offer.language : 'fr',
      receiverName: offer.receiverName,
      validUntil: offer.offerExpiresAt,
      extendDays: extendable ? GIFT_EXTEND_DAYS : null,
    });
    sent += 1;
  }
  for (const row of holdRows) {
    if (!(await tryInsertReminderSend(pool, row.id, 'hold', day))) continue;
    const offer = await findOfferById(pool, row.id);
    if (!offer) continue;
    await sendGiftReminderMail({
      to: offer.giverEmail,
      giverToken: offer.giverToken,
      language: isLanguage(offer.language) ? offer.language : 'fr',
      kind: 'hold',
    });
    sent += 1;
  }
  for (const row of payRows) {
    if (!(await tryInsertReminderSend(pool, row.id, 'pay', day))) continue;
    const offer = await findOfferById(pool, row.id);
    if (!offer) continue;
    await sendGiftReminderMail({
      to: offer.giverEmail,
      giverToken: offer.giverToken,
      language: isLanguage(offer.language) ? offer.language : 'fr',
      kind: 'pay',
    });
    sent += 1;
  }
  return sent;
}

interface GiftOfferRowQuery {
  id: string;
  language: string;
}
