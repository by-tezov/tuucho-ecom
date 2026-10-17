import type { NextFunction, Request, Response } from 'express';
import { appendApiLog, apiLogEnabled } from '../platform/http/apiLog.js';
import { config } from '../config/env.js';
import { verifyAccessToken } from '../platform/security/token.js';
import {
  headersForLog,
  redactForLog,
  responseBodyForLog,
  type LogRedaction,
} from '../platform/http/apiLogSerialization.js';

/** True for the readers and the clear of this journal. Logging them would
 * append the tail to itself on every open. */
export function isApiLogSelfRequest(path: string): boolean {
  return (
    path.startsWith('/operation/log/api') ||
    path.startsWith('/admin/api-log') ||
    path.startsWith('/operation/log/email') ||
    path.startsWith('/admin/email-log')
  );
}

/** The access token is redacted, so the journal keeps the account id beside it. */
export function requestHeadersForLog(
  headers: Record<string, unknown>,
  mode: LogRedaction,
): Record<string, unknown> {
  const logged = headersForLog(headers, mode);
  const raw = headers.authorization ?? headers.Authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const payload = token ? verifyAccessToken(token) : undefined;
  if (!payload) return logged;
  logged['x-user-id'] = payload.sub;
  if (payload.impersonatorId) logged['x-impersonator-id'] = payload.impersonatorId;
  return logged;
}

/** Captures every normal API response once it has finished. The journal's
 * own read and clear routes are excluded: logging their response would append
 * the entire tail again and make each read grow the file recursively.
 *
 * Request and response bodies are always stored, bounded by
 * `API_LOG_BODY_MAX_BYTES`. Credentials are redacted in every environment.
 * Production also anonymizes personal data. A signed-in call keeps the user id. */
export function apiRequestLog(req: Request, res: Response, next: NextFunction): void {
  if (!apiLogEnabled() || isApiLogSelfRequest(req.path)) {
    next();
    return;
  }
  const startedAt = process.hrtime.bigint();
  const chunks: Buffer[] = [];
  let capturedBytes = 0;
  let truncated = false;
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const capture = (chunk: unknown, encoding?: BufferEncoding) => {
    if (chunk === undefined || truncated) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding);
    const remaining = config.apiLog.bodyMaxBytes - capturedBytes;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    if (buffer.byteLength > remaining) {
      chunks.push(buffer.subarray(0, remaining));
      capturedBytes += remaining;
      truncated = true;
      return;
    }
    chunks.push(buffer);
    capturedBytes += buffer.byteLength;
  };
  res.write = ((chunk: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    capture(chunk, typeof encoding === 'string' ? encoding : undefined);
    return originalWrite(chunk as never, encoding as never, callback as never);
  }) as typeof res.write;
  res.end = ((chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    capture(chunk, typeof encoding === 'string' ? encoding : undefined);
    return originalEnd(chunk as never, encoding as never, callback as never);
  }) as typeof res.end;
  res.on('finish', () => {
    const contentType = String(res.getHeader('content-type') ?? '');
    const mode: LogRedaction = config.target === 'prod' ? 'anonymous' : 'secrets';
    appendApiLog({
      at: new Date().toISOString(),
      target: config.target,
      request: {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        query: redactForLog(req.query, undefined, mode),
        headers: requestHeadersForLog(req.headers, mode),
        body: redactForLog(req.body ?? null, undefined, mode),
      },
      response: {
        status: res.statusCode,
        headers: headersForLog(res.getHeaders(), mode),
        body: responseBodyForLog(contentType, Buffer.concat(chunks), truncated, mode),
      },
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
    });
  });
  next();
}
