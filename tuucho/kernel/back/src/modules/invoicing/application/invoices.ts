import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { isLanguage, localize, type Language } from '../../../utils/language.js';
import { formatIntegrityToken } from '../../commerce/domain/integrityToken.js';
import type { OrderItemRow, OrderRow } from '../../orders/application/ordersFacade.js';
import { writeInvoicePdf, type InvoiceData } from '../infrastructure/invoicePdf.js';
import { applyFilters, CORE_OPENING_FILTERS, type InvoiceDocumentOverride, type InvoiceRenderState } from '@tuucho/plugin-sdk';
import { extraLinesFromSnapshot, readPluginSnapshot } from '../../orders/application/orderPluginSnapshot.js';
import { decryptJsonPii } from '../../../platform/security/piiCrypto.js';
import { writeFile } from 'node:fs/promises';

export interface InvoiceRecord {
  invoiceNumber: string;
  fileName: string;
  absolutePath: string;
}

interface InvoiceCacheRow {
  invoice_number: string;
  file_name: string;
  content_version: number;
}

/** Bump when the PDF layout gains required content (e.g. Paiement block) so
 * `ensureInvoice` rewrites the same FACT-… file without a new number. */
const INVOICE_CONTENT_VERSION = 7;

/** "Couleur : Rose" for a nail with a variation option, '' otherwise. */
function variationText(
  axis: Parameters<typeof localize>[0] | null | undefined,
  option: Parameters<typeof localize>[0] | null | undefined,
  language: Parameters<typeof localize>[1],
): string {
  if (!option) return '';
  const optionLabel = localize(option, language);
  return axis ? `${localize(axis, language)} : ${optionLabel}` : optionLabel;
}

async function buildInvoiceData(order: OrderRow, items: OrderItemRow[], invoiceNumber: string): Promise<InvoiceData> {
  const snapshot = readPluginSnapshot((order as { plugin_snapshot?: unknown }).plugin_snapshot);
  const rendered = await applyFilters<InvoiceRenderState>(
    CORE_OPENING_FILTERS.invoiceRender,
    {
      theme: {},
      extraLines: extraLinesFromSnapshot(snapshot),
      extraBlocks: [],
    },
    { order, snapshot, items },
  );
  if (!rendered.copy) {
    throw new Error('Invoice copy missing: enable tuucho-kernel-locale-en or tuucho-kernel-locale-fr for the order language');
  }
  const renderedLanguage = rendered.language ?? '';
  const invoiceLanguage: Language = isLanguage(renderedLanguage) ? renderedLanguage : 'en';
  const copy = rendered.copy;
  return {
    invoiceNumber,
    orderNumber: order.order_number,
    orderDate: new Date(order.confirmed_at),
    integrityToken: order.content_hash ? formatIntegrityToken(order.content_hash) : null,
    recipientName: order.recipient_name,
    companyName: order.company_name,
    line1: order.line1,
    line2: order.line2,
    postalCode: order.postal_code,
    city: order.city,
    countryCode: order.country_code,
    billingRecipientName: order.billing_recipient_name,
    billingCompanyName: order.billing_company_name,
    billingLine1: order.billing_line1,
    billingLine2: order.billing_line2,
    billingPostalCode: order.billing_postal_code,
    billingCity: order.billing_city,
    billingCountryCode: order.billing_country_code,
    items: items.map((item) => ({
      productId: item.product_id,
      productUid: item.product_uid,
      productType: item.product_type,
      id: item.id,
      title: localize(item.title, invoiceLanguage),
      shapeKey: item.shape_key,
      shapeLabel: item.shape_label ? localize(item.shape_label, invoiceLanguage) : item.shape_key,
      lengthKey: item.length_key,
      lengthLabel: item.length_label ? localize(item.length_label, invoiceLanguage) : item.length_key,
      packKey: item.pack_key,
      packLabel: item.pack_label ? localize(item.pack_label, invoiceLanguage) : item.pack_key,
      size: item.size,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      origin: item.origin ?? 'user',
      locked: item.locked ?? false,
      comment: item.comment ?? null,
      nails: (item.nails ?? []).map((nail) => ({
        title: localize(nail.title, invoiceLanguage),
        productUid: nail.product_uid,
        shapeLabel: nail.shape_label ? localize(nail.shape_label, invoiceLanguage) : nail.shape_key,
        lengthLabel: nail.length_label ? localize(nail.length_label, invoiceLanguage) : nail.length_key,
        finger: nail.finger,
        variationLabel: variationText(nail.variation_axis_label, nail.variation_label, invoiceLanguage),
      })),
    })),
    subtotal: items.reduce((sum, item) => sum + Number(item.line_total), 0),
    shippingFee: Number(order.shipping_fee),
    shippingListFee: Number(order.shipping_list_fee ?? order.shipping_fee),
    rulesItemDiscount: Number(order.rules_item_discount ?? 0),
    courierName: order.courier_name ? localize(order.courier_name, invoiceLanguage) : null,
    express: order.express,
    extraLines: rendered.extraLines.map((line) => ({ label: line.label, amount: line.amount })),
    total: Number(order.total),
    paymentCaptureStatus: order.payment_capture_status,
    paymentMethodType: order.payment_method_type,
    paymentCardBrand: order.payment_card_brand,
    paymentCardLast4: order.payment_card_last4,
    gift: invoiceGiftFromOrder(order),
    copy,
  };
}

