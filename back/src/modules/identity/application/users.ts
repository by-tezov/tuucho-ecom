import { randomUUID } from 'node:crypto';
import { SUPER_ADMIN_ROLE } from '../domain/staffPermissions.js';
import type { AuthUser } from '../../../contract/identity.js';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { recordAccountCreatedEvents } from './identityHistory.js';
import {
  APPLE_IDENTITY,
  clearSocialIdentity,
  FACEBOOK_IDENTITY,
  findUserBySocialSubject,
  GOOGLE_IDENTITY,
  linkSocialKeepEmail,
  linkSocialSubjectIfEmpty,
  linkSocialSwitchEmail,
} from '../infrastructure/socialIdentityStore.js';
import { setUserPreference } from './userPreferences.js';
import type { Language } from '../../../utils/language.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';
import type { AccountLockSource } from '../domain/accountLock.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  /** Google profile email when linked — informational when ≠ main `email`. */
  google_email: string | null;
  facebook_user_id: string | null;
  /** Facebook profile email when linked — informational when ≠ main `email`. */
  facebook_email: string | null;
  apple_sub: string | null;
  /** Apple profile email when linked — informational when ≠ main `email`. */
  apple_email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_verified_at: string | null;
  pending_email: string | null;
  status: 'active' | 'pending_deletion' | 'deleted' | 'locked';
  locked_at: string | null;
  lock_reason: string | null;
  lock_source: AccountLockSource | null;
  locked_by_user_id: string | null;
  deletion_scheduled_for: string | null;
  stripe_customer_id: string | null;
  /** Natural-key FK to roles(code) — only 'user' exists today, see
   * 1738000023000_roles.js. */
  role: string;
  /** Bumped by recordConnection on every manual login AND every silent
   * session refresh — see token.service.ts. Backs `npm run user -- list
   * --sort last-connected|most-connected|least-connected`. */
  last_connected_at: string | null;
  connection_count: number;
  /** Never authenticates; see userAuthGuards.ts. */
  cancelled_password_hash: string | null;
  password_cancelled_reason: 'social_link' | 'email_verification' | null;
}

/** Raw DB row before PII decrypt — includes blind-index columns. */
interface EncryptedUserRow extends UserRow {
  email_lookup: string;
  pending_email_lookup: string | null;
  google_email_lookup: string | null;
  facebook_email_lookup: string | null;
  apple_email_lookup: string | null;
}

function decryptUserRow(row: EncryptedUserRow | UserRow): UserRow {
  return {
    ...row,
    email: decryptPii(row.email)!,
    pending_email: decryptPii(row.pending_email),
    google_email: decryptPii(row.google_email),
    facebook_email: decryptPii(row.facebook_email),
    apple_email: decryptPii(row.apple_email),
    first_name: decryptPii(row.first_name),
    last_name: decryptPii(row.last_name),
    phone: decryptPii(row.phone),
  };
}

/** The customer object every authenticated response carries.
 *
 * This is the API contract shape, not a second description of it: the front is
 * typed against the same declaration, so adding or renaming a field here is a
 * compile error on both sides rather than a silent divergence. */
export type PublicUser = AuthUser;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    pendingEmail: row.pending_email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    status: row.status,
    // Natural-key FK to roles(code), so the column type is the driver's wider
    // `string`; the contract names the vocabulary the API actually publishes.
    role: row.role as AuthUser['role'],
    hasPassword: row.password_hash != null,
    hasGoogle: row.google_sub != null,
    googleEmail: row.google_email,
    hasFacebook: row.facebook_user_id != null,
    facebookEmail: row.facebook_email,
    hasApple: row.apple_sub != null,
    appleEmail: row.apple_email,
    // Postgres's own text format, not ISO — see requestDeletion's comment;
    // same reformat, and null-safe since most users have no deletion pending.
    deletionScheduledFor: row.deletion_scheduled_for
      ? new Date(row.deletion_scheduled_for).toISOString()
      : null,
  };
}

