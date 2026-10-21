import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { pool } from '../../../db/pool.js';

/** A queue key. Deliberately an open string: `messaging` owns the queue, the
 * retry policy and the drain loop, and must not know which features exist.
 * Each feature declares its own kind and registers a deliverer for it. */
export type MailJobKind = string;

export type MailJobStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'dead';

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 10;
/** Matches the reclaim predicate in `processMailJobs` (`processing` older
 * than 10 minutes). Used only to schedule the next one-shot wake. */
const STUCK_PROCESSING_RECLAIM_MS = 10 * 60 * 1000;

type MailJobRow = {
  id: string;
  kind: MailJobKind;
  payload: unknown;
  attempts: number;
};

function backoffSeconds(attemptsAfterIncrement: number): number {
  return Math.min(300, 2 ** Math.max(0, attemptsAfterIncrement - 1));
}

/** Delay until `when`, clamped to `[0, 2^31-1]` so `setTimeout` stays valid. */
function mailJobWakeDelayMs(when: Date, nowMs = Date.now()): number {
  const raw = when.getTime() - nowMs;
  if (raw <= 0) return 0;
  return Math.min(raw, 2_147_483_647);
}

export async function enqueueMailJob(
  db: pg.Pool | pg.PoolClient,
  kind: MailJobKind,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into mail_jobs (id, kind, payload, status, next_attempt_at)
     values ($1, $2, $3::jsonb, 'pending', now())`,
    [id, kind, JSON.stringify(payload)],
  );
  // Wake after the insert returns. On the common auto-commit `pool.query`
  // path the row is already visible, so this drains it immediately. A caller
  // passing a transaction client has not committed yet, so this drain cannot
  // see the row: that caller wakes again after commit.
  wakeMailJobWorker();
  return id;
}

export type MailJobDeliverer = (payload: unknown) => Promise<void>;

const deliverers = new Map<MailJobKind, MailJobDeliverer>();

/**
 * Registers how one kind of queued mail is actually sent.
 *
 * This is the inversion that keeps `messaging` at the bottom of the module
 * graph: the queue used to import gift and orders to dispatch their mail,
 * which made the mail layer depend on the features that use it. Now each
 * feature hands its deliverer in, and `messaging` depends on nothing above it.
 *
 * Registration is idempotent so a module imported twice is harmless, and it
 * must happen before the worker drains: the assembly root imports the
 * registration modules (see src/app.ts).
 */
export function registerMailJobDeliverer(kind: MailJobKind, deliver: MailJobDeliverer): void {
  deliverers.set(kind, deliver);
}

async function deliverJob(row: MailJobRow): Promise<void> {
  const deliver = deliverers.get(row.kind);
  // A queued row whose feature never registered is a wiring bug, not a
  // transient failure. Throwing puts it through the normal retry/dead path
  // with a message that names the missing kind.
  if (!deliver) throw new Error(`unknown_mail_kind:${row.kind}`);
  await deliver(row.payload);
}

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let nextPruneAt = 0;

/** Finished jobs (sent, or dead after every retry) are kept 30 days for
 * diagnosis and then dropped: they used to stay forever, payloads included.
 * At most once per process every six hours, never failing the drain. */
async function pruneFinishedMailJobs(db: pg.Pool): Promise<void> {
  const now = Date.now();
  if (now < nextPruneAt) return;
  nextPruneAt = now + PRUNE_INTERVAL_MS;
  try {
    await db.query(
      `delete from mail_jobs
       where status in ('sent', 'dead') and updated_at < now() - interval '30 days'`,
    );
  } catch (error) {
    console.error('[mail jobs] finished-job prune failed', error);
  }
}

/** Claim and send up to `limit` due mail jobs. Safe under concurrent workers. */
async function processMailJobs(
  db: pg.Pool,
  limit = BATCH_SIZE,
): Promise<{
  sent: number;
  failed: number;
  dead: number;
}> {
  const result = { sent: 0, failed: 0, dead: 0 };
  await pruneFinishedMailJobs(db);
  for (let processed = 0; processed < limit; processed += 1) {
    const client = await db.connect();
    let row: MailJobRow | undefined;
    await client.query('begin');
    try {
      const { rows } = await client.query<MailJobRow>(
        `select id, kind, payload, attempts
         from mail_jobs
         where (
             (status in ('pending', 'failed') and next_attempt_at <= now())
             or (status = 'processing' and updated_at < now() - interval '10 minutes')
           )
         order by next_attempt_at asc, created_at asc
         for update skip locked
         limit 1`,
      );
      row = rows[0];
      if (!row) {
        await client.query('commit');
        break;
      }
      await client.query(
        `update mail_jobs
            set status = 'processing', attempts = attempts + 1, updated_at = now()
          where id = $1`,
        [row.id],
      );
      row = { ...row, attempts: row.attempts + 1 };
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    if (!row) break;
    try {
      await deliverJob(row);
      await db.query(
        `update mail_jobs
            set status = 'sent', last_error = null, updated_at = now()
          where id = $1 and status = 'processing'`,
        [row.id],
      );
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'send_failed';
      if (row.attempts >= MAX_ATTEMPTS) {
        await db.query(
          `update mail_jobs
              set status = 'dead', last_error = $2, updated_at = now()
            where id = $1 and status = 'processing'`,
          [row.id, message],
        );
        result.dead += 1;
      } else {
        const delay = backoffSeconds(row.attempts);
        await db.query(
          `update mail_jobs
              set status = 'failed',
                  last_error = $2,
                  next_attempt_at = now() + make_interval(secs => $3),
                  updated_at = now()
            where id = $1 and status = 'processing'`,
          [row.id, message, delay],
        );
        result.failed += 1;
      }
    }
  }
  return result;
}

let workerStarted = false;
let workerRunning = false;
/** Set while a drain is in flight so a concurrent enqueue asks for another pass. */
let workerDirty = false;
let deferredTimer: ReturnType<typeof setTimeout> | null = null;
let missingTableLogged = false;
/** Resolvers waiting on `stopMailJobWorker` while a drain is still in flight. */
const stopWaiters: Array<() => void> = [];

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '42P01'
  );
}

function clearDeferredWake(): void {
  if (!deferredTimer) return;
  clearTimeout(deferredTimer);
  deferredTimer = null;
}

/** Earliest time any live row becomes claimable (retry backoff or stuck reclaim). */
async function nextMailJobDueAt(db: pg.Pool): Promise<Date | null> {
  const { rows } = await db.query<{ next_at: Date | string | null }>(
    `select min(due_at) as next_at
       from (
         select next_attempt_at as due_at
           from mail_jobs
          where status in ('pending', 'failed')
         union all
         select updated_at + make_interval(secs => $1)
           from mail_jobs
          where status = 'processing'
       ) due`,
    [STUCK_PROCESSING_RECLAIM_MS / 1000],
  );
  const raw = rows[0]?.next_at;
  if (raw == null) return null;
  return raw instanceof Date ? raw : new Date(raw);
}

/** Longest an idle process may sleep. Nothing due means nothing this process
 * can see is due: a row inserted in a transaction that has not committed yet
 * (see `enqueueMailJob`) and a row another process claimed and then died on
 * are both invisible to the query above. Sleeping on that answer forever is
 * what would lose them, so idle still re-checks on this floor. */
const IDLE_FLOOR_WAKE_MS = STUCK_PROCESSING_RECLAIM_MS;

async function scheduleDeferredWake(): Promise<void> {
  clearDeferredWake();
  if (!workerStarted) return;
  // A failure here still schedules the floor wake. Giving up instead would
  // park the worker for the life of the process — which is exactly what a
  // boot before `database-migrate` used to look like: the table is missing
  // now, present a minute later, and nothing would have come back to look.
  let nextAt: Date | null = null;
  try {
    nextAt = await nextMailJobDueAt(pool);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      if (!missingTableLogged) {
        missingTableLogged = true;
        console.error('[mail-jobs] skipped: mail_jobs relation is missing (run migrations)');
      }
    } else {
      console.error('[mail-jobs] could not schedule next wake', error);
    }
  }
  const delayMs = nextAt ? Math.min(mailJobWakeDelayMs(nextAt), IDLE_FLOOR_WAKE_MS) : IDLE_FLOOR_WAKE_MS;
  deferredTimer = setTimeout(() => {
    deferredTimer = null;
    wakeMailJobWorker();
  }, delayMs);
  deferredTimer.unref?.();
}

async function drainMailJobs(): Promise<void> {
  for (;;) {
    const result = await processMailJobs(pool);
    const handled = result.sent + result.failed + result.dead;
    // A short batch means the queue is drained: only a full one can have
    // left more behind.
    if (handled < BATCH_SIZE) return;
  }
}

function notifyStopWaiters(): void {
  if (stopWaiters.length === 0) return;
  const waiters = stopWaiters.splice(0, stopWaiters.length);
  for (const resolve of waiters) resolve();
}

/**
 * Event wake: coalesce concurrent kicks into one drain. A one-shot timer
 * covers retry backoff and stuck `processing` reclaim, so an idle process
 * only re-checks on `IDLE_FLOOR_WAKE_MS` instead of polling.
 */
/** Kick the drain. Transactional enqueues call this again after commit. */
export function wakeMailJobWorker(): void {
  if (!workerStarted) return;
  workerDirty = true;
  if (workerRunning) return;
  workerRunning = true;
  clearDeferredWake();
  void (async () => {
    try {
      do {
        workerDirty = false;
        try {
          await drainMailJobs();
        } catch (error) {
          if (isUndefinedTableError(error)) {
            if (!missingTableLogged) {
              missingTableLogged = true;
              console.error('[mail-jobs] skipped: mail_jobs relation is missing (run migrations)');
            }
          } else {
            console.error('[mail-jobs] worker drain failed', error);
          }
          // Falls through to the deferred wake below rather than returning:
          // a drain that threw must still come back and try again.
          workerDirty = false;
          break;
        }
      } while (workerDirty && workerStarted);
    } finally {
      workerRunning = false;
      notifyStopWaiters();
    }
    if (!workerStarted) return;
    if (workerDirty) {
      wakeMailJobWorker();
      return;
    }
    await scheduleDeferredWake();
  })();
}

/** Starts the event-driven drain once per process from app boot. */
export function startMailJobWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  // Catch rows left from a previous crash / process restart, then sleep.
  wakeMailJobWorker();
}

/**
 * Stop accepting wakes and wait for an in-flight drain to finish (bounded).
 * Used by process shutdown so teardown can drop the disposable test database
 * without the worker reconnecting with a dead role.
 */
export async function stopMailJobWorker(timeoutMs = 5_000): Promise<void> {
  workerStarted = false;
  workerDirty = false;
  clearDeferredWake();
  if (!workerRunning) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      const idx = stopWaiters.indexOf(onDone);
      if (idx >= 0) stopWaiters.splice(idx, 1);
      resolve();
    };
    const onDone = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    stopWaiters.push(onDone);
    // Drain may have finished between the workerRunning read and the push.
    if (!workerRunning) finish();
  });
}
