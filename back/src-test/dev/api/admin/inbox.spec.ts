import sharp from 'sharp';
import { test, expect } from 'patchright/test';
import { apiJson, pickPurchasableVariant, registerAdmin, registerUser, uniqueEmail } from '../../support/api.js';
import { loadTestEnv } from '../../support/env.js';

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type AdminChat = {
  publicId: string;
  status: string;
  visitorEmail: string;
  messages: Array<{ id: number; sender: 'user' | 'owner'; body: string; attachments: Array<{ id: number }> }>;
  ownerEmailSuppressedUntil?: string | null;
};

async function pngPixel(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 40, g: 80, b: 200 } } })
    .png()
    .toBuffer();
}

/** Walks the admin pager to find one record, since the disposable database
 * accumulates conversations and contacts from every other spec. */
async function findOnPages<T>(
  load: (page: number) => Promise<{ items: T[]; totalPages: number }>,
  match: (item: T) => boolean,
): Promise<T | undefined> {
  let page = 1;
  let totalPages = 1;
  do {
    const { items, totalPages: pages } = await load(page);
    const hit = items.find(match);
    if (hit) return hit;
    totalPages = pages;
    page += 1;
  } while (page <= totalPages && page <= 10);
  return undefined;
}

test.describe('API admin inbox', () => {
  test('an account conversation: is answered, notified and closed from the dashboard', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);

    const { body: opened } = await apiJson<{ data?: { session?: { publicId: string } } }>(
      request,
      'POST',
      '/account/chat/sessions',
      { token: customer.accessToken, data: { body: 'Ma commande est-elle partie ?' }, expectedStatus: 201 },
    );
    const publicId = opened.data!.session!.publicId;

    // A status is always required — the hub never loads everything at once.
    await apiJson(request, 'GET', '/admin/chats', { token: admin.accessToken, expectedStatus: 400 });
    await apiJson(request, 'GET', '/admin/chats?status=maybe', {
      token: admin.accessToken,
      expectedStatus: 400,
    });

    const summary = await findOnPages<{ publicId: string; email: string; messageCount: number; preview: string }>(
      async (page) => {
        const { body } = await apiJson<{
          chats?: Array<{ publicId: string; email: string; messageCount: number; preview: string }>;
          pagination?: Pagination;
          ownerEmailSuppressionTimeoutMs?: number;
        }>(request, 'GET', `/admin/chats?status=open&page=${page}`, {
          token: admin.accessToken,
          expectedStatus: 200,
        });
        expect(body.pagination?.pageSize).toBe(20);
        expect(typeof body.ownerEmailSuppressionTimeoutMs).toBe('number');
        return { items: body.chats ?? [], totalPages: body.pagination?.totalPages ?? 1 };
      },
      (chat) => chat.publicId === publicId,
    );
    expect(summary?.email).toBe(customer.email);
    expect(summary?.messageCount).toBe(1);
    expect(summary?.preview).toContain('Ma commande');

    const { body: transcript } = await apiJson<{ chat?: AdminChat }>(
      request,
      'GET',
      `/admin/chats/${publicId}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(transcript.chat?.visitorEmail).toBe(customer.email);
    expect(transcript.chat?.ownerEmailSuppressedUntil).toBeNull();
    await apiJson(request, 'GET', '/admin/chats/ZZZZZZZZ', {
      token: admin.accessToken,
      expectedStatus: 404,
    });

    await apiJson(request, 'POST', `/admin/chats/${publicId}/messages`, {
      token: admin.accessToken,
      data: { body: '   ' },
      expectedStatus: 400,
    });
    const reply = await request.post(`/admin/chats/${publicId}/messages`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      multipart: {
        body: 'Oui, elle part demain.',
        images: { name: 'colis.png', mimeType: 'image/png', buffer: await pngPixel() },
      },
    });
    expect(reply.status()).toBe(201);
    const replyBody = (await reply.json()) as { message?: { sender?: string; attachments?: Array<{ id: number }> } };
    expect(replyBody.message?.sender).toBe('owner');
    const attachmentId = replyBody.message?.attachments?.[0]?.id;
    expect(attachmentId).toBeTruthy();

    // Private attachments are admin-only on this route.
    const image = await request.get(`/admin/chats/${publicId}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/jpeg');
    const stolen = await request.get(`/admin/chats/${publicId}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    expect(stolen.status()).toBe(403);
    const missing = await request.get(`/admin/chats/${publicId}/attachments/999999`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    expect(missing.status()).toBe(404);

    // The customer sees the reply in their own transcript.
    const { body: customerView } = await apiJson<{
      data?: { session?: { messages: Array<{ sender: string }> }; unreadOwnerCount?: number };
    }>(request, 'GET', `/account/chat/sessions/${publicId}`, {
      token: customer.accessToken,
      expectedStatus: 200,
    });
    expect(customerView.data?.session?.messages.map((message) => message.sender)).toEqual(['user', 'owner']);
    // An admin reply never mails the customer by itself, so it is unread.
    expect(customerView.data?.unreadOwnerCount).toBe(1);

    // Suppressing the owner-notify email is temporary and self-clearing.
    await apiJson(request, 'PATCH', `/admin/chats/${publicId}/owner-email-notification`, {
      token: admin.accessToken,
      data: { suppressed: 'maybe' },
      expectedStatus: 400,
    });
    const { body: suppressed } = await apiJson<{
      ownerEmailSuppressedUntil?: string | null;
      ownerEmailSuppressionTimeoutMs?: number;
    }>(request, 'PATCH', `/admin/chats/${publicId}/owner-email-notification`, {
      token: admin.accessToken,
      data: { suppressed: true },
      expectedStatus: 200,
    });
    expect(Date.parse(suppressed.ownerEmailSuppressedUntil!)).toBeGreaterThan(Date.now());
    expect(suppressed.ownerEmailSuppressionTimeoutMs).toBeGreaterThan(0);
    const { body: restored } = await apiJson<{ ownerEmailSuppressedUntil?: string | null }>(
      request,
      'PATCH',
      `/admin/chats/${publicId}/owner-email-notification`,
      { token: admin.accessToken, data: { suppressed: false }, expectedStatus: 200 },
    );
    expect(restored.ownerEmailSuppressedUntil).toBeNull();

    // Notification is an explicit, separate action.
    const { body: notified } = await apiJson<{ sent?: boolean; reason?: string }>(
      request,
      'POST',
      `/admin/chats/${publicId}/notify`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(typeof notified.sent).toBe('boolean');
    await apiJson(request, 'POST', '/admin/chats/ZZZZZZZZ/notify', {
      token: admin.accessToken,
      expectedStatus: 404,
    });

    // The admin stream is the same bearer-authenticated shape as the
    // customer's, and 404s an unknown conversation before any header.
    await apiJson(request, 'GET', '/admin/chats/ZZZZZZZZ/events', {
      token: admin.accessToken,
      expectedStatus: 404,
    });
    const controller = new AbortController();
    try {
      const stream = await fetch(`${loadTestEnv().apiBaseUrl}/admin/chats/${publicId}/events`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        signal: controller.signal,
      });
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toContain('text/event-stream');
    } finally {
      controller.abort();
    }

    const { body: closed } = await apiJson<{ chat?: AdminChat }>(
      request,
      'POST',
      `/admin/chats/${publicId}/close`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(closed.chat?.status).toBe('closed');
    // Closing from the dashboard is the same effect as the customer's own
    // close, and repeating it is idempotent.
    const { body: again } = await apiJson<{ chat?: AdminChat }>(
      request,
      'POST',
      `/admin/chats/${publicId}/close`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(again.chat?.status).toBe('closed');
    await apiJson(request, 'POST', `/account/chat/sessions/${publicId}/messages`, {
      token: customer.accessToken,
      data: { body: 'Merci !' },
      expectedStatus: 409,
    });
  });

  test('an anonymous contact: is answered by email and tracked by status', async ({ request }) => {
    const admin = await registerAdmin(request);
    const email = uniqueEmail('anon-contact');

    await apiJson(request, 'POST', '/contact', {
      data: { email, identity: 'Ada Lovelace', message: 'Bonjour, avez-vous des tailles XS ?' },
      expectedStatus: 201,
    });

    await apiJson(request, 'GET', '/admin/unconnected-contacts', {
      token: admin.accessToken,
      expectedStatus: 400,
    });

    const contact = await findOnPages<{
      publicId: string;
      email: string;
      identity: string;
      status: string;
      messageCount: number;
      preview: string;
    }>(
      async (page) => {
        const { body } = await apiJson<{
          contacts?: Array<{
            publicId: string;
            email: string;
            identity: string;
            status: string;
            messageCount: number;
            preview: string;
          }>;
          pagination?: Pagination;
        }>(request, 'GET', `/admin/unconnected-contacts?status=new&page=${page}`, {
          token: admin.accessToken,
          expectedStatus: 200,
        });
        return { items: body.contacts ?? [], totalPages: body.pagination?.totalPages ?? 1 };
      },
      (entry) => entry.email === email,
    );
    expect(contact?.identity).toBe('Ada Lovelace');
    expect(contact?.status).toBe('new');
    expect(contact?.preview).toContain('tailles XS');

    const { body: detail } = await apiJson<{ contact?: { publicId: string; email: string } }>(
      request,
      'GET',
      `/admin/unconnected-contacts/${contact!.publicId}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(detail.contact?.email).toBe(email);
    await apiJson(request, 'GET', '/admin/unconnected-contacts/ZZZZZZZZ', {
      token: admin.accessToken,
      expectedStatus: 404,
    });

    await apiJson(request, 'PATCH', `/admin/unconnected-contacts/${contact!.publicId}/status`, {
      token: admin.accessToken,
      data: { status: 'archived' },
      expectedStatus: 400,
    });
    const { body: ignored } = await apiJson<{ contact?: { status?: string; statusUpdatedAt?: string } }>(
      request,
      'PATCH',
      `/admin/unconnected-contacts/${contact!.publicId}/status`,
      { token: admin.accessToken, data: { status: 'ignored' }, expectedStatus: 200 },
    );
    expect(ignored.contact?.status).toBe('ignored');
    expect(ignored.contact?.statusUpdatedAt).toBeTruthy();
    await apiJson(request, 'PATCH', '/admin/unconnected-contacts/ZZZZZZZZ/status', {
      token: admin.accessToken,
      data: { status: 'new' },
      expectedStatus: 404,
    });
    await apiJson(request, 'PATCH', `/admin/unconnected-contacts/${contact!.publicId}/status`, {
      token: admin.accessToken,
      data: { status: 'new' },
      expectedStatus: 200,
    });

    await apiJson(request, 'POST', `/admin/unconnected-contacts/${contact!.publicId}/replies`, {
      token: admin.accessToken,
      data: { body: '' },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/admin/unconnected-contacts/ZZZZZZZZ/replies', {
      token: admin.accessToken,
      data: { body: 'Bonjour' },
      expectedStatus: 404,
    });

    const sent = await request.post(`/admin/unconnected-contacts/${contact!.publicId}/replies`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      multipart: {
        body: 'Oui, la taille XS revient bientôt.',
        images: { name: 'reponse.png', mimeType: 'image/png', buffer: await pngPixel() },
      },
    });
    expect(sent.status()).toBe(201);

    // The thread is marked answered only once the mail actually left.
    const { body: answered } = await apiJson<{ contact?: { status?: string; messages?: unknown[] } }>(
      request,
      'GET',
      `/admin/unconnected-contacts/${contact!.publicId}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(answered.contact?.status).toBe('answered');
  });

  test('a product: request is answered and its status recorded', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const variant = await pickPurchasableVariant(request, { token: customer.accessToken });

    await apiJson(request, 'POST', '/contact/product-request', {
      token: customer.accessToken,
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
        size: variant.size,
        quantity: 1,
        comment: 'Une taille de plus si possible',
      },
      expectedStatus: 201,
    });

    await apiJson(request, 'GET', '/admin/product-requests', {
      token: admin.accessToken,
      expectedStatus: 400,
    });

    const requested = await findOnPages<{
      publicId: string;
      email: string;
      status: string;
      size: string;
      quantity: number;
      comment: string | null;
      productUid: string;
    }>(
      async (page) => {
        const { body } = await apiJson<{
          requests?: Array<{
            publicId: string;
            email: string;
            status: string;
            size: string;
            quantity: number;
            comment: string | null;
            productUid: string;
          }>;
          pagination?: Pagination;
        }>(request, 'GET', `/admin/product-requests?status=requested&page=${page}`, {
          token: admin.accessToken,
          expectedStatus: 200,
        });
        return { items: body.requests ?? [], totalPages: body.pagination?.totalPages ?? 1 };
      },
      (entry) => entry.email === customer.email,
    );
    // The product reference is resolved server-side, never taken from the body.
    expect(requested?.productUid).toBe(variant.productUid);
    expect(requested?.size).toBe(variant.size);
    expect(requested?.quantity).toBe(1);
    expect(requested?.comment).toBe('Une taille de plus si possible');

    const { body: detail } = await apiJson<{
      request?: { publicId: string; status: string };
      messages?: unknown[];
    }>(request, 'GET', `/admin/product-requests/${requested!.publicId}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(detail.request?.status).toBe('requested');
    expect(Array.isArray(detail.messages)).toBe(true);
    await apiJson(request, 'GET', '/admin/product-requests/ZZZZZZZZ', {
      token: admin.accessToken,
      expectedStatus: 404,
    });

    // A response is a status, a price and a message — all three or nothing.
    for (const badBody of [
      {},
      { status: 'accepted' },
      { status: 'accepted', message: 'ok' },
      { status: 'accepted', message: 'ok', price: 0 },
      { status: 'pending', message: 'ok', price: 10 },
    ]) {
      await apiJson(request, 'PATCH', `/admin/product-requests/${requested!.publicId}`, {
        token: admin.accessToken,
        data: badBody,
        expectedStatus: 400,
      });
    }
    await apiJson(request, 'PATCH', '/admin/product-requests/ZZZZZZZZ', {
      token: admin.accessToken,
      data: { status: 'accepted', message: 'ok', price: 10 },
      expectedStatus: 404,
    });

    await apiJson(request, 'PATCH', `/admin/product-requests/${requested!.publicId}`, {
      token: admin.accessToken,
      data: { status: 'accepted', message: 'Je peux la faire pour ce prix.', price: 24.5 },
      expectedStatus: 200,
    });

    const { body: answered } = await apiJson<{
      request?: { status: string; responsePrice: number | null; responseMessage: string | null };
      messages?: Array<{ direction: string }>;
    }>(request, 'GET', `/admin/product-requests/${requested!.publicId}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(answered.request?.status).toBe('accepted');
    expect(answered.request?.responsePrice).toBe(24.5);
    expect(answered.request?.responseMessage).toBe('Je peux la faire pour ce prix.');
    expect((answered.messages ?? []).some((message) => message.direction === 'admin')).toBe(true);

    const { body: afterAnswer } = await apiJson<{ requests?: Array<{ publicId: string }> }>(
      request,
      'GET',
      '/admin/product-requests?status=requested',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect((afterAnswer.requests ?? []).some((entry) => entry.publicId === requested!.publicId)).toBe(
      false,
    );
  });
});