export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  gdprConsentVersion: string;
  language: Language;
  emailVerified?: boolean;
  googleSub?: string;
  /** When creating via Google, store the verified profile email. */
  googleEmail?: string;
  facebookUserId?: string;
  /** When creating via Facebook, store the verified profile email. */
  facebookEmail?: string;
  appleSub?: string;
  /** When creating via Apple, store the verified profile email. */
  appleEmail?: string;
}

export async function insertUser(client: pg.PoolClient, input: CreateUserInput): Promise<UserRow> {
  const googleEmail = input.googleEmail ?? (input.googleSub ? input.email : undefined);
  const facebookEmail = input.facebookEmail ?? (input.facebookUserId ? input.email : undefined);
  const appleEmail = input.appleEmail ?? (input.appleSub ? input.email : undefined);
  const { rows } = await client.query<EncryptedUserRow>(
    `insert into users (
       id, email, email_lookup, password_hash, gdpr_consent_version, gdpr_consent_at,
       email_verified_at, google_sub, google_email, google_email_lookup,
       facebook_user_id, facebook_email, facebook_email_lookup,
       apple_sub, apple_email, apple_email_lookup
     )
     values ($1, $2, $3, $4, $5, now(), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning *`,
    [
      randomUUID(),
      encryptPii(input.email),
      emailLookupHash(input.email),
      input.passwordHash,
      input.gdprConsentVersion,
      input.emailVerified ? new Date().toISOString() : null,
      input.googleSub ?? null,
      googleEmail ? encryptPii(googleEmail) : null,
      googleEmail ? emailLookupHash(googleEmail) : null,
      input.facebookUserId ?? null,
      facebookEmail ? encryptPii(facebookEmail) : null,
      facebookEmail ? emailLookupHash(facebookEmail) : null,
      input.appleSub ?? null,
      appleEmail ? encryptPii(appleEmail) : null,
      appleEmail ? emailLookupHash(appleEmail) : null,
    ],
  );
  const user = decryptUserRow(rows[0]!);
  await setUserPreference(client, user.id, 'language', input.language);
  await recordAccountCreatedEvents(client, user);
  return user;
}

