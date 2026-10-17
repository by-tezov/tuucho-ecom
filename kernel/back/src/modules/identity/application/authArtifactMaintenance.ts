import type pg from 'pg';

const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let nextMaintenanceAt = 0;
let maintenanceInFlight: Promise<void> | undefined;

/** Remove authentication artefacts only after their security purpose and
 * rolling-limit window have both elapsed. This is opportunistic maintenance,
 * not a cron: at most one best-effort run starts per process every six hours
 * when an auth artefact is issued. It never blocks the customer request. */
async function pruneExpiredAuthArtifacts(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: lockRows } = await client.query<{ locked: boolean }>(
      // Postgres 10 (LWS): two-int lock + hashtext, not hashtextextended.
      `select pg_try_advisory_xact_lock(87217, hashtext('auth-artifact-maintenance')) as locked`,
    );
    if (!lockRows[0]?.locked) {
      await client.query('rollback');
      return;
    }

    // A surviving row can theoretically reference a doomed replacement if
    // historical data was imported out of chronological order. Clear that
    // expired-only edge before deleting so the self-FK stays valid.
    await client.query(`
      with doomed as (
        select id from refresh_tokens
         where expires_at < now() - interval '7 days'
      )
      update refresh_tokens
         set replaced_by = null
       where replaced_by in (select id from doomed)
         and id not in (select id from doomed)
    `);
    await client.query(`delete from refresh_tokens where expires_at < now() - interval '7 days'`);

    await client.query(`
      delete from auth_otp_tokens
       where expires_at < now() - interval '7 days'
          or used_at < now() - interval '7 days'
    `);
    await client.query(`
      delete from email_confirmation_tokens
       where expires_at < now() - interval '7 days'
          or used_at < now() - interval '7 days'
    `);
    await client.query(`
      delete from password_reset_tokens
       where expires_at < now() - interval '7 days'
          or used_at < now() - interval '7 days'
    `);

    // Monthly send caps use a one-month rolling window. Thirty-five days
    // leaves margin for month length/timezone boundaries before pruning.
    await client.query(`delete from auth_otp_sends where sent_at < now() - interval '35 days'`);
    await client.query(`delete from email_confirmation_sends where sent_at < now() - interval '35 days'`);
    await client.query(`delete from password_reset_sends where sent_at < now() - interval '35 days'`);
    await client.query(`delete from email_change_sends where sent_at < now() - interval '35 days'`);

    // One-shot social / lock tokens: useless once expired or used, and they
    // used to stay forever (the signup and pending ones have no user FK, so
    // not even an account deletion removed them).
    for (const table of [
      'google_signup_tokens',
      'facebook_signup_tokens',
      'apple_signup_tokens',
      'social_auth_pending',
      'google_link_tokens',
      'facebook_link_tokens',
      'apple_link_tokens',
      'account_lock_tokens',
      'account_unlock_tokens',
    ]) {
      await client.query(
        `delete from ${table}
          where expires_at < now() - interval '7 days'
             or used_at < now() - interval '7 days'`,
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function scheduleAuthArtifactMaintenance(pool: pg.Pool): void {
  const now = Date.now();
  if (now < nextMaintenanceAt || maintenanceInFlight) return;
  nextMaintenanceAt = now + MAINTENANCE_INTERVAL_MS;
  maintenanceInFlight = pruneExpiredAuthArtifacts(pool)
    .catch((error) => {
      console.error('[auth maintenance] expired-artifact pruning failed', error);
      // A transient failure may retry on the next issuance rather than wait
      // the complete interval.
      nextMaintenanceAt = 0;
    })
    .finally(() => {
      maintenanceInFlight = undefined;
    });
}
