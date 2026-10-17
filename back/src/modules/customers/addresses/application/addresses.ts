import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PartialTrilingual } from '../../../../types.js';
import { decryptPii, encryptPii } from '../../../../platform/security/piiCrypto.js';

export type AddressKind = 'livraison' | 'facturation';

interface AddressDbRow {
  id: string;
  user_id: string;
  kind: AddressKind;
  label: string | null;
  /** At least one of recipient_name/company_name is always set (DB check
   * constraint) — a company address may still also carry a contact
   * person's name, so neither replaces the other. */
  recipient_name: string | null;
  company_name: string | null;
  line1: string;
  line2: string | null;
  delivery_notes: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone: string | null;
  is_default: boolean;
  /** false = one-time checkout address: kept for order/sticker snapshot,
   * omitted from GET /account/addresses (saved address book). */
  saved_for_future: boolean;
  /** One-time rows become consumed once a confirmed order uses them. */
  checkout_use_status: 'saved' | 'one_time_available' | 'one_time_consumed';
  checkout_privacy_session_id: string | null;
  pickup_points: PickupPointMap;
}

/** A provider-neutral pickup/locker reference, keyed by delivery-network
 * code. `metadata` is intentionally an open string map: providers expose
 * different immutable identifiers without turning this shared address
 * contract into a list of carrier-specific columns. */
export interface PickupPoint {
  id: string;
  /** The point's own public name ("Carrefour City …"), as shown by the
   * provider's picker. Belongs to the point, not to the customer: it is
   * rendered as the first line of a pickup address instead of being folded
   * into the customer-chosen `label`, and the client never lets it be
   * edited. Optional — addresses created before this existed have none. */
  name?: string;
  metadata?: Record<string, string>;
}

export type PickupPointMap = Record<string, PickupPoint>;

export interface AddressRow extends AddressDbRow {
  /** An address can belong to more than one delivery network at once — a
   * single physical pickup point can genuinely be registered with more
   * than one network (see the courier migration's own comment). Not a
   * column on `addresses` itself; joined in from `address_networks`. */
  networkCodes: string[];
}

/** Decrypt address PII string columns. `pickup_points` stays plaintext jsonb. */
function decryptAddressRow(row: AddressDbRow): AddressDbRow {
  return {
    ...row,
    label: decryptPii(row.label),
    recipient_name: decryptPii(row.recipient_name),
    company_name: decryptPii(row.company_name),
    line1: decryptPii(row.line1)!,
    line2: decryptPii(row.line2),
    delivery_notes: decryptPii(row.delivery_notes),
    postal_code: decryptPii(row.postal_code)!,
    city: decryptPii(row.city)!,
    phone: decryptPii(row.phone),
  };
}

async function attachNetworks(client: pg.Pool | pg.PoolClient, rows: AddressDbRow[]): Promise<AddressRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const { rows: networkRows } = await client.query<{ address_id: string; network_code: string }>(
    `select address_id, network_code from address_networks where address_id = any($1::uuid[])`,
    [ids],
  );
  const networksById = new Map<string, string[]>();
  for (const row of networkRows) {
    const list = networksById.get(row.address_id) ?? [];
    list.push(row.network_code);
    networksById.set(row.address_id, list);
  }
  return rows.map((row) => ({
    ...decryptAddressRow(row),
    networkCodes: networksById.get(row.id) ?? [],
  }));
}

/** Saved address book only — one-time checkout addresses are omitted
 * (still reachable by id for confirm/order snapshot). */
export async function listForUser(pool: pg.Pool, userId: string): Promise<AddressRow[]> {
  const { rows } = await pool.query<AddressDbRow>(
    `select * from addresses
     where user_id = $1 and saved_for_future
     order by is_default desc, created_at asc`,
    [userId],
  );
  return attachNetworks(pool, rows);
}

export async function getForUser(
  pool: pg.Pool,
  userId: string,
  addressId: string,
): Promise<AddressRow | undefined> {
  const { rows } = await pool.query<AddressDbRow>(`select * from addresses where id = $1 and user_id = $2`, [
    addressId,
    userId,
  ]);
  const row = rows[0];
  if (!row) return undefined;
  return (await attachNetworks(pool, [row]))[0];
}

/** Checkout-only lookup. A consumed one-time address remains encrypted for
 * its historical order, but can no longer be recovered for a new checkout. */
