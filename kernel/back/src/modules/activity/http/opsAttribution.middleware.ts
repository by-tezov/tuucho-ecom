import type { NextFunction, Request, Response } from 'express';
import { sanitizeSourceCommand } from '../domain/redaction.js';
import {
  runWithOperatorAttribution,
  type OperatorAttribution,
} from '../application/operatorContext.js';

const HEADER_USER = 'x-pam-operator-user';
const HEADER_HOST = 'x-pam-operator-host';
const HEADER_MODE = 'x-pam-mode';
const HEADER_COMMAND = 'x-pam-source-command';

declare module 'express-serve-static-core' {
  interface Request {
    opsAttribution?: OperatorAttribution;
  }
}

/** Capture CLI attribution headers for the request. Not authentication:
 * OPS_TOKEN remains the only credential. */
export function captureOpsAttribution(req: Request, _res: Response, next: NextFunction): void {
  const attribution: OperatorAttribution = {
    operatorUser: header(req, HEADER_USER),
    operatorHost: header(req, HEADER_HOST),
    mode: header(req, HEADER_MODE),
    sourceCommand: sanitizeSourceCommand(header(req, HEADER_COMMAND)),
  };
  req.opsAttribution = attribution;
  runWithOperatorAttribution(attribution, () => next());
}

function header(req: Request, name: string): string | null {
  const value = req.header(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 200);
  return trimmed || null;
}
