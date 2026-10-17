import sharp from 'sharp';
import { test, expect } from 'patchright/test';
import { apiJson, registerUser } from '../../support/api.js';
import { loadTestEnv } from '../../support/env.js';

type ChatMessage = {
  id: number;
  sender: 'user' | 'owner';
  body: string;
  createdAt: string;
  attachments: Array<{ id: number; fileName: string }>;
};
type ChatSession = {
  publicId: string;
  status: 'open' | 'closed';
  visitorEmail: string;
  visitorIdentity: string | null;
  messages: ChatMessage[];
};
type SessionPayload = {
  data?: { session?: ChatSession; unreadOwnerCount?: number; message?: ChatMessage };
  error?: { code?: string };
};

async function pngPixel(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 120, b: 160 } },
  })
    .png()
    .toBuffer();
}

test.describe('API account chat', () => {
  test('account conversation: one stays open from the first message until close', async ({ request }) => {
    const { email, accessToken } = await registerUser(request);

    const { body: empty } = await apiJson<{ data?: { sessions?: unknown[] } }>(
      request,
      'GET',
      '/account/chat/sessions',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(empty.data?.sessions).toEqual([]);

    // There is no empty shell: the first message is what creates the session.
    const { body: rejected } = await apiJson<SessionPayload>(request, 'POST', '/account/chat/sessions', {
      token: accessToken,
      data: { body: '   ' },
      expectedStatus: 400,
    });
    expect(rejected.error?.code).toBe('invalid_request');

    const { body: opened } = await apiJson<SessionPayload>(request, 'POST', '/account/chat/sessions', {
      token: accessToken,
      data: { body: 'Bonjour, une question sur ma commande.' },
      expectedStatus: 201,
    });
    const session = opened.data!.session!;
    expect(session.publicId).toBeTruthy();
    expect(session.status).toBe('open');
    // The account is the identity — nothing is taken from the body.
    expect(session.visitorEmail).toBe(email);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]?.sender).toBe('user');
    expect(opened.data?.message?.id).toBe(session.messages[0]?.id);
    expect(opened.data?.unreadOwnerCount).toBe(0);

    // An account may only hold one open conversation at a time.
    const { body: second } = await apiJson<SessionPayload>(request, 'POST', '/account/chat/sessions', {
      token: accessToken,
      data: { body: 'Et une autre question.' },
      expectedStatus: 409,
    });
    expect(second.error?.code).toBe('session_active');

    const { body: appended } = await apiJson<SessionPayload>(
      request,
      'POST',
      `/account/chat/sessions/${session.publicId}/messages`,
      { token: accessToken, data: { body: 'Je précise ma demande.' }, expectedStatus: 201 },
    );
    expect(appended.data?.message?.sender).toBe('user');

    const { body: transcript } = await apiJson<SessionPayload>(
      request,
      'GET',
      `/account/chat/sessions/${session.publicId}`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(transcript.data?.session?.messages).toHaveLength(2);

    // The public id is case-insensitive in the URL, as the emails print it.
    await apiJson(request, 'GET', `/account/chat/sessions/${session.publicId.toLowerCase()}`, {
      token: accessToken,
      expectedStatus: 200,
    });

    const { body: summaries } = await apiJson<{
      data?: {
        sessions?: Array<{
          publicId: string;
          status: string;
          messageCount: number;
          preview: string;
          unreadOwnerCount: number;
          firstMessageAt: string | null;
          lastMessageAt: string | null;
        }>;
      };
    }>(request, 'GET', '/account/chat/sessions', { token: accessToken, expectedStatus: 200 });
    const summary = (summaries.data?.sessions ?? []).find((entry) => entry.publicId === session.publicId);
    expect(summary?.status).toBe('open');
    expect(summary?.messageCount).toBe(2);
    expect(summary?.preview).toContain('Je précise');
    expect(summary?.unreadOwnerCount).toBe(0);
    expect(summary?.firstMessageAt).toBeTruthy();
    expect(summary?.lastMessageAt).toBeTruthy();

    // The durable read cursor and the presence flag are separate signals.
    const lastMessageId = transcript.data!.session!.messages.at(-1)!.id;
    await apiJson(request, 'POST', `/account/chat/sessions/${session.publicId}/read`, {
      token: accessToken,
      data: { messageId: lastMessageId },
      expectedStatus: 200,
    });
    await apiJson(request, 'POST', `/account/chat/sessions/${session.publicId}/read`, {
      token: accessToken,
      data: { messageId: 0 },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', `/account/chat/sessions/${session.publicId}/presence`, {
      token: accessToken,
      data: { active: true },
      expectedStatus: 200,
    });
    await apiJson(request, 'POST', `/account/chat/sessions/${session.publicId}/presence`, {
      token: accessToken,
      data: { active: 'yes' },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', `/account/chat/sessions/${session.publicId}/presence`, {
      token: accessToken,
      data: { active: false },
      expectedStatus: 200,
    });

    // Closing makes the transcript read-only for the customer…
    const { body: closed } = await apiJson<SessionPayload>(
      request,
      'POST',
      `/account/chat/sessions/${session.publicId}/close`,
      { token: accessToken, expectedStatus: 200 },
    );
    expect(closed.data?.session?.status).toBe('closed');
    const { body: afterClose } = await apiJson<SessionPayload>(
      request,
      'POST',
      `/account/chat/sessions/${session.publicId}/messages`,
      { token: accessToken, data: { body: 'Encore une chose.' }, expectedStatus: 409 },
    );
    expect(afterClose.error?.code).toBe('session_closed');

    // …and frees the single-open-session slot.
    const { body: reopened } = await apiJson<SessionPayload>(
      request,
      'POST',
      '/account/chat/sessions',
      { token: accessToken, data: { body: 'Nouvelle demande.' }, expectedStatus: 201 },
    );
    expect(reopened.data?.session?.publicId).not.toBe(session.publicId);
  });

  test('transcript and attachments: they belong to one account only', async ({ request }) => {
    const owner = await registerUser(request);
    const intruder = await registerUser(request);

    const { body: opened } = await apiJson<SessionPayload>(request, 'POST', '/account/chat/sessions', {
      token: owner.accessToken,
      data: {},
      expectedStatus: 400,
    });
    expect(opened.error?.code).toBe('invalid_request');

    // Multipart with an image, the same way the browser sends it.
    const created = await request.post('/account/chat/sessions', {
      headers: { Authorization: `Bearer ${owner.accessToken}` },
      multipart: {
        body: 'Voici une photo de mes ongles.',
        images: { name: 'nails.png', mimeType: 'image/png', buffer: await pngPixel() },
      },
    });
    expect(created.status()).toBe(201);
    const payload = (await created.json()) as SessionPayload;
    const session = payload.data!.session!;
    const attachment = session.messages[0]?.attachments?.[0];
    expect(attachment?.id).toBeTruthy();
    // The client only ever learns the original name, never the disk key.
    expect(attachment?.fileName).toBe('nails.png');

    const preview = await request.get(
      `/account/chat/sessions/${session.publicId}/attachments/${attachment!.id}`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(preview.status()).toBe(200);
    expect(preview.headers()['content-type']).toContain('image/jpeg');
    expect(preview.headers()['cache-control']).toContain('no-store');
    expect((await preview.body()).length).toBeGreaterThan(0);

    const full = await request.get(
      `/account/chat/sessions/${session.publicId}/attachments/${attachment!.id}?variant=full`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(full.status()).toBe(200);

    // Unknown attachment ids collapse to the same 404 as an unowned one.
    const missing = await request.get(
      `/account/chat/sessions/${session.publicId}/attachments/999999`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(missing.status()).toBe(404);

    for (const path of ['', '/events']) {
      await apiJson(request, 'GET', `/account/chat/sessions/${session.publicId}${path}`, {
        token: intruder.accessToken,
        expectedStatus: 404,
      });
    }
    for (const path of ['/messages', '/read', '/presence', '/close']) {
      await apiJson(request, 'POST', `/account/chat/sessions/${session.publicId}${path}`, {
        token: intruder.accessToken,
        data: { body: 'coucou', messageId: 1, active: true },
        expectedStatus: 404,
      });
    }
    const stolen = await request.get(
      `/account/chat/sessions/${session.publicId}/attachments/${attachment!.id}`,
      { headers: { Authorization: `Bearer ${intruder.accessToken}` } },
    );
    expect(stolen.status()).toBe(404);

    // No bearer token at all is rejected by the router-wide gate.
    await apiJson(request, 'GET', '/account/chat/sessions', { expectedStatus: 401 });
  });

  test('the transcript stream: is a bearer-authenticated event stream', async ({ request }) => {
    const env = loadTestEnv();
    const { accessToken } = await registerUser(request);
    const { body: opened } = await apiJson<SessionPayload>(request, 'POST', '/account/chat/sessions', {
      token: accessToken,
      data: { body: 'Suivi en direct.' },
      expectedStatus: 201,
    });
    const publicId = opened.data!.session!.publicId;

    // EventSource cannot send Authorization, so the front reads this as a
    // fetch stream — headers arrive before any event does.
    const controller = new AbortController();
    try {
      const response = await fetch(
        `${env.apiBaseUrl}/account/chat/sessions/${publicId}/events`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(response.headers.get('cache-control')).toContain('no-cache');
    } finally {
      controller.abort();
    }
  });
});