export async function getForCheckout(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  checkoutPrivacySessionId?: string,
): Promise<AddressRow | undefined> {
  const { rows } = await pool.query<AddressDbRow>(
    `select * from addresses
     where id = $1 and user_id = $2
       and (
         (saved_for_future and checkout_use_status = 'saved')
         or (not saved_for_future and checkout_use_status = 'one_time_available'
             and checkout_privacy_session_id = $3)
       )`,
    [addressId, userId, checkoutPrivacySessionId ?? null],
  );
  const row = rows[0];
  if (!row) return undefined;
  return (await attachNetworks(pool, [row]))[0];
}

export interface CountryRow {
  code: string;
  label: PartialTrilingual;
}

export async function listCountries(pool: pg.Pool): Promise<CountryRow[]> {
  const { rows } = await pool.query<CountryRow>(
    `select code, label from address_countries where enabled order by sort_order`,
  );
  return rows;
}

/** Labels for an explicit list of country codes (phone union, etc.). */
export async function listCountriesByCodes(pool: pg.Pool, codes: string[]): Promise<CountryRow[]> {
  if (codes.length === 0) return [];
  const { rows } = await pool.query<CountryRow>(
    `select code, label from address_countries where code = any($1::text[]) order by sort_order`,
    [codes],
  );
  return rows;
}

export async function setAddressCountryEnabled(
  pool: pg.Pool,
  code: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await pool.query(`update address_countries set enabled = $2 where code = $1`, [
    code,
    enabled,
  ]);
  return (result.rowCount ?? 0) === 1;
}

export interface CountryVocabEntry {
  label: PartialTrilingual;
  enabled: boolean;
}

/** Every country row, enabled or not — the shipping-country vocabulary as
 * the courier CLI's drift check sees it. `listCountries` above is the
 * customer-facing half, which is why it filters on `enabled`. */
export async function listCountryVocab(pool: pg.Pool): Promise<Record<string, CountryVocabEntry>> {
  const { rows } = await pool.query<{ code: string; label: PartialTrilingual; enabled: boolean }>(
    `select code, label, enabled from address_countries order by sort_order`,
  );
  return Object.fromEntries(rows.map((row) => [row.code, { label: row.label, enabled: row.enabled }]));
}

/** Upserts the shipping-country vocabulary from pamsurin-manager's
 * courier/data-countries.json — same object-keyed-by-code shape and same
 * "key order is sort_order" convention as data-networks.json.
 *
 * `disableMissing` never deletes. `addresses`, `orders`,
 * `guest_saved_addresses` and `courier_countries` all reference this table,
 * so a country a customer has ever ordered to cannot be removed without
 * taking that order's history with it. Dropping a country out of the file
 * therefore closes it (`enabled = false`, so it leaves the address form)
 * and leaves the row for its existing orders to keep pointing at. */
export async function syncCountries(
  pool: pg.Pool,
  countries: Record<string, CountryVocabEntry>,
  disableMissing: boolean,
): Promise<{ countries: number; disabledCountries: string[] }> {
  const entries = Object.entries(countries);
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const [index, [code, entry]] of entries.entries()) {
      await client.query(
        `insert into address_countries (code, label, enabled, sort_order) values ($1, $2, $3, $4)
         on conflict (code) do update
           set label = excluded.label, enabled = excluded.enabled, sort_order = excluded.sort_order`,
        [code, entry.label, entry.enabled, index],
      );
    }
    const disabledCountries = disableMissing
      ? (
          await client.query<{ code: string }>(
            `update address_countries set enabled = false
              where enabled and code <> all($1::text[])
              returning code`,
            [entries.map(([code]) => code)],
          )
        ).rows.map((row) => row.code)
      : [];
    await client.query('commit');
    return { countries: entries.length, disabledCountries };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export interface AddressInput {
  /** Immutable — set once at create, never accepted via AddressPatch (same
   * rule as networkCodes). A facturation address never gets a network. */
  kind: AddressKind;
  label?: string;
  /** At least one of recipientName/companyName must be set — validated in
   * account.routes.ts's addressInputFromBody. */
  recipientName?: string;
  companyName?: string;
  line1: string;
  line2?: string;
  /** Optional delivery instructions — livraison only; ignored/cleared for
   * facturation. */
  deliveryNotes?: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phone?: string;
  /** Defaults to `['home']` if empty for a livraison address — see
   * account.routes.ts. Always empty for a facturation address. */
  networkCodes: string[];
  pickupPoints?: PickupPointMap;
  isDefault?: boolean;
  /** Defaults to true. false = one-time checkout use (still stored for
   * order snapshot / stickers, hidden from the saved address list). */
  savedForFuture?: boolean;
}

