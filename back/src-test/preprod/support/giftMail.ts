import type { APIRequestContext } from 'patchright/test';
import { loadTestEnv, testGiftPin } from '../../dev/support/env.js';

export function extractGiftGiverToken(html: string): string {
  const decoded = html.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&');
  const match = decoded.match(/\/gift\/giver\/([A-Fa-f0-9]{64})/i);
  if (!match?.[1]) throw new Error('no gift giver token in mail HTML');
  return match[1];
}

/**
 * Share-card mail HTML only links the giver space. The receiver URL lives in
 * the PDF/JPG QR attachment, so functional tests must not scrape it from the
 * body. Signed-in `POST /gift/offers` returns `receiverUrl`; guests unlock
 * the giver portal with the PIN and read `shareCard.receiverToken`.
 */
export async function resolveGiftReceiverUrl(opts: {
  request: APIRequestContext;
  giverToken: string;
  createReceiverUrl?: string | null;
  pin?: string;
}): Promise<string> {
  const fromCreate = opts.createReceiverUrl?.trim();
  if (fromCreate) {
    try {
      const path = new URL(fromCreate).pathname;
      const match = path.match(/\/gift\/(?!giver\/)([A-Fa-f0-9]{64})\/?$/i);
      if (match?.[1]) return `/gift/${match[1]}`;
    } catch {
      const match = fromCreate.match(/\/gift\/(?!giver\/)([A-Fa-f0-9]{64})/i);
      if (match?.[1]) return `/gift/${match[1]}`;
    }
  }

  const api = loadTestEnv().apiBaseUrl.replace(/\/$/, '');
  const pin = opts.pin ?? testGiftPin;
  const pinRes = await opts.request.post(`${api}/gift/giver/${opts.giverToken}/pin`, {
    data: { pin },
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  const pinJson = (await pinRes.json().catch(() => ({}))) as { pinToken?: string; error?: { code?: string } };
  if (!pinRes.ok() || !pinJson.pinToken) {
    throw new Error(
      `gift giver PIN unlock failed HTTP ${pinRes.status()}: ${JSON.stringify(pinJson)}`,
    );
  }
  const portalRes = await opts.request.get(`${api}/gift/giver/${opts.giverToken}`, {
    headers: {
      Accept: 'application/json',
      'x-gift-pin-token': pinJson.pinToken,
    },
  });
  const portal = (await portalRes.json().catch(() => ({}))) as {
    shareCard?: { receiverToken?: string; receiverUrl?: string } | null;
  };
  if (!portalRes.ok()) {
    throw new Error(`gift giver portal failed HTTP ${portalRes.status()}: ${JSON.stringify(portal)}`);
  }
  const token = portal.shareCard?.receiverToken?.trim();
  if (token) return `/gift/${token}`;
  const url = portal.shareCard?.receiverUrl?.trim();
  if (url) {
    const match = url.match(/\/gift\/(?!giver\/)([A-Fa-f0-9]{64})/i);
    if (match?.[1]) return `/gift/${match[1]}`;
  }
  throw new Error('giver portal response has no shareCard.receiverToken');
}
