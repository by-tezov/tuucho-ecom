import type { NextFunction, Request, Response } from 'express';
import { SUPER_ADMIN_ROLE } from '../modules/identity/domain/staffPermissions.js';

/** Super-admin gate (role management and role assignment). Impersonation
 * tokens intentionally cannot use it, even if the represented account happens
 * to be a super-admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== SUPER_ADMIN_ROLE || req.user.impersonatorId) {
    res.status(403).json({ success: false, error: { code: 'forbidden' } });
    return;
  }
  next();
}
