import { Router, type Response } from 'express';
import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { processInboundRawEmail } from '../application/chatInbound.js';
import { simpleParser } from 'mailparser';
import {
  appendProductRequestCustomerMessage,
  validProductRequestReplyToken,
} from '../../contact/application/productRequest.js';
import { extractNewReplyText } from '../application/chatInbound.js';
import {
  appendOwnerMessage,
  closeSession,
  findSessionByPublicId,
  listMessages,
  listSessions,
  processChatNotificationOutbox,
  reopenSession,
  toOpsSession,
  toPublicMessage,
} from '../../chat/application/chat.js';
import { hasChatSessionSubscribers } from '../../chat/application/chatSse.js';
import { boundedPrintable } from '../../../utils/fieldLimits.js';

export const chatOpsRouter = Router();

function fail(res: Response, status: number, code: string): void {
  res.status(status).json({ success: false, error: { code } });
}

async function sessionFromParam(value: unknown) {
  return findSessionByPublicId(pool, String(value ?? '').toUpperCase());
}

chatOpsRouter.get('/sessions', async (req, res) => {
  const requested = String(req.query.status ?? 'open');
  const status = requested === 'closed' || requested === 'all' ? requested : 'open';
  const sessions = await listSessions(pool, status);
  res.json({
    success: true,
    data: {
      sessions: sessions.map((session) => ({
        publicId: session.public_id,
        status: session.status,
        visitorEmail: session.visitor_email,
        visitorIdentity: session.visitor_identity,
        createdAt: session.created_at,
        lastMessageAt: session.last_message_at,
        closedAt: session.closed_at,
        messageCount: Number(session.message_count) || 0,
        // Is the customer still on the page: a reply read now, or one that has
        // to become an email. Per audience because the operator's own panel
        // subscribes to the same session. See docs/api/05-contact-chat.md.
        visitorLive: hasChatSessionSubscribers(session.id, 'visitor'),
      })),
    },
  });
});

chatOpsRouter.get('/sessions/:publicId', async (req, res) => {
  const session = await sessionFromParam(req.params.publicId);
  if (!session) {
    fail(res, 404, 'not_found');
    return;
  }
  res.json({ success: true, data: { session: toOpsSession(session, await listMessages(pool, session.id)) } });
});

chatOpsRouter.post('/sessions/:publicId/messages', async (req, res) => {
  const session = await sessionFromParam(req.params.publicId);
  const body = boundedPrintable(req.body?.body, config.fieldLimits.contactMessageMax);
  if (!session) {
    fail(res, 404, 'not_found');
    return;
  }
  if (!body) {
    fail(res, 400, 'invalid_request');
    return;
  }
  const message = await appendOwnerMessage(pool, session, body, null, 'web');
  res.status(201).json({ success: true, data: { message: toPublicMessage(message) } });
});

chatOpsRouter.post('/sessions/:publicId/close', async (req, res) => {
  const session = await sessionFromParam(req.params.publicId);
  if (!session) {
    fail(res, 404, 'not_found');
    return;
  }
  const result = await closeSession(pool, session);
  res.json({
    success: true,
    data: { session: toOpsSession(result.session, await listMessages(pool, result.session.id)) },
  });
});

chatOpsRouter.post('/sessions/:publicId/reopen', async (req, res) => {
  const session = await sessionFromParam(req.params.publicId);
  if (!session) {
    fail(res, 404, 'not_found');
    return;
  }
  const result = await reopenSession(pool, session);
  res.json({
    success: true,
    data: { session: toOpsSession(result.session, await listMessages(pool, result.session.id)) },
  });
});

chatOpsRouter.post('/notifications/process', async (req, res) => {
  const number = Number(req.body?.limit ?? 25);
  const limit = Number.isSafeInteger(number) ? Math.max(1, Math.min(number, 100)) : 25;
  res.json({ success: true, data: await processChatNotificationOutbox(pool, limit) });
});

chatOpsRouter.post('/inbound', async (req, res) => {
  const raw =
    typeof req.body?.raw === 'string'
      ? req.body.raw
      : typeof req.body?.rawBase64 === 'string'
        ? Buffer.from(req.body.rawBase64, 'base64')
        : null;
  if (!raw || (typeof raw === 'string' && !raw.trim())) {
    fail(res, 400, 'invalid_request');
    return;
  }
  const parsed = await simpleParser(raw);
  const marker = /PAMSURIN-REQUEST:([A-F0-9]{8}):([a-f0-9]{24}):v\d+\.\d+\.\d+:(?:preprod|prod)/i.exec(
    `${parsed.text ?? ''}\n${parsed.html ?? ''}`,
  );
  const publicId = String(
    parsed.headers.get('x-pamsurin-product-request') ?? marker?.[1] ?? '',
  ).toUpperCase();
  const token = String(parsed.headers.get('x-pamsurin-product-token') ?? marker?.[2] ?? '');
  if (/^[A-F0-9]{8}$/.test(publicId) && validProductRequestReplyToken(publicId, token)) {
    const body = extractNewReplyText(parsed.text ?? '');
    if (!body) return void res.json({ success: true, data: { outcome: 'ignored', reason: 'empty_body' } });
    const request = await appendProductRequestCustomerMessage(pool, publicId, body, parsed.messageId ?? null);
    return void res.json({
      success: true,
      data: request ? { outcome: 'accepted', publicId } : { outcome: 'ignored', reason: 'not_found' },
    });
  }
  res.json({ success: true, data: await processInboundRawEmail(pool, raw) });
});
