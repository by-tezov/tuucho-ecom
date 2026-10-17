import { test, expect } from 'patchright/test';
import { apiJson, registerAdmin, registerUser } from '../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../support/catalog.js';

test.describe('API admin activity journal', () => {
  test('preference patch: it is recorded and listed for admins only', async ({ request }) => {
    const admin = await registerAdmin(request);
    const user = await registerUser(request);

    await apiJson(request, 'PATCH', '/admin/preferences', {
      token: admin.accessToken,
      data: { cronLoyaltyLogEnabled: true },
      expectedStatus: 200,
    });

    const { body } = await apiJson<{
      success: boolean;
      entries: Array<{
        category: string;
        origin: string;
        action: string;
        actorEmail: string | null;
        summary: string;
        detail: { changes?: Array<{ field: string; before: unknown; after: unknown }> };
      }>;
    }>(request, 'GET', '/admin/activity?category=settings&origin=admin&pageSize=20', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(body.success).toBe(true);
    const mine = body.entries.find(
      (entry) => entry.action === 'settings.preferences' && entry.actorEmail === admin.email,
    );
    expect(mine).toBeTruthy();
    expect(mine!.origin).toBe('admin');
    expect(mine!.category).toBe('settings');
    expect(Array.isArray(mine!.detail.changes)).toBe(true);

    await apiJson(request, 'GET', '/admin/activity', {
      token: user.accessToken,
      expectedStatus: 403,
    });

    const { body: actors } = await apiJson<{
      success: boolean;
      actors: Array<{ userId: string; email: string }>;
    }>(request, 'GET', '/admin/activity/actors', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(actors.actors.some((actor) => actor.email === admin.email)).toBe(true);
  });

  test('library stock patch: records size before/after in detail.changes', async ({ request }) => {
    const admin = await registerAdmin(request);
    const uid = E2E_PRODUCT_UIDS.A1;
    const { body: searched } = await apiJson<{
      rows?: Array<{
        productUid: string;
        shapeKey: string;
        lengthKey: string;
        sizes: { XS: number; S: number; M: number; L: number };
      }>;
    }>(request, 'GET', `/admin/library-stock?q=${encodeURIComponent(uid)}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    const variant = searched.rows?.[0];
    expect(variant).toBeTruthy();
    const beforeXs = variant!.sizes.XS;
    const afterXs = beforeXs + 1;
    const patchedSizes = { ...variant!.sizes, XS: afterXs };

    await apiJson(request, 'PATCH', `/admin/library-stock/${uid}`, {
      token: admin.accessToken,
      data: {
        shapeKey: variant!.shapeKey,
        lengthKey: variant!.lengthKey,
        sizes: patchedSizes,
      },
      expectedStatus: 200,
    });

    const { body } = await apiJson<{
      success: boolean;
      entries: Array<{
        action: string;
        actorEmail: string | null;
        targetId: string | null;
        detail: {
          changes?: Array<{ field: string; before: unknown; after: unknown }>;
        };
      }>;
    }>(request, 'GET', '/admin/activity?category=catalogue&origin=admin&pageSize=20', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    const entry = body.entries.find(
      (row) =>
        row.action === 'catalogue.stock' &&
        row.actorEmail === admin.email &&
        row.targetId === uid,
    );
    expect(entry).toBeTruthy();
    const sizeChange = entry!.detail.changes?.find((change) => change.field === 'sizes.XS');
    expect(sizeChange).toEqual({ field: 'sizes.XS', before: beforeXs, after: afterXs });

    await apiJson(request, 'PATCH', `/admin/library-stock/${uid}`, {
      token: admin.accessToken,
      data: {
        shapeKey: variant!.shapeKey,
        lengthKey: variant!.lengthKey,
        sizes: variant!.sizes,
      },
      expectedStatus: 200,
    });
  });
});
