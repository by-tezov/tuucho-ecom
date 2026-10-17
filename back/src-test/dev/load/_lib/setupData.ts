import { check } from 'k6';
import http from 'k6/http';
import { loadPassword, uniqueEmail } from './auth.ts';
import { apiBaseUrl, getJson, successEnvelope } from './http.ts';
import type { LoadProfileName } from './profiles.ts';
import { allocateContentionVus } from './vuAlloc.ts';
import type { CatalogPick, LoadSetupData, LoadUser, NailPick } from './types.ts';

type FeedItem = {
  id?: string;
  productUid?: string;
  shape?: Record<string, string>;
  lengthsByShape?: Record<string, Record<string, string>>;
  available?: Record<string, Record<string, Record<string, number>>>;
};

type Courier = { code: string; countries: string[]; networks: string[] };

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function itemToCatalog(item: FeedItem, courierCode: string): CatalogPick | null {
  if (!item?.id || !item.productUid || !item.shape) return null;
  const shapeKey = Object.keys(item.shape)[0];
  if (!shapeKey) return null;
  const lengthKey = Object.keys(item.lengthsByShape?.[shapeKey] ?? {})[0];
  if (!lengthKey) return null;
  const sizeEntry = item.available?.[shapeKey]?.[lengthKey] ?? {};
  // No `?? 'M'` fallback: every size for this shape/length is genuinely out
  // of stock (product_availability's CHECK (quantity > 0) means a depleted
  // row is deleted, not zeroed), and checkout would 400 with empty_cart for
  // the rest of the run since cart_add never fails on stock. Skip the pick.
  const size = (['M', 'S', 'L', 'XS'] as const).find((candidate) => (sizeEntry[candidate] ?? 0) > 0);
  if (!size) return null;
  return {
    productId: String(item.id),
    productUid: String(item.productUid),
    shapeKey,
    lengthKey,
    size,
    courierCode,
  };
}

function pickCatalogs(baseUrl: string, count: number): CatalogPick[] {
  const feed = getJson(baseUrl, '/gallery/feed?limit=60', 'setup_gallery_feed', (body) =>
    Array.isArray((body as { items?: unknown })?.items),
  );
  const courierBody = getJson(
    baseUrl,
    '/account/couriers',
    'setup_couriers',
    (body) => successEnvelope(body) && Array.isArray((body as { couriers?: unknown }).couriers),
  );
  const courierCode =
    ((courierBody.body as { couriers?: Courier[] } | null)?.couriers ?? []).find(
      (courier) => courier.countries.includes('FR') && courier.networks.includes('home'),
    )?.code ?? '';
  check(courierCode, { setup_home_courier: (value) => Boolean(value) });

  const picks: CatalogPick[] = [];
  for (const item of (feed.body as { items?: FeedItem[] } | null)?.items ?? []) {
    const catalog = itemToCatalog(item, courierCode);
    if (catalog) picks.push(catalog);
    if (picks.length >= count) break;
  }
  check(picks, { setup_catalog_items: (value) => value.length > 0 });
  if (!picks.length) {
    throw new Error('load setup: no catalogue items available');
  }
  while (picks.length < count) picks.push(picks[picks.length % picks.length]!);
  return picks;
}

function registerPool(baseUrl: string, prefix: string, count: number): LoadUser[] {
  if (count <= 0) return [];
  const password = loadPassword();
  const emails = Array.from({ length: count }, () => uniqueEmail(prefix));
  const responses = http.batch(
    emails.map((email) => ({
      method: 'POST' as const,
      url: `${baseUrl}/auth/register`,
      body: JSON.stringify({
        email,
        password,
        gdprConsent: { accepted: true },
        language: 'fr',
      }),
      params: { headers: JSON_HEADERS, tags: { name: `setup_register_${prefix}`, phase: 'setup' } },
    })),
  );

  const users: LoadUser[] = [];
  for (let i = 0; i < emails.length; i += 1) {
    const res = responses[i]!;
    let body: unknown = null;
    try {
      body = res.json();
    } catch {
      body = null;
    }
    const token = String((body as { accessToken?: string } | null)?.accessToken ?? '');
    const ok = check(res, {
      [`setup_register_${prefix}_status`]: (r) => r.status === 201,
      [`setup_register_${prefix}_token`]: () => Boolean(token),
    });
    if (ok && token) users.push({ email: emails[i]!, accessToken: token });
  }
  check(users, {
    [`setup_pool_${prefix}_size`]: (value) => value.length === count,
  });
  return users;
}