export async function createUser(pool: pg.Pool, input: CreateUserInput): Promise<UserRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const user = await insertUser(client, input);
    await client.query('commit');
    return user;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function findUserByEmailLower(pool: pg.Pool, email: string): Promise<UserRow | undefined> {
  const lookup = emailLookupHash(email);
  const { rows } = await pool.query<EncryptedUserRow>(
    `select * from users where email_lookup = $1 or pending_email_lookup = $1`,
    [lookup],
  );
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

/** Conflict check for assigning an address — main, pending, or linked social email. */
export async function findUserByAnyEmailLower(pool: pg.Pool, email: string): Promise<UserRow | undefined> {
  const lookup = emailLookupHash(email);
  const { rows } = await pool.query<EncryptedUserRow>(
    `select * from users
     where email_lookup = $1
        or pending_email_lookup = $1
        or google_email_lookup = $1
        or facebook_email_lookup = $1
        or apple_email_lookup = $1`,
    [lookup],
  );
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function findUserByGoogleSub(
  pool: pg.Pool | pg.PoolClient,
  googleSub: string,
): Promise<UserRow | undefined> {
  return findUserBySocialSubject<EncryptedUserRow, UserRow>(pool, GOOGLE_IDENTITY, googleSub, decryptUserRow);
}

export async function findUserByFacebookUserId(
  pool: pg.Pool | pg.PoolClient,
  facebookUserId: string,
): Promise<UserRow | undefined> {
  return findUserBySocialSubject<EncryptedUserRow, UserRow>(
    pool,
    FACEBOOK_IDENTITY,
    facebookUserId,
    decryptUserRow,
  );
}

export async function findUserByAppleSub(
  pool: pg.Pool | pg.PoolClient,
  appleSub: string,
): Promise<UserRow | undefined> {
  return findUserBySocialSubject<EncryptedUserRow, UserRow>(pool, APPLE_IDENTITY, appleSub, decryptUserRow);
}

/** Idempotent backfill when an existing email account first signs in with Google. */
export async function linkGoogleSubIfEmpty(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  googleSub: string,
  googleEmail?: string,
): Promise<void> {
  await linkSocialSubjectIfEmpty(pool, GOOGLE_IDENTITY, userId, googleSub, googleEmail);
}

/** Link Google on Account (keep or match) — sets sub + google_email; main email unchanged. */
export async function linkGoogleKeepEmail(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  googleSub: string,
  googleEmail: string,
): Promise<UserRow | undefined> {
  return linkSocialKeepEmail<EncryptedUserRow, UserRow>(
    pool,
    GOOGLE_IDENTITY,
    userId,
    googleSub,
    googleEmail,
    decryptUserRow,
  );
}

/** Promote Google email to main — previous main is discarded; google_email = main. */
export async function linkGoogleSwitchEmail(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  googleSub: string,
  googleEmail: string,
): Promise<UserRow | undefined> {
  return linkSocialSwitchEmail<EncryptedUserRow, UserRow>(
    pool,
    GOOGLE_IDENTITY,
    userId,
    googleSub,
    googleEmail,
    decryptUserRow,
  );
}

/** Clears Google link only — main email and password stay. */
export async function clearGoogleSub(pool: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
  await clearSocialIdentity(pool, GOOGLE_IDENTITY, userId);
}

/** Idempotent backfill when an existing email account first signs in with Facebook. */
export async function linkFacebookUserIdIfEmpty(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  facebookUserId: string,
  facebookEmail?: string,
): Promise<void> {
  await linkSocialSubjectIfEmpty(pool, FACEBOOK_IDENTITY, userId, facebookUserId, facebookEmail);
}

/** Link Facebook on Account (keep or match) — sets id + facebook_email; main email unchanged. */
export async function linkFacebookKeepEmail(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  facebookUserId: string,
  facebookEmail: string,
): Promise<UserRow | undefined> {
  return linkSocialKeepEmail<EncryptedUserRow, UserRow>(
    pool,
    FACEBOOK_IDENTITY,
    userId,
    facebookUserId,
    facebookEmail,
    decryptUserRow,
  );
}

/** Promote Facebook email to main — previous main is discarded; facebook_email = main. */
export async function linkFacebookSwitchEmail(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  facebookUserId: string,
  facebookEmail: string,
): Promise<UserRow | undefined> {
  return linkSocialSwitchEmail<EncryptedUserRow, UserRow>(
    pool,
    FACEBOOK_IDENTITY,
    userId,
    facebookUserId,
    facebookEmail,
    decryptUserRow,
  );
}

/** Clears Facebook link only — main email and password stay. */
export async function clearFacebookUserId(pool: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
  await clearSocialIdentity(pool, FACEBOOK_IDENTITY, userId);
}

/** Idempotent backfill when an existing email account first signs in with Apple. */
export async function linkAppleSubIfEmpty(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  appleSub: string,
  appleEmail?: string,
): Promise<void> {
  await linkSocialSubjectIfEmpty(pool, APPLE_IDENTITY, userId, appleSub, appleEmail);
}

/** Link Apple on Account (keep or match) — sets sub + apple_email; main email unchanged. */
export async function linkAppleKeepEmail(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  appleSub: string,
  appleEmail: string,
): Promise<UserRow | undefined> {
  return linkSocialKeepEmail<EncryptedUserRow, UserRow>(
    pool,
    APPLE_IDENTITY,
    userId,
    appleSub,
    appleEmail,
    decryptUserRow,
  );
}

/** Promote Apple email to main — previous main is discarded; apple_email = main. */
export async function linkAppleSwitchEmail(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
  appleSub: string,
  appleEmail: string,
): Promise<UserRow | undefined> {
  return linkSocialSwitchEmail<EncryptedUserRow, UserRow>(
    pool,
    APPLE_IDENTITY,
    userId,
    appleSub,
    appleEmail,
    decryptUserRow,
  );
}

/** Clears Apple link only — main email and password stay. */
export async function clearAppleSub(pool: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
  await clearSocialIdentity(pool, APPLE_IDENTITY, userId);
}

/** Current `email` only — a pending email-change must not receive guest
 * orders until that change is confirmed. */
export async function findUserByCurrentEmail(
  db: pg.Pool | pg.PoolClient,
  email: string,
): Promise<UserRow | undefined> {
  const lookup = emailLookupHash(email);
  const { rows } = await db.query<EncryptedUserRow>(`select * from users where email_lookup = $1`, [lookup]);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function findUserById(pool: pg.Pool | pg.PoolClient, id: string): Promise<UserRow | undefined> {
  const { rows } = await pool.query<EncryptedUserRow>(`select * from users where id = $1`, [id]);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function emailsByUserIds(pool: pg.Pool, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { rows } = await pool.query<{ id: string; email: string }>(
    `select id, email from users where id = any($1::uuid[]) and status <> 'deleted'`,
    [unique],
  );
  return new Map(rows.map((row) => [row.id, decryptPii(row.email)!]));
}

export async function setStripeCustomerId(
  pool: pg.Pool,
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  await pool.query(`update users set stripe_customer_id = $2, updated_at = now() where id = $1`, [
    userId,
    stripeCustomerId,
  ]);
}

export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  /** `null` explicitly clears the optional phone; `undefined` leaves it unchanged. */
  phone?: string | null;
}

export async function updateProfile(pool: pg.Pool, userId: string, patch: ProfilePatch): Promise<UserRow> {
  const { rows } = await pool.query<EncryptedUserRow>(
    `update users
     set first_name = case when $2 then $3 else first_name end,
         last_name = case when $4 then $5 else last_name end,
         phone = case when $6 then $7 else phone end,
         updated_at = now()
     where id = $1
     returning *`,
    [
      userId,
      patch.firstName !== undefined,
      encryptPii(patch.firstName ?? null),
      patch.lastName !== undefined,
      encryptPii(patch.lastName ?? null),
      patch.phone !== undefined,
      encryptPii(patch.phone ?? null),
    ],
  );
  return decryptUserRow(rows[0]!);
}

/** Sets pending_email — the address is only live once its own confirmation
 * token is used (see emailConfirmation.service.ts's confirmEmailToken).
 * The current `email` (and its verified state) is left untouched until
 * then. */
export async function requestEmailChange(pool: pg.Pool, userId: string, newEmail: string): Promise<void> {
  await pool.query(
    `update users set pending_email = $2, pending_email_lookup = $3, updated_at = now() where id = $1`,
    [userId, encryptPii(newEmail), emailLookupHash(newEmail)],
  );
}


/** Ops / faker helper — marks the current email verified without the
 * confirmation-email round trip. Idempotent when already verified. */
export async function markEmailVerified(pool: pg.Pool, userId: string): Promise<void> {
  await pool.query(
    `update users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1`,
    [userId],
  );
}

export interface DeletionScheduled {
  deletionScheduledFor: string;
}

/** Soft-delete: flips status to pending_deletion and schedules the actual
 * removal ACCOUNT_DELETION_GRACE_PERIOD_DAYS out — the row itself is left
 * alone until process-account-deletions (see accountDeletion.service.ts)
 * hard-deletes it, or the user logs back in and reactivateIfPendingDeletion
 * cancels it first. */
export async function requestDeletion(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<DeletionScheduled> {
  const { rows } = await pool.query<{ deletion_scheduled_for: string }>(
    `update users
     set status = 'pending_deletion',
         deletion_requested_at = now(),
         deletion_scheduled_for = now() + make_interval(days => $2),
         deletion_reminder_sent_at = null,
         updated_at = now()
     where id = $1
     returning deletion_scheduled_for`,
    [userId, config.accountDeletion.gracePeriodDays],
  );
  // Postgres's own text format ("YYYY-MM-DD HH:MI:SS.ffffff+TZ"), not ISO —
  // reformatted here since, unlike every other raw timestamp in this
  // codebase, this one is actually returned in a JSON API response
  // (alongside accessTokenExpiresAt, which is ISO) rather than only ever
  // being re-inserted as-is.
  return { deletionScheduledFor: new Date(rows[0]!.deletion_scheduled_for).toISOString() };
}

/** Used both by an explicit "cancel deletion" action and by a login that
 * happens to land during the grace window (see auth.routes.ts's login
 * handler) — returns true only when a pending deletion actually existed to
 * cancel, so login can decide whether to surface a "welcome back" notice. */
export async function reactivateIfPendingDeletion(
  db: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `update users
     set status = 'active',
         deletion_requested_at = null,
         deletion_scheduled_for = null,
         deletion_reminder_sent_at = null,
         updated_at = now()
     where id = $1 and status = 'pending_deletion'
     returning id`,
    [userId],
  );
  return rows.length > 0;
}

/** Called from token.service.ts on both a manual /auth/login and a silent
 * /auth/refresh — "connected" deliberately covers either kind of session
 * activity, not just an explicit sign-in. Fire-and-forget from the caller's
 * perspective: never something a session-refresh failure should hinge on. */
export async function recordConnection(pool: pg.Pool | pg.PoolClient, userId: string): Promise<void> {
  await pool.query(
    `update users set last_connected_at = now(), connection_count = connection_count + 1 where id = $1`,
    [userId],
  );
}

export type UserListSort = 'last-connected' | 'most-connected' | 'least-connected' | 'order-value';

export interface ListUsersForOpsFilters {
  offset: number;
  /** Undefined means no LIMIT clause at all — every matching row is
   * returned. See scripts/user.ts's own "--limit absent = no limit". */
  limit?: number;
  locked?: boolean;
  withOrders?: boolean;
  neverOrdered?: boolean;
  /** Exact email match via email_lookup (HMAC) — ciphertext emails cannot
   * be searched with ILIKE. Callers should pass a full email address. */
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  lastConnectedAfter?: Date;
  lastConnectedBefore?: Date;
  /** Exact match against any of the account's refresh_tokens.created_by_ip
   * values — "who else connected from this IP" is the point, not a range. */
  ip?: string;
  sort: UserListSort;
}

export interface UserListRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: UserRow['status'];
  role: string;
  email_verified_at: string | null;
  created_at: string;
  last_connected_at: string | null;
  connection_count: number;
  order_count: number;
  /** Raw numeric-as-string from Postgres, same convention as OrderRow.total
   * elsewhere — the caller Number()s it when shaping the API response. */
  order_value_sum: string;
}

/** Browser-admin account card. The normal dashboard query contains customers;
 * `staff` lists every other role (super-admins included), `all` everyone. */
export interface AdminUserSummary {
  id: string;
  role: string;
  roles: { code: string; label: string }[];
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: UserRow['status'];
  lockedAt: string | null;
  lockReason: string | null;
  lockSource: AccountLockSource | null;
  emailVerified: boolean;
  createdAt: string;
  lastConnectedAt: string | null;
  connectionCount: number;
  hasPassword: boolean;
  hasGoogle: boolean;
  googleEmail: string | null;
  hasFacebook: boolean;
  facebookEmail: string | null;
  hasApple: boolean;
  appleEmail: string | null;
  orders: {
    /** confirmed → disponible, inclusive: all non-terminal fulfillment work. */
    inFlight: { count: number; total: number };
    /** Includes received orders whether an administrator verified them or not. */
    received: { count: number; total: number };
    /** Includes cancelled orders whether an administrator verified them or not. */
    cancelled: { count: number; total: number };
  };
  activityCounts: {
    /** Anonymous contacts sent with this account's current email address. */
    contacts: number;
    chats: number;
    productRequests: number;
    identityHistory: number;
  };
}

interface AdminUserListRow extends EncryptedUserRow {
  created_at: string;
  in_flight_count: string;
  in_flight_total: string;
  received_count: string;
  received_total: string;
  cancelled_count: string;
  cancelled_total: string;
  contact_count: string;
  chat_count: string;
  product_request_count: string;
  identity_history_count: string;
  staff_roles: { code: string; label: string }[];
}

/**
 * Paginated browser-admin accounts. Totals deliberately use `orders.total`,
 * i.e. the exact amount placed by the customer including delivery and
 * discounts; terminal verification never changes a bucket.
 */
export async function listAdminUsers(
  pool: pg.Pool,
  page: number,
  pageSize: number,
  role: 'user' | 'staff' | 'all' = 'user',
  search = '',
): Promise<{ users: AdminUserSummary[]; total: number }> {
  const normalizedSearch = search.trim().toLowerCase();
  const hasWildcard = normalizedSearch.includes('*');
  const wildcardOnly = normalizedSearch.length > 0 && /^\*+$/.test(normalizedSearch);
  const exactSearch = normalizedSearch && !hasWildcard ? normalizedSearch : null;
  const lookup = exactSearch ? emailLookupHash(exactSearch) : null;
  const where = exactSearch
    ? `where ($1::text = 'all' or (u.role = 'user') = ($1::text = 'user')) and (
         u.email_lookup = $2
         or u.google_email_lookup = $2
         or u.facebook_email_lookup = $2
         or u.apple_email_lookup = $2
         or exists (
           select 1 from user_identity_events e
            where e.user_id = u.id
              and (e.email_lookup = $2 or e.previous_email_lookup = $2)
         )
       )`
    : `where ($1::text = 'all' or (u.role = 'user') = ($1::text = 'user'))`;
  const values: unknown[] = exactSearch ? [role, lookup] : [role];
  const fromClause = `
    from users u
    left join (
      select
        user_id,
        count(*) filter (where status in ('confirmed', 'in_preparation', 'to_send', 'sent', 'disponible')) as in_flight_count,
        coalesce(sum(total) filter (where status in ('confirmed', 'in_preparation', 'to_send', 'sent', 'disponible')), 0) as in_flight_total,
        count(*) filter (where status = 'received') as received_count,
        coalesce(sum(total) filter (where status = 'received'), 0) as received_total,
        count(*) filter (where status = 'cancelled') as cancelled_count,
        coalesce(sum(total) filter (where status = 'cancelled'), 0) as cancelled_total
      from orders
      where user_id is not null
      group by user_id
    ) o on o.user_id = u.id
    left join (
      select email_lookup, count(*) as contact_count
      from unconnected_contacts
      where email_lookup is not null
      group by email_lookup
    ) c on c.email_lookup = u.email_lookup
    left join (
      select user_id, count(*) as chat_count
      from chat_sessions
      where user_id is not null
      group by user_id
    ) ch on ch.user_id = u.id
    left join (
      select user_id, count(*) as product_request_count
      from product_requests
      where user_id is not null
      group by user_id
    ) pr on pr.user_id = u.id
    left join (
      select user_id, count(*) as identity_history_count
      from user_identity_events
      group by user_id
    ) ih on ih.user_id = u.id
    ${where}`;
  const selectClause = `select
    u.*,
    coalesce(o.in_flight_count, 0)::text as in_flight_count,
    coalesce(o.in_flight_total, 0)::text as in_flight_total,
    coalesce(o.received_count, 0)::text as received_count,
    coalesce(o.received_total, 0)::text as received_total,
    coalesce(o.cancelled_count, 0)::text as cancelled_count,
    coalesce(o.cancelled_total, 0)::text as cancelled_total,
    coalesce(c.contact_count, 0)::text as contact_count,
    coalesce(ch.chat_count, 0)::text as chat_count,
    coalesce(pr.product_request_count, 0)::text as product_request_count,
    coalesce(ih.identity_history_count, 0)::text as identity_history_count,
    (select coalesce(json_agg(json_build_object('code', r.code, 'label', r.label) order by r.created_at), '[]'::json) from user_roles ur join roles r on r.code = ur.role_code where ur.user_id = u.id) as staff_roles`;
  const toSummary = (row: AdminUserListRow): AdminUserSummary => {
    const user = decryptUserRow(row);
    return {
      id: user.id,
      role: user.role,
      roles: row.staff_roles,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status,
      lockedAt: user.locked_at,
      lockReason: user.lock_reason,
      lockSource: user.lock_source,
      emailVerified: user.email_verified_at !== null,
      createdAt: row.created_at,
      lastConnectedAt: user.last_connected_at,
      connectionCount: user.connection_count,
      hasPassword: user.password_hash != null,
      hasGoogle: user.google_sub != null,
      googleEmail: user.google_email,
      hasFacebook: user.facebook_user_id != null,
      facebookEmail: user.facebook_email,
      hasApple: user.apple_sub != null,
      appleEmail: user.apple_email,
      orders: {
        inFlight: { count: Number(row.in_flight_count), total: Number(row.in_flight_total) },
        received: { count: Number(row.received_count), total: Number(row.received_total) },
        cancelled: { count: Number(row.cancelled_count), total: Number(row.cancelled_total) },
      },
      activityCounts: {
        contacts: Number(row.contact_count),
        chats: Number(row.chat_count),
        productRequests: Number(row.product_request_count),
        identityHistory: Number(row.identity_history_count),
      },
    };
  };

  // Email ciphertext cannot be queried with ILIKE. Exact searches stay on
  // HMAC indexes (main, provider, and historical). An explicit `*` glob is
  // filtered after decrypting the already-authorized role's rows — including
  // historical identity emails — in this admin-only service.
  if (hasWildcard && !wildcardOnly) {
    const { rows } = await pool.query<AdminUserListRow>(
      `${selectClause} ${fromClause} order by u.created_at desc, u.id`,
      values,
    );
    const pattern = new RegExp(
      `^${normalizedSearch
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
      'i',
    );
    const userIds = rows.map((row) => row.id);
    const historyByUser = new Map<string, string[]>();
    if (userIds.length > 0) {
      const { rows: eventRows } = await pool.query<{
        user_id: string;
        email: string | null;
        previous_email: string | null;
      }>(`select user_id, email, previous_email from user_identity_events where user_id = any($1::uuid[])`, [
        userIds,
      ]);
      for (const event of eventRows) {
        const emails = historyByUser.get(event.user_id) ?? [];
        const email = decryptPii(event.email);
        const previous = decryptPii(event.previous_email);
        if (email) emails.push(email);
        if (previous) emails.push(previous);
        historyByUser.set(event.user_id, emails);
      }
    }
    const matching = rows.map(toSummary).filter((user) => {
      const candidates = [
        user.email,
        user.googleEmail,
        user.facebookEmail,
        user.appleEmail,
        ...(historyByUser.get(user.id) ?? []),
      ].filter((value): value is string => Boolean(value));
      return candidates.some((candidate) => pattern.test(candidate));
    });
    const start = (page - 1) * pageSize;
    return { users: matching.slice(start, start + pageSize), total: matching.length };
  }

  const offset = (page - 1) * pageSize;
  const paginationValues = [...values, pageSize, offset];
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<AdminUserListRow>(
      `${selectClause} ${fromClause} order by u.created_at desc, u.id limit $${values.length + 1} offset $${values.length + 2}`,
      paginationValues,
    ),
    pool.query<{ total: string }>(`select count(*)::text as total from users u ${where}`, values),
  ]);
  return { users: rows.map(toSummary), total: Number(countRows[0]?.total ?? 0) };
}

/** Guard of every `/admin/users/:id/*` route: any account but a super-admin. */
export async function findAdminUserById(pool: pg.Pool, userId: string): Promise<UserRow | undefined> {
  const user = await findUserById(pool, userId);
  return user && user.role !== SUPER_ADMIN_ROLE ? user : undefined;
}

/** Backs `npm run user -- list`. Order aggregates exclude cancelled orders —
 * a cancelled order was never fulfilled revenue and would make
 * --never-ordered/--with-orders/order-value sorting misleading for a
 * customer who only ever cancelled. */
export async function listUsersForOps(
  pool: pg.Pool,
  filters: ListUsersForOpsFilters,
): Promise<{ total: number; users: UserListRow[] }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  function condition(sql: string, value: unknown): void {
    values.push(value);
    conditions.push(sql.replace('$$', `$${values.length}`));
  }

  if (filters.locked) conditions.push(`u.status = 'locked'`);
  if (filters.withOrders) conditions.push(`coalesce(o.order_count, 0) > 0`);
  if (filters.neverOrdered) conditions.push(`coalesce(o.order_count, 0) = 0`);
  // Exact email only — email ciphertext is not searchable with ILIKE.
  if (filters.search) condition(`u.email_lookup = $$`, emailLookupHash(filters.search));
  if (filters.createdAfter) condition(`u.created_at >= $$`, filters.createdAfter.toISOString());
  if (filters.createdBefore) condition(`u.created_at <= $$`, filters.createdBefore.toISOString());
  if (filters.lastConnectedAfter)
    condition(`u.last_connected_at >= $$`, filters.lastConnectedAfter.toISOString());
  if (filters.lastConnectedBefore)
    condition(`u.last_connected_at <= $$`, filters.lastConnectedBefore.toISOString());
  if (filters.ip) {
    condition(
      `exists (select 1 from refresh_tokens rt where rt.user_id = u.id and rt.created_by_ip = $$)`,
      filters.ip,
    );
  }
  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  const orderBy =
    filters.sort === 'most-connected'
      ? 'u.connection_count desc, u.id'
      : filters.sort === 'least-connected'
        ? 'u.connection_count asc, u.id'
        : filters.sort === 'order-value'
          ? 'coalesce(o.order_value_sum, 0) desc, u.id'
          : 'u.last_connected_at desc nulls last, u.id';

  const fromClause = `
    from users u
    left join (
      select user_id, count(*)::int as order_count, coalesce(sum(total), 0) as order_value_sum
      from orders
      where status <> 'cancelled'
      group by user_id
    ) o on o.user_id = u.id
    ${where}
  `;

  const { rows: countRows } = await pool.query<{ count: string }>(
    `select count(*)::int as count ${fromClause}`,
    values,
  );
  const total = Number(countRows[0]!.count);

  const listValues = [...values, filters.offset];
  const limitClause = filters.limit !== undefined ? `limit $${listValues.length + 1}` : '';
  if (filters.limit !== undefined) listValues.push(filters.limit);

  const { rows } = await pool.query<UserListRow>(
    `select u.id, u.email, u.first_name, u.last_name, u.status, u.role, u.email_verified_at, u.created_at,
            u.last_connected_at, u.connection_count,
            coalesce(o.order_count, 0) as order_count, coalesce(o.order_value_sum, 0) as order_value_sum
     ${fromClause}
     order by ${orderBy}
     offset $${values.length + 1} ${limitClause}`,
    listValues,
  );
  return {
    total,
    users: rows.map((row) => ({
      ...row,
      email: decryptPii(row.email)!,
      first_name: decryptPii(row.first_name),
      last_name: decryptPii(row.last_name),
    })),
  };
}

/** UUID (id) or email — the CLI accepts either, see scripts/user.ts. */
export async function findUserByIdOrEmail(pool: pg.Pool, idOrEmail: string): Promise<UserRow | undefined> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return UUID_RE.test(idOrEmail) ? findUserById(pool, idOrEmail) : findUserByEmailLower(pool, idOrEmail);
}
