import type { APIRequestContext } from 'patchright/test';
import {
  apiJson,
  placeFreeOrder,
  pickPurchasableVariant,
  registerAdmin,
  registerUser,
  uniqueEmail,
} from './api.js';
import { createGiftOffer, createOfferBody } from './gift.js';
import { initVoucher, promoteToRole } from './ops.js';

export type AdminStaffAccount = {
  email: string;
  password: string;
  accessToken: string;
};

export type AdminCustomerSeed = {
  email: string;
  password: string;
  accessToken: string;
  orderNumber: string;
  orderId: string;
};

/** Super-admin account ready for the browser: register then promote via ops. */
export async function seedSuperAdmin(request: APIRequestContext): Promise<AdminStaffAccount> {
  return registerAdmin(request);
}

/** Staff account with a single role (replaces the whole set). */
export async function seedStaffWithRole(
  request: APIRequestContext,
  role: string,
  label = 'staff',
): Promise<AdminStaffAccount> {
  const account = await registerUser(request, { email: uniqueEmail(label) });
  await promoteToRole(account.email, role);
  return {
    email: account.email,
    password: account.password,
    accessToken: account.accessToken,
  };
}

/** Create a custom staff role via the admin API (faster than the Roles form). */
export async function createStaffRoleViaApi(
  request: APIRequestContext,
  adminToken: string,
  body: {
    label: string;
    grants?: Array<{ permission: string; granted: boolean; dominant: boolean }>;
    parents?: string[];
    assignable?: string[];
    assignableDominant?: boolean;
    targetable?: string[];
    targetableDominant?: boolean;
  },
): Promise<{ code: string; label: string }> {
  const { body: created } = await apiJson<{ role?: { code: string; label: string } }>(
    request,
    'POST',
    '/admin/roles',
    {
      token: adminToken,
      data: {
        label: body.label,
        grants: body.grants ?? [],
        parents: body.parents ?? [],
        assignable: body.assignable ?? [],
        assignableDominant: body.assignableDominant ?? false,
        targetable: body.targetable ?? [],
        targetableDominant: body.targetableDominant ?? false,
      },
      expectedStatus: 201,
    },
  );
  if (!created.role?.code) throw new Error('[adminSeed] role create missing code');
  return { code: created.role.code, label: created.role.label };
}

/** Replace an account's staff roles via the admin API. */
export async function assignRolesViaApi(
  request: APIRequestContext,
  adminToken: string,
  userId: string,
  roles: string[],
): Promise<void> {
  await apiJson(request, 'PUT', `/admin/users/${userId}/roles`, {
    token: adminToken,
    data: { roles },
    expectedStatus: 200,
  });
}

/** Customer, free confirmed order, product request, chat, guest contact, gift. */
export async function seedAdminWorkbench(request: APIRequestContext): Promise<{
  customer: AdminCustomerSeed;
  guestContactEmail: string;
  giftGiverEmail: string;
}> {
  const customer = await registerUser(request, { email: uniqueEmail('admin-cust') });
  const voucherCode = `admfree${Date.now().toString(36)}`;
  await initVoucher(voucherCode, { kind: 'amount', amount: 99_999 }, { maxPerUser: 0 });

  const placed = await placeFreeOrder(request, customer.accessToken, { voucherCode });
  const variant = await pickPurchasableVariant(request, { token: customer.accessToken });

  await apiJson(request, 'POST', '/contact/product-request', {
    token: customer.accessToken,
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      quantity: 1,
      comment: 'Taille manquante pour le test admin',
    },
    expectedStatus: 201,
  });

  const { body: chat } = await apiJson<{ data?: { session?: { publicId: string } } }>(
    request,
    'POST',
    '/account/chat/sessions',
    {
      token: customer.accessToken,
      data: { body: 'Bonjour, question pour le test admin.' },
      expectedStatus: 201,
    },
  );
  if (!chat.data?.session?.publicId) throw new Error('[adminSeed] chat session missing');

  const guestContactEmail = uniqueEmail('admin-guest');
  await apiJson(request, 'POST', '/contact', {
    data: {
      email: guestContactEmail,
      identity: 'Guest Admin Test',
      message: 'Message invité pour le test admin.',
    },
    expectedStatus: 201,
  });

  const giftGiverEmail = uniqueEmail('admin-gift');
  await createGiftOffer(request, createOfferBody({ giverEmail: giftGiverEmail }));

  return {
    customer: {
      email: customer.email,
      password: customer.password,
      accessToken: customer.accessToken,
      orderNumber: placed.order.orderNumber,
      orderId: placed.order.id,
    },
    guestContactEmail,
    giftGiverEmail,
  };
}
