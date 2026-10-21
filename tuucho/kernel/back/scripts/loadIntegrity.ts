/**
 * Database side of `npm run test -- --dev --load`, against the disposable
 * load database only:
 *
 * - voucher and contention fixtures written straight to that database;
 * - a sampler recording connection, lock-wait and deadlock pressure while k6
 *   runs (`db-metrics.json`);
 * - post-run invariants (`invariants.json`): a load run that returns only
 *   2xx/4xx can still oversell, over-use a voucher or skip an invoice number,
 *   so the run fails on any violation, not only on HTTP errors.
 */
import { writeFileSync } from 'node:fs';
import pg from 'pg';

export interface ScarceFixture {
  productId: string;
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  /** Units purchasable when the run starts. */
  units: number;
  voucherCode: string;
  voucherQuantity: number;
}

async function withClient<T>(databaseUrl: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Copy one voucher row (made through `npm run voucher -- init`, so every
 * column is what the CLI would write) under new codes. Hundreds of VUs each
 * need their own code so they do not queue on one voucher row lock, and one
 * CLI process per code took minutes at 500 VUs. */
export async function cloneLoadVouchers(
  databaseUrl: string,
  sourceCode: string,
  codes: string[],
  quantity?: number,
): Promise<void> {
  await withClient(databaseUrl, async (client) => {
    for (const code of codes) {
      await client.query(
        `insert into vouchers
         select * from jsonb_populate_record(
           null::vouchers,
           (select to_jsonb(v) || jsonb_build_object('code', $2::text, 'quantity', coalesce($3::int, v.quantity))
            from vouchers v where v.code = $1)
         )`,
        [sourceCode, code, quantity ?? null],
      );
    }
  });
}

/** Contention profile: one real, visible set variant whose purchasable units
 * are cut to `units`, and one voucher usable `voucherQuantity` times. Both
 * run out during the run on purpose. */
export async function prepareContentionFixtures(
  databaseUrl: string,
  sourceVoucherCode: string,
  total: number,
): Promise<ScarceFixture> {
  const units = Math.max(2, total);
  const voucherQuantity = Math.max(1, Math.floor(total / 2));
  const voucherCode = `LOAD-SCARCE-${Date.now().toString(36).toUpperCase()}`;
  const variant = await withClient(databaseUrl, async (client) => {
    const { rows } = await client.query<{
      product_id: string;
      product_uid: string;
      shape_key: string;
      length_key: string;
      size: string;
    }>(
      `select pa.product_id, p.product_uid, pa.shape_key, pa.length_key, pa.size
       from product_availability pa
       join products p on p.id = pa.product_id
       where p.product_type = 'nail' and p.hidden = false and p.audience = 'public'
       order by p.product_uid, pa.shape_key, pa.length_key, pa.size
       limit 1`,
    );
    const row = rows[0];
    if (!row) throw new Error('[load] contention: no visible set with stock to make scarce');
    await client.query(
      `update product_availability set quantity = $5
       where product_id = $1 and shape_key = $2 and length_key = $3 and size = $4`,
      [row.product_id, row.shape_key, row.length_key, row.size, units],
    );
    return row;
  });
  await cloneLoadVouchers(databaseUrl, sourceVoucherCode, [voucherCode], voucherQuantity);
  return {
    productId: variant.product_id,
    productUid: variant.product_uid,
    shapeKey: variant.shape_key,
    lengthKey: variant.length_key,
    size: variant.size,
    units,
    voucherCode,
    voucherQuantity,
  };
}

interface DbSample {
  atMs: number;
  connections: number;
  active: number;
  idleInTransaction: number;
  waitingOnLock: number;
  ungrantedLocks: number;
}

export interface DbMetrics {
  intervalMs: number;
  samples: DbSample[];
  peak: Omit<DbSample, 'atMs'>;
  deadlocks: number;
  rateLimitBuckets: number;
}

/** Poll pg_stat_activity / pg_locks every `intervalMs` until `stop()`. */
export async function startDbSampler(
  databaseUrl: string,
  outPath: string,
  intervalMs = 2_000,
): Promise<{ stop: () => Promise<DbMetrics> }> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const deadlocksNow = async (): Promise<number> => {
    const { rows } = await client.query<{ n: string }>(
      `select deadlocks::text as n from pg_stat_database where datname = current_database()`,
    );
    return Number(rows[0]?.n ?? 0);
  };
  const deadlocksBefore = await deadlocksNow();
  const samples: DbSample[] = [];
  let inFlight: Promise<void> = Promise.resolve();
  const sample = async (): Promise<void> => {
    const { rows } = await client.query<{
      connections: number;
      active: number;
      idle_in_transaction: number;
      waiting_on_lock: number;
      ungranted_locks: number;
    }>(
      `select count(*)::int as connections,
              count(*) filter (where state = 'active')::int as active,
              count(*) filter (where state = 'idle in transaction')::int as idle_in_transaction,
              count(*) filter (where wait_event_type = 'Lock')::int as waiting_on_lock,
              (select count(*)::int from pg_locks where not granted) as ungranted_locks
       from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid()`,
    );
    const row = rows[0]!;
    samples.push({
      atMs: Date.now(),
      connections: row.connections,
      active: row.active,
      idleInTransaction: row.idle_in_transaction,
      waitingOnLock: row.waiting_on_lock,
      ungrantedLocks: row.ungranted_locks,
    });
  };
  const timer = setInterval(() => {
    inFlight = inFlight.then(sample).catch(() => undefined);
  }, intervalMs);

  const finish = async (): Promise<DbMetrics> => {
    clearInterval(timer);
    await inFlight;
    const deadlocks = (await deadlocksNow()) - deadlocksBefore;
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from rate_limit_buckets`);
    await client.end();
    const peakOf = (key: keyof Omit<DbSample, 'atMs'>) => Math.max(0, ...samples.map((row) => row[key]));
    const metrics: DbMetrics = {
      intervalMs,
      samples,
      peak: {
        connections: peakOf('connections'),
        active: peakOf('active'),
        idleInTransaction: peakOf('idleInTransaction'),
        waitingOnLock: peakOf('waitingOnLock'),
        ungrantedLocks: peakOf('ungrantedLocks'),
      },
      deadlocks,
      rateLimitBuckets: rows[0]?.n ?? 0,
    };
    writeFileSync(outPath, `${JSON.stringify(metrics, null, 2)}\n`);
    return metrics;
  };
  // Safe to call twice (the caller's finally stops it again on error paths).
  let stopped: Promise<DbMetrics> | undefined;
  return { stop: () => (stopped ??= finish()) };
}

export interface InvariantResult {
  name: string;
  description: string;
  ok: boolean;
  /** Up to 20 offending rows, as returned by the check query. */
  violations: Array<Record<string, unknown>>;
}

/** Each query returns the rows that break the rule; none means it held. */
const INVARIANTS: Array<{ name: string; description: string; sql: string }> = [
  {
    name: 'no_oversold_stock',
    description: 'Units held (live) or consumed never exceed a variant source quantity.',
    sql: `with allocated as (
            select sri.product_id, sri.shape_key, sri.length_key, sri.size, sum(sri.quantity)::int as allocated
            from stock_reservation_items sri
            join stock_reservations sr on sr.id = sri.reservation_id
            where sr.state = 'consumed' or (sr.state = 'held' and sr.expires_at > now())
            group by sri.product_id, sri.shape_key, sri.length_key, sri.size
          )
          select a.product_id, a.shape_key, a.length_key, a.size, a.allocated,
                 coalesce(pa.quantity, 0) as quantity
          from allocated a
          left join product_availability pa
            on pa.product_id = a.product_id and pa.shape_key = a.shape_key
           and pa.length_key = a.length_key and pa.size = a.size
          where a.allocated > coalesce(pa.quantity, 0)`,
  },
  {
    name: 'voucher_quantity_respected',
    description: 'A voucher is never redeemed by more live orders than its quantity.',
    sql: `select v.code, v.quantity, count(*)::int as used
          from vouchers v
          join voucher_redemptions vr on vr.voucher_code = v.code
          join orders o on o.id = vr.order_id and o.status <> 'cancelled'
          group by v.code, v.quantity
          having count(*) > v.quantity`,
  },
  {
    name: 'voucher_per_customer_limit',
    description: 'No customer redeems a capped voucher more often than max_uses_per_user.',
    sql: `select v.code, vr.user_id, v.max_uses_per_user, count(*)::int as used
          from vouchers v
          join voucher_redemptions vr on vr.voucher_code = v.code and vr.user_id is not null
          join orders o on o.id = vr.order_id and o.status <> 'cancelled'
          where v.max_uses_per_user > 0
          group by v.code, vr.user_id, v.max_uses_per_user
          having count(*) > v.max_uses_per_user`,
  },
  {
    name: 'loyalty_lots_in_range',
    description: 'A loyalty lot never goes negative nor above what it granted.',
    sql: `select id, user_id, amount, remaining from loyalty_lots where remaining < 0 or remaining > amount`,
  },
  {
    name: 'one_order_per_gift',
    description: 'A gift offer is paid by at most one order.',
    sql: `select o.gift_offer_id, count(*)::int as orders
          from orders o
          where o.gift_offer_id is not null and o.status <> 'cancelled'
          group by o.gift_offer_id
          having count(*) > 1`,
  },
  {
    name: 'invoice_numbers_contiguous',
    description: 'Invoices issued during the run form one unbroken number range.',
    sql: `select min(n) as first, max(n) as last, count(*)::int as issued
          from (
            select substring(invoice_number from '[0-9]+$')::bigint as n
            from order_invoices where created_at >= $1
          ) numbered
          having count(*) > 0 and max(n) - min(n) + 1 <> count(*)`,
  },
];

export async function checkLoadInvariants(
  databaseUrl: string,
  since: Date,
  outPath: string,
): Promise<InvariantResult[]> {
  const results = await withClient(databaseUrl, async (client) => {
    const out: InvariantResult[] = [];
    for (const invariant of INVARIANTS) {
      const params = invariant.sql.includes('$1') ? [since.toISOString()] : [];
      const { rows } = await client.query<Record<string, unknown>>(invariant.sql, params);
      out.push({
        name: invariant.name,
        description: invariant.description,
        ok: rows.length === 0,
        violations: rows.slice(0, 20),
      });
    }
    return out;
  });
  writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  return results;
}