async function replaceAddressNetworks(
  client: pg.PoolClient,
  addressId: string,
  networkCodes: string[],
): Promise<void> {
  await client.query(`delete from address_networks where address_id = $1`, [addressId]);
  for (const networkCode of networkCodes) {
    await client.query(`insert into address_networks (address_id, network_code) values ($1, $2)`, [
      addressId,
      networkCode,
    ]);
  }
}

/** The very first address of a given kind for a user always becomes that
 * kind's default, regardless of what was requested — there's no meaningful
 * "no default" UX state for someone with exactly one livraison (or
 * facturation) address. Every later add/edit/remove relies on the partial
 * unique index (addresses_user_kind_default_uidx) plus these transactions
 * to keep exactly one default (or zero, only transiently mid-transaction)
 * per (user, kind). */
export async function create(
  pool: pg.Pool,
  userId: string,
  input: AddressInput,
  checkoutPrivacySessionId?: string,
): Promise<AddressRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const savedForFuture = input.savedForFuture !== false;
    // Serialize default flips for this (user, kind). A plain SELECT FOR UPDATE
    // on existing rows does not block two concurrent "first address" inserts
    // (both see zero rows), which then collide on addresses_user_kind_default_uidx.
    await client.query(`select pg_advisory_xact_lock(87214, hashtext($1 || ':' || $2))`, [
      userId,
      input.kind,
    ]);
    // Default / "first address" only among the saved book — a one-time
    // checkout address must never become (or force) the account default.
    const { rows: existing } = await client.query(
      `select count(*)::int as count from addresses
       where user_id = $1 and kind = $2 and saved_for_future`,
      [userId, input.kind],
    );
    const isFirst = existing[0]!.count === 0;
    const willBeDefault = savedForFuture && (isFirst || !!input.isDefault);

    if (willBeDefault) {
      await client.query(
        `update addresses set is_default = false where user_id = $1 and kind = $2 and is_default`,
        [userId, input.kind],
      );
    }

    const { rows } = await client.query<AddressDbRow>(
      `insert into addresses (id, user_id, kind, label, recipient_name, company_name, line1, line2, delivery_notes, postal_code, city, country_code, phone, is_default, pickup_points, saved_for_future, checkout_use_status, checkout_privacy_session_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       returning *`,
      [
        randomUUID(),
        userId,
        input.kind,
        encryptPii(input.label ?? null),
        encryptPii(input.recipientName ?? null),
        encryptPii(input.companyName ?? null),
        encryptPii(input.line1),
        encryptPii(input.line2 ?? null),
        encryptPii(input.kind === 'facturation' ? null : (input.deliveryNotes ?? null)),
        encryptPii(input.postalCode),
        encryptPii(input.city),
        input.countryCode,
        encryptPii(input.phone ?? null),
        willBeDefault,
        input.kind === 'facturation' ? {} : (input.pickupPoints ?? {}),
        savedForFuture,
        savedForFuture ? 'saved' : 'one_time_available',
        savedForFuture ? null : (checkoutPrivacySessionId ?? null),
      ],
    );
    const row = decryptAddressRow(rows[0]!);
    // A facturation address has no network at all — the ['home'] fallback
    // only makes sense for a livraison address.
    const networkCodes =
      input.kind === 'facturation' ? [] : input.networkCodes.length > 0 ? input.networkCodes : ['home'];
    await replaceAddressNetworks(client, row.id, networkCodes);
    await client.query('commit');
    return { ...row, networkCodes };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export type AddressPatch = Partial<AddressInput>;

