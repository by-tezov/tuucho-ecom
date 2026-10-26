import type pg from 'pg';
import {
  recordActivityBestEffort,
  type RecordActivityInput,
} from '../../activity/application/recordActivity.js';
import { SUPER_ADMIN_ROLE } from '../../identity/domain/staffPermissions.js';
import { notifySuperAdminSession } from './superAdminSignInAlert.js';

type SignInAccount = { id: string; email: string; role: string };
type SignInMeta = { ip: string | undefined; userAgent: string | undefined };

type SignInActivityRecorder = (
  db: pg.Pool | pg.PoolClient,
  input: RecordActivityInput,
) => Promise<unknown>;

/** The journal input for a super-admin sign-in, or null for any other role.
 * Detail keys stay clear of the journal redaction pattern (no password,
 * token, session, or similar names). */
export function superAdminSignInActivity(
  account: SignInAccount,
  meta: SignInMeta,
  kind: 'signin' | 'resume',
): RecordActivityInput | null {
  if (account.role !== SUPER_ADMIN_ROLE) return null;
  return {
    category: 'accounts',
    action: 'accounts.signin',
    summary: 'Connexion super-admin.',
    outcome: 'success',
    origin: 'admin',
    actorUserId: account.id,
    actorEmail: account.email,
    actorLabel: account.email,
    detail: { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null, kind },
  };
}

type SignInNotifier = (
  pool: pg.Pool,
  account: SignInAccount,
  meta: SignInMeta,
  kind: 'signin' | 'resume',
) => void;

/** Journals and e-mails a super-admin session start (`accounts.signin`).
 * `signin` is a password, one-time code, or social login. `resume` is an
 * automatic sign-in after the idle window. Any other role is ignored.
 * Both writes are detached: a failure is logged and never affects the
 * sign-in itself. */
export function recordSuperAdminSignIn(
  pool: pg.Pool,
  account: SignInAccount,
  meta: SignInMeta,
  kind: 'signin' | 'resume' = 'signin',
  record: SignInActivityRecorder = recordActivityBestEffort,
  notify: SignInNotifier = notifySuperAdminSession,
): void {
  const input = superAdminSignInActivity(account, meta, kind);
  if (!input) return;
  notify(pool, account, meta, kind);
  void Promise.resolve(record(pool, input)).catch((error) => {
    console.error('[auth] super-admin sign-in journal failed', error);
  });
}