async function writeInvoiceDocument(
  absolutePath: string,
  data: InvoiceData,
  order: OrderRow,
): Promise<void> {
  const override = await applyFilters<InvoiceDocumentOverride | null>(
    CORE_OPENING_FILTERS.invoiceDocument,
    null,
    { data, order },
  );
  if (override?.bytes) {
    await writeFile(absolutePath, Buffer.from(override.bytes));
    return;
  }
  await writeInvoicePdf(absolutePath, data);
}

function invoiceGiftFromOrder(order: OrderRow): InvoiceData['gift'] {
  const raw = order.gift_snapshot;
  if (!raw || typeof raw !== 'object') return null;
  const enc = (raw as { enc?: unknown }).enc;
  if (typeof enc !== 'string') return null;
  const snap = decryptJsonPii<{
    giverDisplayName: string;
    receiverName: string;
    maxSets: number | null;
    maxBudget: number | null;
  }>(enc);
  if (!snap) return null;
  return {
    giverDisplayName: snap.giverDisplayName,
    receiverName: snap.receiverName,
    maxSets: snap.maxSets,
    maxBudget: snap.maxBudget,
  };
}

/** Idempotent, same "check first, generate once" shape as
 * shippingLabels.service.ts's ensureShippingLabel — an order's invoice is
 * generated once and reused on every later download-button click or email
 * resend, unless `content_version` is behind `INVOICE_CONTENT_VERSION`
 * (rewrite same invoice_number). The PDF itself lives on disk under
 * PRIVATE_INVOICE_DIR/<invoiceNumber>.pdf; only the relative file_name is
 * persisted (project hard rule: no file bytes in Postgres, ever).
 * invoice_number is reserved from invoice_number_seq and the file is fully
 * written *before* the DB row is inserted, so a mid-write failure never
 * leaves a DB row pointing at a nonexistent file. */
export async function ensureInvoice(
  pool: pg.Pool,
  order: OrderRow,
  items: OrderItemRow[],
): Promise<InvoiceRecord> {
  const cached = await currentInvoice(pool, order.id);
  if (cached) return cached;

  // The first download, the "received" email and a double click can all ask
  // for the same missing invoice at once. Without this lock each one reserved
  // its own number: the loser's insert hit the order_id primary key (a 500)
  // and left a gap in the invoice sequence plus an orphan PDF on disk. Held
  // only while the local PDF is written, never across a network call.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(87220, hashtext($1))`, [order.id]);
    const record = await ensureInvoiceLocked(client, order, items);
    await client.query('commit');
    return record;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function currentInvoice(
  db: pg.Pool | pg.PoolClient,
  orderId: string,
): Promise<InvoiceRecord | undefined> {
  const { rows } = await db.query<InvoiceCacheRow>(
    `select invoice_number, file_name, content_version from order_invoices where order_id = $1`,
    [orderId],
  );
  const stored = rows[0];
  if (!stored || stored.content_version < INVOICE_CONTENT_VERSION) return undefined;
  return {
    invoiceNumber: stored.invoice_number,
    fileName: stored.file_name,
    absolutePath: join(config.invoiceDir, stored.file_name),
  };
}

async function ensureInvoiceLocked(
  client: pg.PoolClient,
  order: OrderRow,
  items: OrderItemRow[],
): Promise<InvoiceRecord> {
  const { rows } = await client.query<InvoiceCacheRow>(
    `select invoice_number, file_name, content_version from order_invoices where order_id = $1`,
    [order.id],
  );
  const stored = rows[0];
  if (stored && stored.content_version >= INVOICE_CONTENT_VERSION) {
    return {
      invoiceNumber: stored.invoice_number,
      fileName: stored.file_name,
      absolutePath: join(config.invoiceDir, stored.file_name),
    };
  }

  if (stored) {
    const absolutePath = join(config.invoiceDir, stored.file_name);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeInvoiceDocument(absolutePath, await buildInvoiceData(order, items, stored.invoice_number), order);
    await client.query(`update order_invoices set content_version = $1 where order_id = $2`, [
      INVOICE_CONTENT_VERSION,
      order.id,
    ]);
    return {
      invoiceNumber: stored.invoice_number,
      fileName: stored.file_name,
      absolutePath,
    };
  }

  const { rows: seqRows } = await client.query<{ n: string }>(`select nextval('invoice_number_seq') as n`);
  const invoiceNumber = `FACT-${seqRows[0]!.n.padStart(6, '0')}`;
  const fileName = `${invoiceNumber}.pdf`;
  const absolutePath = join(config.invoiceDir, fileName);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeInvoiceDocument(absolutePath, await buildInvoiceData(order, items, invoiceNumber), order);

  await client.query(
    `insert into order_invoices (order_id, invoice_number, file_name, content_version) values ($1, $2, $3, $4)`,
    [order.id, invoiceNumber, fileName, INVOICE_CONTENT_VERSION],
  );

  return { invoiceNumber, fileName, absolutePath };
}