function ensureAddresses(baseUrl: string, users: LoadUser[]): LoadUser[] {
  if (!users.length) return users;
  const responses = http.batch(
    users.map((user) => ({
      method: 'POST' as const,
      url: `${baseUrl}/account/addresses`,
      body: JSON.stringify({
        kind: 'livraison',
        label: 'Load home',
        recipientName: 'Load User',
        line1: '10 rue de Load',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '+33601020304',
        networkCodes: ['home'],
        isDefault: true,
      }),
      params: {
        headers: {
          ...JSON_HEADERS,
          Authorization: `Bearer ${user.accessToken}`,
        },
        tags: { name: 'setup_address', phase: 'setup' },
      },
    })),
  );

  return users.map((user, index) => {
    const res = responses[index]!;
    let body: unknown = null;
    try {
      body = res.json();
    } catch {
      body = null;
    }
    const addressId = String((body as { address?: { id?: string } } | null)?.address?.id ?? '');
    check(res, {
      setup_address_status: (r) => r.status === 200 || r.status === 201,
      setup_address_id: () => Boolean(addressId),
    });
    return { ...user, addressId };
  });
}

function seedCarts(baseUrl: string, users: LoadUser[]): void {
  if (!users.length) return;
  const responses = http.batch(
    users.map((user) => {
      const catalog = user.catalog!;
      return {
        method: 'POST' as const,
        url: `${baseUrl}/account/cart`,
        body: JSON.stringify({
          productId: catalog.productId,
          shapeKey: catalog.shapeKey,
          lengthKey: catalog.lengthKey,
          size: catalog.size,
          quantity: 1,
        }),
        params: {
          headers: {
            ...JSON_HEADERS,
            Authorization: `Bearer ${user.accessToken}`,
          },
          tags: { name: 'setup_cart_seed', phase: 'setup' },
        },
      };
    }),
  );
  for (const res of responses) {
    check(res, { setup_cart_seed_status: (r) => r.status === 200 });
  }
}

/** Offered single nails for composed sets. A catalogue without any (the
 * manager's library-nail not seeded) leaves compose VUs with nothing to do,
 * which they report as a failed check rather than crash the run. */
function pickNails(baseUrl: string): NailPick[] {
  const feed = getJson(baseUrl, '/gallery/nails?limit=60', 'setup_nail_feed', (body) =>
    Array.isArray((body as { items?: unknown })?.items),
  );
  type NailItem = FeedItem & {
    variation?: { options?: Array<{ key: string }> };
    availableByOption?: Record<string, Record<string, Record<string, Record<string, number>>>>;
  };
  const nails: NailPick[] = [];
  for (const item of (feed.body as { items?: NailItem[] } | null)?.items ?? []) {
    const shapeKey = Object.keys(item.shape ?? {})[0];
    const lengthKey = shapeKey ? Object.keys(item.lengthsByShape?.[shapeKey] ?? {})[0] : undefined;
    if (!item.id || !item.productUid || !shapeKey || !lengthKey) continue;
    // A nail with a variation axis is offered per option; `available` is
    // only the union, so pick an option that offers the size too.
    const options = item.variation?.options?.map((option) => option.key) ?? [''];
    for (const variationKey of options) {
      const offered =
        (variationKey ? item.availableByOption?.[variationKey] : item.available)?.[shapeKey]?.[lengthKey] ??
        {};
      const size = (['M', 'S', 'L', 'XS'] as const).find((candidate) => (offered[candidate] ?? 0) > 0);
      if (!size) continue;
      nails.push({
        productId: item.id,
        productUid: item.productUid,
        shapeKey,
        lengthKey,
        size,
        variationKey,
      });
      break;
    }
  }
  check(nails, { setup_nail_items: (value) => value.length > 0 });
  return nails;
}

