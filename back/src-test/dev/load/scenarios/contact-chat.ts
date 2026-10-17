import { check } from 'k6';
import { accessTokenFrom, login } from '../_lib/auth.ts';
import {
  apiBaseUrl,
  getJson,
  postJson,
  successEnvelope,
} from '../_lib/http.ts';
import { pickFromPool, type LoadSetupData } from '../_lib/types.ts';

type SessionListBody = {
  success?: boolean;
  data?: { sessions?: Array<{ publicId?: string; status?: string }> };
};

type SessionCreateBody = {
  success?: boolean;
  data?: {
    session?: { publicId?: string };
    message?: { id?: number };
  };
};

/** Contact form + product-request + account chat (no Stripe / no MR HTTP). */
export function contactChat(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const catalog = data.catalog;
  const user = pickFromPool(data.chatUsers);

  postJson(
    baseUrl,
    '/contact',
    'contact_form',
    {
      email: `visitor+${Date.now()}@pamsurin.test`,
      identity: 'Load Visitor',
      message: `Load contact message from VU ${__VU} iter ${__ITER}`,
    },
    { status: 201, body: successEnvelope },
  );

  postJson(
    baseUrl,
    '/contact/product-request',
    'contact_product_request',
    {
      productId: catalog.productId,
      shapeKey: catalog.shapeKey,
      lengthKey: catalog.lengthKey,
      size: catalog.size,
      quantity: 1,
      email: `request+${Date.now()}@pamsurin.test`,
    },
    { status: [201, 404], body: () => true },
  );

  const loggedIn = login(baseUrl, user.email);
  const token = accessTokenFrom(loggedIn.body) || user.accessToken;

  const listed = getJson(
    baseUrl,
    '/account/chat/sessions',
    'chat_sessions_list',
    (body) => (body as SessionListBody)?.success === true,
    token,
  );
  const open = ((listed.body as SessionListBody | null)?.data?.sessions ?? []).find(
    (session) => session.status === 'open' && session.publicId,
  );

  let publicId = open?.publicId ?? '';
  let messageId = 0;

  if (!publicId) {
    const created = postJson(
      baseUrl,
      '/account/chat/sessions',
      'chat_session_create',
      { body: `Load chat open VU${__VU} iter${__ITER}` },
      {
        status: [201, 409],
        body: (body) =>
          (body as SessionCreateBody)?.success === true ||
          (body as { error?: { code?: string } })?.error?.code === 'session_active',
      },
      token,
    );
    publicId = (created.body as SessionCreateBody | null)?.data?.session?.publicId ?? '';
    messageId = Number((created.body as SessionCreateBody | null)?.data?.message?.id ?? 0);
  }

  if (!publicId) {
    const again = getJson(
      baseUrl,
      '/account/chat/sessions',
      'chat_sessions_relist',
      (body) => (body as SessionListBody)?.success === true,
      token,
    );
    publicId =
      ((again.body as SessionListBody | null)?.data?.sessions ?? []).find((session) => session.publicId)
        ?.publicId ?? '';
  }

  check(publicId, { chat_public_id: (value) => Boolean(value) });
  if (!publicId) return;

  getJson(
    baseUrl,
    `/account/chat/sessions/${encodeURIComponent(publicId)}`,
    'chat_session_get',
    (body) => (body as { success?: boolean })?.success === true,
    token,
  );

  const posted = postJson(
    baseUrl,
    `/account/chat/sessions/${encodeURIComponent(publicId)}/messages`,
    'chat_message',
    { body: `Load follow-up VU${__VU} iter${__ITER}` },
    {
      status: [201, 409],
      body: (body) =>
        (body as { success?: boolean })?.success === true ||
        Boolean((body as { error?: { code?: string } })?.error?.code),
    },
    token,
  );
  if (!messageId) {
    messageId = Number((posted.body as { data?: { message?: { id?: number } } } | null)?.data?.message?.id ?? 0);
  }
  if (messageId > 0) {
    postJson(
      baseUrl,
      `/account/chat/sessions/${encodeURIComponent(publicId)}/read`,
      'chat_read',
      { messageId },
      { status: 200, body: successEnvelope },
      token,
    );
  }

  if (__ITER % 3 === 2) {
    postJson(
      baseUrl,
      `/account/chat/sessions/${encodeURIComponent(publicId)}/close`,
      'chat_close',
      {},
      { status: 200, body: successEnvelope },
      token,
    );
  }
}
