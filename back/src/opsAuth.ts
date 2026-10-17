/** Shared OPS_TOKEN gate for the loopback ops server and the optional Node
 * ops gateway wrapper. `/healthz` stays open for readiness probes; every
 * `/operation/*` route requires `Authorization: Bearer <OPS_TOKEN>`. */
import type { NextFunction, Request, Response } from 'express';

export function requireOpsToken(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.OPS_TOKEN?.trim();
  if (!token || req.header('authorization') !== `Bearer ${token}`) {
    res.status(401).json({ success: false, error: { code: 'unauthorized' } });
    return;
  }
  next();
}
