import type { Request } from 'express';
import { pool } from '../db/pool.js';
import { verifyAccessToken } from '../platform/security/token.js';
import { findAuthUserById } from '../modules/identity/application/userAuthGuards.js';
import type { AuthenticatedUser } from '../types.js';

interface ResolveAuthenticatedUserOptions {
  includeImpersonator: boolean;
}

/** Resolve a bearer token against both its signature and the current user row.
 * Keeping this in one place prevents required and optional authentication from
 * drifting on account-status or impersonation rules. */
export async function resolveAuthenticatedUser(
  req: Request,
  options: ResolveAuthenticatedUserOptions,
): Promise<AuthenticatedUser | undefined> {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const payload = token ? verifyAccessToken(token) : undefined;
  if (!payload) return undefined;

  const user = await findAuthUserById(pool, payload.sub);
  if (!user || user.status === 'locked' || user.status === 'deleted') return undefined;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    ...(options.includeImpersonator && payload.impersonatorId
      ? { impersonatorId: payload.impersonatorId }
      : {}),
  };
}
