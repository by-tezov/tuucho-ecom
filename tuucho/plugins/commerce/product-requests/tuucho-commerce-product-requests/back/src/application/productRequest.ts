import { randomBytes, randomUUID } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '@kernel/back/config/env';
import type { Pool } from 'pg';
import { decryptPii, encryptPii } from '@kernel/back/platform/security/piiCrypto';
import type { Size } from '@kernel/back/types';
import { isLanguage, type Language } from '@kernel/back/utils/language';
import { getUserLanguage } from '@kernel/back/modules/identity/application/userPreferences';

const PRODUCT_REQUEST_STATUSES = ['requested', 'accepted', 'refused'] as const;
export type ProductRequestStatus = (typeof PRODUCT_REQUEST_STATUSES)[number];

export const PRODUCT_REQUEST_REFUSAL_REASON_MAX = 500;

export function isProductRequestStatus(value: unknown): value is ProductRequestStatus {
  return typeof value === 'string' && (PRODUCT_REQUEST_STATUSES as readonly string[]).includes(value);
}

export interface ProductRequestRow {
  id: string;
  public_id: string;
  user_id: string | null;
  email: string;
  product_id: string | null;
  product_uid: string;
  title_fr: string;
  shape_key: string;
  shape_label_fr: string;
  length_key: string;
  size: Size;
  quantity: number;
  unit_price: string | null;
  photo_path: string | null;
  comment: string | null;
  status: ProductRequestStatus;
  refusal_reason: string | null;
  response_price: string | null;
  response_message: string | null;
  status_updated_at: string;
  created_at: string;
}

export interface AdminProductRequest {
  id: string;
  publicId: string;
  userId: string | null;
  email: string;
  productId: string | null;
  productUid: string;
  title: string;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  size: Size;
  quantity: number;
  unitPrice: number | null;
  photoPath: string | null;
  comment: string | null;
  status: ProductRequestStatus;
  refusalReason: string | null;
  responsePrice: number | null;
  responseMessage: string | null;
  statusUpdatedAt: string;
  createdAt: string;
}

export type SetProductRequestStatusResult =
  | { ok: true; changed: boolean; request: AdminProductRequest }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_request'; message: string };

function mintPublicId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export function productRequestReplyToken(publicId: string): string {
  return createHmac('sha256', config.pii.encryptionKey)
    .update(`product-request:${publicId}`)
    .digest('hex')
    .slice(0, 24);
}

export function validProductRequestReplyToken(publicId: string, token: string): boolean {
  const expected = productRequestReplyToken(publicId);
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function listProductRequestsPage(
  pool: Pool,
  status: ProductRequestStatus,
  page: number,
  pageSize: number,
) {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<ProductRequestRow>(
      `select * from product_requests where status = $1 order by created_at desc limit $2 offset $3`,
      [status, pageSize, offset],
    ),
    pool.query<{ total: string }>(`select count(*)::text as total from product_requests where status = $1`, [
      status,
    ]),
  ]);
  return { requests: rows.map(toAdminProductRequest), total: Number(countRows[0]?.total ?? 0) };
}

/** All-status product requests belonging directly to one account. Guest
 * requests remain unowned and must not be inferred from an email address. */
export async function listAdminUserProductRequestsPage(
  pool: Pool,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ requests: AdminProductRequest[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query<ProductRequestRow>(
      `select * from product_requests
       where user_id = $1
       order by created_at desc, id desc
       limit $2 offset $3`,
      [userId, pageSize, offset],
    ),
    pool.query<{ total: string }>(`select count(*)::text as total from product_requests where user_id = $1`, [
      userId,
    ]),
  ]);
  return { requests: rows.map(toAdminProductRequest), total: Number(countRows[0]?.total ?? 0) };
}

/** Count of open product requests for the admin-hub tile badge. */
export async function getAdminProductRequestAttentionCounts(pool: Pool): Promise<{ requested: number }> {
  const { rows } = await pool.query<{ requested: string }>(
    `select count(*)::text as requested from product_requests where status = 'requested'`,
  );
  return { requested: Number(rows[0]?.requested ?? 0) };
}

export async function getProductRequestByPublicId(
  pool: Pool,
  publicId: string,
): Promise<AdminProductRequest | undefined> {
  const { rows } = await pool.query<ProductRequestRow>(
    `select * from product_requests where public_id = $1`,
    [publicId],
  );
  return rows[0] ? toAdminProductRequest(rows[0]) : undefined;
}

export async function appendProductRequestCustomerMessage(
  pool: Pool,
  publicId: string,
  body: string,
  messageId: string | null,
) {
  const request = await getProductRequestByPublicId(pool, publicId);
  if (!request) return undefined;
  await pool.query(
    `insert into product_request_messages (request_id, direction, body, email_message_id) values ($1, 'customer', $2, $3)`,
    [request.id, encryptPii(body), messageId],
  );
  return request;
}

export async function listProductRequestMessages(pool: Pool, requestId: string) {
  const { rows } = await pool.query<{
    id: string;
    direction: 'admin' | 'customer';
    body: string;
    created_at: string;
  }>(`select * from product_request_messages where request_id = $1 order by created_at asc`, [requestId]);
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    body: decryptPii(row.body)!,
    createdAt: row.created_at,
  }));
}

