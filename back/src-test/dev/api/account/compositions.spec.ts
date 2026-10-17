import { test, expect } from 'patchright/test';
import {
  apiJson,
  createAddress,
  createZeroingVoucher,
  registerAdmin,
  registerUser,
  testCourierCode,
  type FeedItem,
  type PurchasableVariant,
} from '../../support/api.js';
import { E2E_LENGTH, E2E_PRODUCT_UIDS } from '../../support/catalog.js';

type CompositionNail = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  finger: string;
};

type CartComposition = {
  id: string;
  size: string;
  quantity: number;
  editing: boolean;
  available: boolean;
  nails: CompositionNail[];
};

type OrderItem = {
  productType?: string;
  quantity?: number;
  origin?: string;
  nails?: Array<{
    productId: string;
    productUid: string;
    shapeKey: string;
    lengthKey: string;
    finger: string;
    unitPrice: number;
  }>;
};

async function pickSeededNail(
  request: Parameters<typeof apiJson>[0],
  productUid: string,
): Promise<PurchasableVariant> {
  const { body } = await apiJson<FeedItem>(
    request,
    'GET',
    `/gallery/nail/${encodeURIComponent(productUid)}`,
    { expectedStatus: 200 },
  );
  for (const [shapeKey, lengths] of Object.entries(body.available ?? {})) {
    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      const size = ['M', 'S', 'L', 'XS'].find((candidate) => (sizes[candidate] ?? 0) > 0);
      if (size) {
        return {
          productId: body.id,
          productUid: body.productUid,
          shapeKey,
          lengthKey,
          size,
        };
      }
    }
  }
  throw new Error(
    `seeded nail_single ${productUid} is missing from GET /gallery/nail (run E2E catalogue seed)`,
  );
}

async function createMinimalComposition(
  request: Parameters<typeof apiJson>[0],
  token: string,
  nails: PurchasableVariant[],
  size: string,
): Promise<CartComposition> {
  const fingers = ['left-thumb', 'left-index', 'right-thumb'] as const;
  const payloadNails = nails.slice(0, fingers.length).map((nail, index) => ({
    productId: nail.productId,
    shapeKey: nail.shapeKey,
    lengthKey: nail.lengthKey,
    finger: fingers[index]!,
  }));
  const { body } = await apiJson<{ composition?: CartComposition }>(
    request,
    'POST',
    '/account/cart/compositions',
    {
      token,
      data: { size, quantity: 1, nails: payloadNails },
      expectedStatus: 201,
    },
  );
  if (!body.composition?.id) throw new Error('composition create returned no id');
  return body.composition;
}

async function freeCheckout(
  request: Parameters<typeof apiJson>[0],
  token: string,
  addressId: string,
  voucherCode: string,
  expectedStatus: number,
): Promise<{ error?: { code?: string }; order?: { id: string; items?: OrderItem[] } }> {
  const { body } = await apiJson<{
    error?: { code?: string };
    order?: { id: string; items?: OrderItem[] };
  }>(request, 'POST', '/account/checkout/free', {
    token,
    data: {
      addressId,
      courierCode: testCourierCode,
      express: false,
      voucherCode,
    },
    expectedStatus,
  });
  return body;
}

test.describe('API cart compositions', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('compositions');
  });

  test('create, edit: lock, unavailable, and order snapshot', async ({ request }) => {
    const admin = await registerAdmin(request);
    const nailA = await pickSeededNail(request, E2E_PRODUCT_UIDS.NAIL_A);
    const nailB = await pickSeededNail(request, E2E_PRODUCT_UIDS.NAIL_B);
    expect(nailA.lengthKey).toBe(E2E_LENGTH);

    const { accessToken } = await registerUser(request);
    const addressId = (await createAddress(request, accessToken)).id;
    const composition = await createMinimalComposition(request, accessToken, [nailA, nailB, nailA], 'M');
    expect(composition.editing).toBe(false);
    expect(composition.available).toBe(true);
    expect(composition.nails).toHaveLength(3);

    const { body: cart } = await apiJson<{ compositions?: CartComposition[] }>(
      request,
      'GET',
      '/account/cart',
      { token: accessToken, expectedStatus: 200 },
    );
    expect((cart.compositions ?? []).some((entry) => entry.id === composition.id)).toBe(true);

    await apiJson(request, 'POST', `/account/cart/compositions/${composition.id}/edit`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const editingBlocked = await freeCheckout(request, accessToken, addressId, voucherCode, 409);
    expect(editingBlocked.error?.code).toBe('composition_editing');

    await apiJson(request, 'POST', `/account/cart/compositions/${composition.id}/cancel-edit`, {
      token: accessToken,
      expectedStatus: 200,
    });

    await apiJson(request, 'PATCH', `/admin/nail-availability/${E2E_PRODUCT_UIDS.NAIL_A}`, {
      token: admin.accessToken,
      data: {
        shapeKey: nailA.shapeKey,
        lengthKey: nailA.lengthKey,
        size: 'M',
        available: false,
      },
      expectedStatus: 200,
    });
    try {
      const unavailableBlocked = await freeCheckout(
        request,
        accessToken,
        addressId,
        voucherCode,
        409,
      );
      expect(unavailableBlocked.error?.code).toBe('size_unavailable');
    } finally {
      await apiJson(request, 'PATCH', `/admin/nail-availability/${E2E_PRODUCT_UIDS.NAIL_A}`, {
        token: admin.accessToken,
        data: {
          shapeKey: nailA.shapeKey,
          lengthKey: nailA.lengthKey,
          size: 'M',
          available: true,
        },
        expectedStatus: 200,
      });
    }

    const placed = await freeCheckout(request, accessToken, addressId, voucherCode, 201);
    expect(placed.order?.id).toBeTruthy();

    const { body: detail } = await apiJson<{ order?: { items?: OrderItem[] } }>(
      request,
      'GET',
      `/account/orders/${placed.order!.id}`,
      { token: accessToken, expectedStatus: 200 },
    );
    const compositionLine = (detail.order?.items ?? []).find(
      (item) => item.origin === 'user' && item.productType === 'composition',
    );
    expect(compositionLine).toBeTruthy();
    expect(compositionLine?.nails).toHaveLength(3);
    expect(compositionLine?.nails?.map((nail) => nail.finger).sort()).toEqual(
      ['left-index', 'left-thumb', 'right-thumb'].sort(),
    );
    expect(compositionLine?.nails?.every((nail) => nail.productId && nail.unitPrice >= 0)).toBe(
      true,
    );
  });
});
