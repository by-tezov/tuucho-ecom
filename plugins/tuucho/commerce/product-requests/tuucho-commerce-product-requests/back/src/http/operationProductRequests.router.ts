import { Router } from 'express';
import { pool } from '@kernel/back/db/pool';
import {
  isProductRequestStatus,
  listProductRequests,
  PRODUCT_REQUEST_REFUSAL_REASON_MAX,
  setProductRequestStatus,
  type ProductRequestStatus,
} from '../application/productRequest.js';
import { boundedPrintable } from '@kernel/back/utils/fieldLimits';

export const operationProductRequestsRouter = Router();

const PRODUCT_REQUEST_PUBLIC_ID_RE = /^[A-Fa-f0-9]{8}$/;

function parseProductRequestStatuses(value: unknown): ProductRequestStatus[] | undefined | 'invalid' {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return 'invalid';
  const parts = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'invalid';
  const result: ProductRequestStatus[] = [];
  for (const part of parts) {
    if (!isProductRequestStatus(part)) return 'invalid';
    if (!result.includes(part)) result.push(part);
  }
  return result;
}

/** Backs `npm run product-request -- list`. No local archive — the table
 * print is the whole output. `status` is a comma-separated subset of
 * requested|accepted|refused; omit for every request. */
operationProductRequestsRouter.get('/product-requests', async (req, res) => {
  const statuses = parseProductRequestStatuses(req.query.status);
  if (statuses === 'invalid') {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
    });
    return;
  }
  const requests = await listProductRequests(pool, statuses);
  res.json({ success: true, requests });
});

/** Backs `npm run product-request -- set-status`. `refused` requires
 * `reason`; other statuses reject a reason. Re-sending the current status
 * (same reason when refused) is a no-op. */
operationProductRequestsRouter.patch('/product-requests/:publicId/status', async (req, res) => {
  const publicId = String(req.params.publicId ?? '');
  if (!PRODUCT_REQUEST_PUBLIC_ID_RE.test(publicId)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const status = isProductRequestStatus(req.body?.status) ? req.body.status : undefined;
  if (!status) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
    });
    return;
  }
  let reason: string | null = null;
  if (req.body?.reason !== undefined && req.body?.reason !== null) {
    if (typeof req.body.reason !== 'string') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const trimmed = req.body.reason.trim();
    if (trimmed.length > 0) {
      const parsed = boundedPrintable(trimmed, PRODUCT_REQUEST_REFUSAL_REASON_MAX);
      if (!parsed) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      reason = parsed;
    }
  }
  const result = await setProductRequestStatus(pool, publicId.toUpperCase(), status, reason);
  if (!result.ok) {
    res.status(result.reason === 'not_found' ? 404 : 400).json({
      success: false,
      error: { code: result.reason },
      ...(result.reason === 'invalid_request' ? { message: result.message } : {}),
    });
    return;
  }
  res.json({ success: true, changed: result.changed, request: result.request });
});