function decryptRow(row: ProductRequestRow): ProductRequestRow {
  return {
    ...row,
    email: decryptPii(row.email)!,
    comment: decryptPii(row.comment),
  };
}

function toAdminProductRequest(row: ProductRequestRow): AdminProductRequest {
  const decrypted = decryptRow(row);
  return {
    id: decrypted.id,
    publicId: decrypted.public_id,
    userId: decrypted.user_id,
    email: decrypted.email,
    productId: decrypted.product_id,
    productUid: decrypted.product_uid,
    title: decrypted.title_fr,
    shapeKey: decrypted.shape_key,
    shapeLabel: decrypted.shape_label_fr,
    lengthKey: decrypted.length_key,
    size: decrypted.size,
    quantity: decrypted.quantity,
    unitPrice: decrypted.unit_price === null ? null : Number(decrypted.unit_price),
    photoPath: decrypted.photo_path,
    comment: decrypted.comment,
    status: decrypted.status,
    refusalReason: decrypted.refusal_reason,
    responsePrice: decrypted.response_price === null ? null : Number(decrypted.response_price),
    responseMessage: decryptPii(decrypted.response_message),
    statusUpdatedAt: decrypted.status_updated_at,
    createdAt: decrypted.created_at,
  };
}

export async function insertProductRequest(
  pool: Pool,
  input: {
    userId: string | null;
    email: string;
    productId: string;
    productUid: string;
    titleFr: string;
    shapeKey: string;
    shapeLabelFr: string;
    lengthKey: string;
    size: Size;
    quantity: number;
    unitPrice: number;
    photoPath: string | null;
    comment: string | null;
    language: Language;
  },
): Promise<AdminProductRequest> {
  const id = randomUUID();
  let publicId = mintPublicId();
  const email = encryptPii(input.email)!;
  const comment = encryptPii(input.comment);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await pool.query<ProductRequestRow>(
        `insert into product_requests (
           id, public_id, user_id, email, product_id, product_uid, title_fr,
           shape_key, shape_label_fr, length_key, size, quantity, unit_price, photo_path, comment, status, language
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'requested', $16)
         returning *`,
        [
          id,
          publicId,
          input.userId,
          email,
          input.productId,
          input.productUid,
          input.titleFr,
          input.shapeKey,
          input.shapeLabelFr,
          input.lengthKey,
          input.size,
          input.quantity,
          input.unitPrice,
          input.photoPath,
          comment,
          input.language,
        ],
      );
      return toAdminProductRequest(rows[0]!);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        publicId = mintPublicId();
        continue;
      }
      throw error;
    }
  }
  throw new Error('failed to mint unique product_request public_id');
}

export async function listProductRequests(
  pool: Pool,
  statuses: ProductRequestStatus[] | undefined,
): Promise<AdminProductRequest[]> {
  const { rows } =
    statuses && statuses.length > 0
      ? await pool.query<ProductRequestRow>(
          `select * from product_requests
           where status = any($1::text[])
           order by created_at desc`,
          [statuses],
        )
      : await pool.query<ProductRequestRow>(`select * from product_requests order by created_at desc`);
  return rows.map(toAdminProductRequest);
}

export async function setProductRequestStatus(
  pool: Pool,
  publicId: string,
  status: ProductRequestStatus,
  reason: string | null,
): Promise<SetProductRequestStatusResult> {
  if (status === 'refused') {
    if (!reason) {
      return { ok: false, reason: 'invalid_request', message: 'refused requires a reason.' };
    }
  } else if (reason) {
    return {
      ok: false,
      reason: 'invalid_request',
      message: 'reason is only allowed when status is refused.',
    };
  }

  const { rows: existing } = await pool.query<ProductRequestRow>(
    `select * from product_requests where public_id = $1`,
    [publicId],
  );
  const current = existing[0];
  if (!current) return { ok: false, reason: 'not_found' };

  if (current.status === status) {
    if (status !== 'refused' || current.refusal_reason === reason) {
      return { ok: true, changed: false, request: toAdminProductRequest(current) };
    }
  }

  const { rows } = await pool.query<ProductRequestRow>(
    `update product_requests
     set status = $2,
         refusal_reason = $3,
         status_updated_at = now()
     where public_id = $1
     returning *`,
    [publicId, status, status === 'refused' ? reason : null],
  );
  const updated = rows[0];
  if (!updated) return { ok: false, reason: 'not_found' };
  return { ok: true, changed: true, request: toAdminProductRequest(updated) };
}

/** The language to reply to a request in: the account's saved language,
 * else the one the request was made in, else French for requests made
 * before that was recorded. */
export async function productRequestReplyLanguage(
  pool: Pool,
  request: { id: string; userId: string | null },
): Promise<Language> {
  if (request.userId) return getUserLanguage(pool, request.userId);
  const { rows } = await pool.query<{ language: string | null }>(
    `select language from product_requests where id = $1`,
    [request.id],
  );
  const language = rows[0]?.language;
  return language && isLanguage(language) ? language : 'fr';
}