function withVouchersAndCatalogs(
  users: LoadUser[],
  voucherCodes: string[],
  catalogs: CatalogPick[],
): LoadUser[] {
  return users.map((user, index) => ({
    ...user,
    voucherCode: voucherCodes[index % voucherCodes.length]!,
    catalog: catalogs[index % catalogs.length]!,
  }));
}

/** Build shared catalogue + dedicated user pools.
 *
 * Each pool is sized to the *run's whole VU budget* (`total`), not to its own
 * scenario's share of it — see pickFromPool's doc comment for why: k6 hands
 * out VU ids across concurrently-running scenarios in an order that is not
 * contiguous per scenario, so a pool sized to one scenario's own VU count
 * lets two different VUs collide on the same pooled account. */
export function buildSetupData(profile: LoadProfileName, total: number): LoadSetupData {
  const baseUrl = apiBaseUrl();
  const catalogs = pickCatalogs(baseUrl, Math.max(total, 1));
  const catalog = catalogs[0]!;
  const voucherCodes = (__ENV.PAM_LOAD_VOUCHER_CODES || __ENV.PAM_LOAD_VOUCHER_CODE || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  check(voucherCodes, { setup_voucher_code: (value) => value.length > 0 });
  const nails = pickNails(baseUrl);

  if (profile === 'contention') {
    // The orchestrator picked this variant and cut its stock (see
    // prepareLoadFixtures); it names it rather than letting setup guess.
    const scarceCatalog: CatalogPick | undefined = __ENV.PAM_LOAD_SCARCE_PRODUCT_ID
      ? {
          productId: __ENV.PAM_LOAD_SCARCE_PRODUCT_ID,
          productUid: __ENV.PAM_LOAD_SCARCE_PRODUCT_UID || '',
          shapeKey: __ENV.PAM_LOAD_SCARCE_SHAPE || '',
          lengthKey: __ENV.PAM_LOAD_SCARCE_LENGTH || '',
          size: (__ENV.PAM_LOAD_SCARCE_SIZE || 'M') as CatalogPick['size'],
          courierCode: catalog.courierCode,
        }
      : undefined;
    check(scarceCatalog, { setup_scarce_catalog: (value) => Boolean(value) });
    const checkoutUsers = withVouchersAndCatalogs(
      ensureAddresses(baseUrl, registerPool(baseUrl, 'scarce', total)),
      voucherCodes,
      catalogs,
    );
    const twinUsers = withVouchersAndCatalogs(
      ensureAddresses(
        baseUrl,
        registerPool(baseUrl, 'twin', Math.max(1, allocateContentionVus(total).twins / 2)),
      ),
      voucherCodes,
      catalogs,
    );
    return {
      voucherCode: voucherCodes[0]!,
      catalog,
      catalogs,
      nails,
      authUsers: [],
      checkoutUsers,
      chatUsers: [],
      composeUsers: [],
      twinUsers,
      scarceCatalog,
      scarceVoucherCode: __ENV.PAM_LOAD_SCARCE_VOUCHER || undefined,
    };
  }

  const authUsers = registerPool(baseUrl, 'auth', total);
  const chatUsers = registerPool(baseUrl, 'chat', total);
  const checkoutUsers = withVouchersAndCatalogs(
    ensureAddresses(baseUrl, registerPool(baseUrl, 'chk', total)),
    voucherCodes,
    catalogs,
  );
  seedCarts(baseUrl, checkoutUsers);
  const composeUsers = withVouchersAndCatalogs(
    ensureAddresses(baseUrl, registerPool(baseUrl, 'cmp', total)),
    voucherCodes,
    catalogs,
  );

  return {
    voucherCode: voucherCodes[0]!,
    catalog,
    catalogs,
    nails,
    authUsers,
    checkoutUsers,
    chatUsers,
    composeUsers,
    twinUsers: [],
  };
}