export async function update(
  pool: pg.Pool,
  userId: string,
  addressId: string,
  patch: AddressPatch,
): Promise<AddressRow | undefined> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (patch.isDefault) {
      await client.query(
        `update addresses set is_default = false
         where user_id = $1 and is_default
           and kind = (select kind from addresses where id = $2 and user_id = $1)`,
        [userId, addressId],
      );
    }
    // recipient_name/company_name are a pair: AddressFormModal always sends
    // both together whenever either is touched (never one without the
    // other), so — unlike every other field here — a coalesce would
    // silently resurrect whichever one the customer just intentionally
    // cleared (e.g. switching a company address back to an individual one).
    // Overwrite both directly whenever the request touched either.
    // line2 / delivery_notes use the same "key present → overwrite (incl.
    // null clear)" rule so removing those optional fields actually sticks.
    const identityTouched = 'recipientName' in patch || 'companyName' in patch;
    const line2Touched = 'line2' in patch;
    const deliveryNotesTouched = 'deliveryNotes' in patch;
    const { rows } = await client.query<AddressDbRow>(
      `update addresses
       set label = coalesce($3, label),
           recipient_name = ${identityTouched ? '$4' : 'coalesce($4, recipient_name)'},
           company_name = ${identityTouched ? '$13' : 'coalesce($13, company_name)'},
           line1 = coalesce($5, line1),
           line2 = ${line2Touched ? '$6' : 'coalesce($6, line2)'},
           postal_code = coalesce($7, postal_code),
           city = coalesce($8, city),
           country_code = coalesce($9, country_code),
           phone = coalesce($10, phone),
           is_default = coalesce($11, is_default),
           pickup_points = coalesce($12, pickup_points),
           delivery_notes = ${deliveryNotesTouched ? '$14' : 'coalesce($14, delivery_notes)'},
           updated_at = now()
       where id = $1 and user_id = $2
       returning *`,
      [
        addressId,
        userId,
        patch.label !== undefined ? encryptPii(patch.label ?? null) : null,
        identityTouched ? encryptPii(patch.recipientName ?? null) : null,
        patch.line1 !== undefined ? encryptPii(patch.line1) : null,
        line2Touched ? encryptPii(patch.line2 ?? null) : null,
        patch.postalCode !== undefined ? encryptPii(patch.postalCode) : null,
        patch.city !== undefined ? encryptPii(patch.city) : null,
        patch.countryCode ?? null,
        patch.phone !== undefined ? encryptPii(patch.phone ?? null) : null,
        patch.isDefault === true ? true : null,
        patch.pickupPoints,
        identityTouched ? encryptPii(patch.companyName ?? null) : null,
        deliveryNotesTouched ? encryptPii(patch.deliveryNotes ?? null) : null,
      ],
    );
    const row = rows[0];
    if (!row) {
      await client.query('commit');
      return undefined;
    }
    if (patch.networkCodes !== undefined && patch.networkCodes.length > 0) {
      await replaceAddressNetworks(client, addressId, patch.networkCodes);
    }
    await client.query('commit');
    return (await attachNetworks(pool, [row]))[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Deleting the current default auto-promotes another of the user's
 * addresses (most recently created) rather than leaving them with none —
 * see the plan's §9(j). */
export async function remove(pool: pg.Pool, userId: string, addressId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: deletedRows } = await client.query<{ is_default: boolean; kind: AddressKind }>(
      `delete from addresses where id = $1 and user_id = $2 returning is_default, kind`,
      [addressId, userId],
    );
    const deleted = deletedRows[0];
    if (deleted?.is_default) {
      await client.query(
        `update addresses set is_default = true
         where id = (
           select id from addresses
           where user_id = $1 and kind = $2 and saved_for_future
           order by created_at desc limit 1
         )`,
        [userId, deleted.kind],
      );
    }
    await client.query('commit');
    return !!deleted;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function setDefault(pool: pg.Pool, userId: string, addressId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `update addresses set is_default = false
       where user_id = $1 and is_default
         and kind = (select kind from addresses where id = $2 and user_id = $1)`,
      [userId, addressId],
    );
    const { rows } = await client.query(
      `update addresses set is_default = true
       where id = $1 and user_id = $2 and saved_for_future
       returning id`,
      [addressId, userId],
    );
    await client.query('commit');
    return rows.length > 0;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Deliberately allows a genuine zero-default state (unlike remove() above,
 * which auto-promotes another address so an incidental deletion never
 * breaks checkout) — this is an explicit customer choice, not an accidental
 * side effect, so checkout's own address auto-fill just falls back to
 * requiring an explicit pick instead of silently choosing one for them
 * (see CartPage.tsx). */
export async function unsetDefault(pool: pg.Pool, userId: string, addressId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `update addresses set is_default = false where id = $1 and user_id = $2 and is_default returning id`,
    [addressId, userId],
  );
  return rows.length > 0;
}
