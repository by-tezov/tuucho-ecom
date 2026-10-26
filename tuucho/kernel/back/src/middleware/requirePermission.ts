import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { pool } from '../db/pool.js';
import { accountHasPermission } from '../modules/identity/application/staffRoles.js';
import { isStaffRole, type PermissionCode } from '../modules/identity/domain/staffPermissions.js';

function forbidden(res: Response): void {
  res.status(403).json({ success: false, error: { code: 'forbidden' } });
}

/** Administration-section gate: passes when the signed-in account's roles
 * (with everything they inherit, merged by the dominance rules) hold at least
 * one of `codes`; a super-admin holds them all. Grants are read from the
 * database on every request, so revoking one applies immediately. Like
 * `requireAdmin`, an impersonation token never passes. Mount after
 * `requireAuth`. */
export function requirePermission(...codes: PermissionCode[]): RequestHandler {
  const handler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || req.user.impersonatorId) return forbidden(res);
    if (!(await accountHasPermission(pool, req.user, codes))) return forbidden(res);
    next();
  };
  // Named after its grant so the route inventory (tuucho/docs/api/09-reference.md)
  // shows which permission gates each route.
  Object.defineProperty(handler, 'name', { value: `requirePermission(${codes.join('/')})` });
  return handler;
}

/** Any staff role (not a customer), regardless of its grants. */
export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.impersonatorId || !isStaffRole(req.user.role)) return forbidden(res);
  next();
}
