import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { loadOpsToken } from '../../../scripts/envFile.js';
import { loadTestEnv, testPassword, type TestMode } from './env.js';

/** Stable UIDs for functional catalogue seeds — mid-alphabet prefixes so they
 * sit among real library UIDs (AC… / XW…), not clustered at ZZ. Always deleted
 * in teardown. */
export const E2E_PRODUCT_UIDS = {
  // Follow the same customer-facing AA-BB-123 format as manager imports.
  // Product-page and shared-gallery URLs validate this format before a
  // lookup, so synthetic labels such as ME-E2E-A1 cannot cover those flows.
  A1: 'ME-EE-101',
  A2: 'MF-EE-102',
  B1: 'MG-EE-103',
  OOS: 'MH-EE-104',
  USER_A: 'MI-EE-105',
  USER_B: 'MJ-EE-106',
  /** Last-unit public sets so gift-hold release can be asserted without
   * sharing the OOS-race fixture. One SKU per viewport so web and mobile
   * can run in parallel. */
  HOLD_WEB: 'MK-EE-107',
  HOLD_MOBILE: 'ML-EE-108',
  /** The only fixture that isn't both E2E_SHAPES × E2E_LENGTH: 'carré' only,
   * offered in E2E_LENGTH *and* E2E_LENGTH_ALT. Lets shape/length gallery
   * filter tests assert real narrowing — every other seed matches every
   * shape/E2E_LENGTH filter equally, so none of them can prove a filter
   * actually excludes something. */
  CARRE_LONG: 'MM-EE-109',
  /** Public nail_single designs for compose-a-set API coverage. Boolean
   * offers in `product_nail_availability`, not quantity stock. */
  NAIL_A: 'MN-EE-201',
  NAIL_B: 'MO-EE-202',
  /** Single nail with a colour variation axis (base + priced option). */
  NAIL_V: 'MP-EE-203',
  /** Offered in XS and M only. S and L are absent, so a composed set can
   * pose the nail and then ask for the missing size. */
  NAIL_GAP: 'MQ-EE-204',
  /** Scarce public sets owned by the API concurrency races
   * (`api/concurrency/`). Each race sets its exact free units first, so no
   * other spec may buy them. */
  RACE_STOCK: 'MR-EE-301',
  RACE_GIFT: 'MS-EE-302',
} as const;

/** Unit prices used by compose functional assertions. */
export const E2E_NAIL_PRICES = {
  NAIL_A: 4,
  NAIL_B: 5,
  NAIL_V: 4,
  /** Price override for `E2E_VARIATION.PREMIUM` on NAIL_V. */
  NAIL_V_PREMIUM: 7,
  NAIL_GAP: 4,
  SET_A1: 12,
} as const;

/** Variation axis + options seeded for NAIL_V. */
export const E2E_VARIATION = {
  AXIS: 'color',
  BASE: 'pink',
  PREMIUM: 'night',
} as const;

/** Real manager accessories imported into the disposable functional stack. */
export const E2E_ACCESSORY_UIDS = {
  GLUE_DOSES: 'TS-KX-936',
} as const;

export const E2E_ACCESSORY_TITLES = {
  [E2E_ACCESSORY_UIDS.GLUE_DOSES]: 'Doses de colle',
} as const;

/** Accounts reserved for the disposable functional database. Their separate
 * access lists let the gallery tests prove both inclusion and isolation. */
export const E2E_USER_LIBRARY_USERS = {
  A: { email: 'e2e-user-library-a@pamsurin.test' },
  B: { email: 'e2e-user-library-b@pamsurin.test' },
} as const;

/** Previous seed UIDs — deleted on teardown so reruns do not leave orphans. */
export const E2E_LEGACY_PRODUCT_UIDS = ['ZZ-E2E-A1', 'ZZ-E2E-A2', 'ZZ-E2E-B1', 'ZZ-E2E-OOS'] as const;

export type E2eProductUid = (typeof E2E_PRODUCT_UIDS)[keyof typeof E2E_PRODUCT_UIDS];

/** Distinct mid-alphabet titles so products are findable by scrolling the
 * public gallery (alphabetical title order, no search field). */
export const E2E_TITLES: Record<E2eProductUid, string> = {
  [E2E_PRODUCT_UIDS.A1]: 'Mango E2E Alpha',
  [E2E_PRODUCT_UIDS.A2]: 'Nectar E2E Alpha',
  [E2E_PRODUCT_UIDS.B1]: 'Olive E2E Bravo',
  [E2E_PRODUCT_UIDS.OOS]: 'Pearl E2E OOS',
  [E2E_PRODUCT_UIDS.USER_A]: 'Aster E2E Personnelle',
  [E2E_PRODUCT_UIDS.USER_B]: 'Basilic E2E Réservée',
  [E2E_PRODUCT_UIDS.HOLD_WEB]: 'Hazel E2E Hold Web',
  [E2E_PRODUCT_UIDS.HOLD_MOBILE]: 'Hazel E2E Hold Mobile',
  [E2E_PRODUCT_UIDS.CARRE_LONG]: 'Quartz E2E Longueur',
  [E2E_PRODUCT_UIDS.NAIL_A]: 'Rose E2E Nail Alpha',
  [E2E_PRODUCT_UIDS.NAIL_B]: 'Sage E2E Nail Bravo',
  [E2E_PRODUCT_UIDS.NAIL_V]: 'Topaz E2E Nail Color',
  [E2E_PRODUCT_UIDS.NAIL_GAP]: 'Iris E2E Nail Gap',
  [E2E_PRODUCT_UIDS.RACE_STOCK]: 'Zircon E2E Race Stock',
  [E2E_PRODUCT_UIDS.RACE_GIFT]: 'Zircon E2E Race Gift',
};

export const E2E_SHAPES = ['amande', 'carré'] as const;
/** Seeded tip-pot accessory (`CART_RULE_GIFT_PRODUCT_UID`). */
export const E2E_GIFT_PRODUCT_UID = 'TK-PT-248';
const GIFT_PRODUCT_UID = E2E_GIFT_PRODUCT_UID;
// Functional orders can consume gifts before later scenarios run. Keep this
// deliberately above the whole suite's maximum expected gift consumption.
const FUNCTIONAL_GIFT_STOCK = 500;
/** The length every seed offers under every shape, except CARRE_LONG (see
 * E2E_LENGTH_ALT). */
export const E2E_LENGTH = 'medium';
/** Second length, declared only for the 'carré' shape and stocked only by
 * CARRE_LONG — the one seed that lets a gallery length-filter test assert
 * real narrowing (every other seed only ever has E2E_LENGTH). */
export const E2E_LENGTH_ALT = 'long';
export const E2E_SIZES = ['XS', 'S', 'M', 'L'] as const;

function stockAll(qty: number): Record<string, Record<string, Record<string, number>>> {
  const availability: Record<string, Record<string, Record<string, number>>> = {};
  for (const shape of E2E_SHAPES) {
    availability[shape] = { [E2E_LENGTH]: {} };
    for (const size of E2E_SIZES) {
      availability[shape][E2E_LENGTH]![size] = qty;
    }
  }
  return availability;
}

/** Boolean offer grid for nail_single import (`true` = offered). */
function offerAll(): Record<string, Record<string, Record<string, boolean>>> {
  const availability: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const shape of E2E_SHAPES) {
    availability[shape] = { [E2E_LENGTH]: {} };
    for (const size of E2E_SIZES) {
      availability[shape][E2E_LENGTH]![size] = true;
    }
  }
  return availability;
}

/** XS and M only. Omitted sizes are not stored, so they are not offered. */
function offerGap(): Record<string, Record<string, Record<string, boolean>>> {
  const availability: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const shape of E2E_SHAPES) {
    availability[shape] = { [E2E_LENGTH]: { XS: true, M: true } };
  }
  return availability;
}

function stockOos(): Record<string, Record<string, Record<string, number>>> {
  // Import ignores non-positive quantities — only ship the last unit.
  return { amande: { [E2E_LENGTH]: { M: 1 } } };
}

/** CARRE_LONG's own stock: 'carré' only, both its lengths. */
function stockCarreLong(qty: number): Record<string, Record<string, Record<string, number>>> {
  const availability: Record<string, Record<string, number>> = {};
  for (const length of [E2E_LENGTH, E2E_LENGTH_ALT]) {
    availability[length] = {};
    for (const size of E2E_SIZES) availability[length]![size] = qty;
  }
  return { carré: availability };
}

interface SeedDef {
  productUid: E2eProductUid;
  title: string;
  /** Quantity stock for `nail` sets, or boolean offers for `nail_single`. */
  availability:
    | Record<string, Record<string, Record<string, number>>>
    | Record<string, Record<string, Record<string, boolean>>>;
  price: number;
  /** One or several visibly distinct swatches. The suite deliberately has
   * both one-photo and multi-photo products, so carousel coverage is real. */
  photoColors: string[];
  featured?: boolean;
  audience?: 'public' | 'user-library';
  users?: readonly string[];
  /** Defaults to `nail` (full set). Compose-a-set seeds use `nail_single`. */
  productType?: 'nail' | 'nail_single';
  /** Overrides the default `[...E2E_SHAPES]` declaration — only CARRE_LONG
   * uses this, to declare 'carré' alone instead of every seed's usual both
   * shapes. */
  shapeKeys?: readonly string[];
  /** Overrides the default "every shapeKey offers only E2E_LENGTH" mapping —
   * only CARRE_LONG uses this, to also declare E2E_LENGTH_ALT. */
  shapeLengths?: Readonly<Record<string, readonly string[]>>;
  /** Optional colour axis for `nail_single` (see `E2E_VARIATION`). */
  variationAxis?: string;
  variations?: ReadonlyArray<{ key: string; price: number | null }>;
}

const SEEDS: SeedDef[] = [
  {
    productUid: E2E_PRODUCT_UIDS.A1,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.A1],
    availability: stockAll(200),
    price: 12,
    photoColors: ['#e11d48', '#7c3aed', '#facc15'],
    featured: true,
  },
  {
    productUid: E2E_PRODUCT_UIDS.A2,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.A2],
    availability: stockAll(200),
    price: 14,
    photoColors: ['#2563eb'],
    featured: true,
  },
  {
    productUid: E2E_PRODUCT_UIDS.B1,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.B1],
    availability: stockAll(200),
    price: 16,
    photoColors: ['#16a34a', '#14b8a6'],
    featured: true,
  },
  {
    productUid: E2E_PRODUCT_UIDS.OOS,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.OOS],
    availability: stockOos(),
    price: 9,
    photoColors: ['#f59e0b'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.USER_A,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.USER_A],
    availability: stockAll(200),
    price: 18,
    photoColors: ['#ec4899', '#a855f7'],
    audience: 'user-library',
    users: [E2E_USER_LIBRARY_USERS.A.email],
  },
  {
    productUid: E2E_PRODUCT_UIDS.USER_B,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.USER_B],
    availability: stockAll(200),
    price: 19,
    photoColors: ['#0ea5e9'],
    audience: 'user-library',
    users: [E2E_USER_LIBRARY_USERS.B.email],
  },
  {
    productUid: E2E_PRODUCT_UIDS.HOLD_WEB,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.HOLD_WEB],
    availability: stockOos(),
    price: 12,
    photoColors: ['#a16207'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.HOLD_MOBILE,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.HOLD_MOBILE],
    availability: stockOos(),
    price: 12,
    photoColors: ['#854d0e'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.RACE_STOCK,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.RACE_STOCK],
    availability: stockOos(),
    price: 11,
    photoColors: ['#475569'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.RACE_GIFT,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.RACE_GIFT],
    availability: stockOos(),
    price: 11,
    photoColors: ['#334155'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.CARRE_LONG,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.CARRE_LONG],
    availability: stockCarreLong(200),
    price: 17,
    photoColors: ['#be185d'],
    // Three 300px cards fit the desktop nouveautés track, so next/previous
    // stay disabled until a fourth in-window set is featured.
    featured: true,
    shapeKeys: ['carré'],
    shapeLengths: { carré: [E2E_LENGTH, E2E_LENGTH_ALT] },
  },
  {
    productUid: E2E_PRODUCT_UIDS.NAIL_A,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_A],
    productType: 'nail_single',
    availability: offerAll(),
    price: E2E_NAIL_PRICES.NAIL_A,
    photoColors: ['#fb7185'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.NAIL_B,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_B],
    productType: 'nail_single',
    availability: offerAll(),
    price: E2E_NAIL_PRICES.NAIL_B,
    photoColors: ['#84cc16'],
  },
  {
    productUid: E2E_PRODUCT_UIDS.NAIL_V,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_V],
    productType: 'nail_single',
    availability: offerAll(),
    price: E2E_NAIL_PRICES.NAIL_V,
    photoColors: ['#a78bfa'],
    variationAxis: E2E_VARIATION.AXIS,
    variations: [
      { key: E2E_VARIATION.BASE, price: null },
      { key: E2E_VARIATION.PREMIUM, price: E2E_NAIL_PRICES.NAIL_V_PREMIUM },
    ],
  },
  {
    productUid: E2E_PRODUCT_UIDS.NAIL_GAP,
    title: E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_GAP],
    productType: 'nail_single',
    availability: offerGap(),
    price: E2E_NAIL_PRICES.NAIL_GAP,
    photoColors: ['#38bdf8'],
  },
];

function opsHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

async function opsJson(
  apiBaseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = opsHeaders(token);
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { method, headers, body: payload });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function ensureVocabulary(apiBaseUrl: string, token: string): Promise<void> {
  const { status, json } = await opsJson(apiBaseUrl, token, 'GET', '/operation/library-import/vocabulary');
  if (status !== 200 || json.success !== true) {
    throw new Error(`vocabulary GET failed: ${status} ${JSON.stringify(json)}`);
  }
  const shapes = (json.shapes ?? {}) as Record<string, unknown>;
  const colors = (json.colors ?? {}) as Record<string, unknown>;
  const needShapes = E2E_SHAPES.filter((key) => !shapes[key]);
  const needColors = ['blanc', 'bleu'].filter((key) => !colors[key]);
  // Compose functional coverage needs a colour variation axis even when the
  // disposable stack never ran `library-nail` (seedTestDatabase does not).
  const tri = (fr: string) => ({ fr, en: fr, th: fr });
  const variations = {
    [E2E_VARIATION.AXIS]: {
      title: tri('couleur'),
      options: [
        { key: E2E_VARIATION.BASE, title: tri('rose') },
        { key: E2E_VARIATION.PREMIUM, title: tri('nuit') },
      ],
    },
  };

  if (needShapes.length === 0 && needColors.length === 0) {
    const postVariations = await opsJson(apiBaseUrl, token, 'POST', '/operation/library-import/vocabulary', {
      shapes: {},
      colors: {},
      variations,
    });
    if (postVariations.status !== 200 || postVariations.json.success !== true) {
      throw new Error(
        `vocabulary variation POST failed: ${postVariations.status} ${JSON.stringify(postVariations.json)}`,
      );
    }
    return;
  }

  const shapePayload: Record<string, unknown> = {};
  for (const key of E2E_SHAPES) {
    if (shapes[key]) continue;
    const length: Record<string, unknown> = {
      [E2E_LENGTH]: { value: '', title: { fr: E2E_LENGTH, en: E2E_LENGTH, th: E2E_LENGTH } },
    };
    // Only 'carré' also offers E2E_LENGTH_ALT (see CARRE_LONG) — every other
    // shape stays single-length, matching every other seed's own coverage.
    if (key === 'carré') {
      length[E2E_LENGTH_ALT] = {
        value: '',
        title: { fr: E2E_LENGTH_ALT, en: E2E_LENGTH_ALT, th: E2E_LENGTH_ALT },
      };
    }
    shapePayload[key] = { title: { fr: key, en: key, th: key }, length };
  }
  const colorPayload: Record<string, { fr: string; en: string; th: string }> = {};
  for (const key of needColors) {
    colorPayload[key] = { fr: key, en: key, th: key };
  }
  const post = await opsJson(apiBaseUrl, token, 'POST', '/operation/library-import/vocabulary', {
    shapes: shapePayload,
    colors: colorPayload,
    variations,
  });
  if (post.status !== 200 || post.json.success !== true) {
    throw new Error(`vocabulary POST failed: ${post.status} ${JSON.stringify(post.json)}`);
  }
}

/** The import endpoint resolves user-library recipients at import time. Make
 * the two deterministic recipients first; a rerun may reuse an account from
 * an earlier interrupted disposable run, so verify its known test password. */
async function ensureUserLibraryTestAccounts(apiBaseUrl: string): Promise<void> {
  for (const { email } of Object.values(E2E_USER_LIBRARY_USERS)) {
    const register = await fetch(`${apiBaseUrl}/auth/register`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: testPassword,
        gdprConsent: { accepted: true },
        language: 'fr',
      }),
    });
    if (register.status === 201) continue;
    if (register.status !== 409) {
      throw new Error(`Could not create functional user-library account ${email} (HTTP ${register.status}).`);
    }

    const login = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword, rememberMe: false }),
    });
    if (login.status !== 200) {
      throw new Error(
        `Existing functional user-library account ${email} cannot be reused (HTTP ${login.status}).`,
      );
    }
  }
}

async function uploadPlaceholders(
  apiBaseUrl: string,
  token: string,
  setId: string,
  shapeKey: string,
  lengthKey: string,
  colors: readonly string[],
  variationKey = '',
): Promise<void> {
  const form = new FormData();
  const hashes: string[] = [];
  for (const [i, color] of colors.entries()) {
    const png = await sharp({
      create: { width: 480, height: 480, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    form.append('photos', new Blob([png], { type: 'image/png' }), `${i + 1}.png`);
    hashes.push(createHash('sha256').update(png).digest('hex'));
  }
  form.append('hashes', JSON.stringify(hashes));
  const encodedShape = encodeURIComponent(shapeKey);
  const encodedLength = encodeURIComponent(lengthKey);
  const photoPath = variationKey
    ? `${apiBaseUrl}/operation/library-import/sets/${setId}/shapes/${encodedShape}/lengths/${encodedLength}/variations/${encodeURIComponent(variationKey)}/photos`
    : `${apiBaseUrl}/operation/library-import/sets/${setId}/shapes/${encodedShape}/lengths/${encodedLength}/photos`;
  const response = await fetch(photoPath, {
    method: 'POST',
    headers: opsHeaders(token),
    body: form,
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (response.status !== 200 || json.success !== true) {
    throw new Error(
      `photo upload ${shapeKey}/${lengthKey}${variationKey ? `/${variationKey}` : ''} failed: ${response.status} ${JSON.stringify(json)}`,
    );
  }
}

async function upsertSeed(
  apiBaseUrl: string,
  token: string,
  seed: SeedDef,
  photoRevision: string,
): Promise<string> {
  const tri = (fr: string) => ({ fr, en: fr, th: fr });
  const shapeKeys = seed.shapeKeys ?? E2E_SHAPES;
  const shapeLengths =
    seed.shapeLengths ?? Object.fromEntries(E2E_SHAPES.map((shape) => [shape, [E2E_LENGTH]]));
  const productType = seed.productType ?? 'nail';
  const payload: Record<string, unknown> = {
    productUid: seed.productUid,
    productType,
    title: tri(seed.title),
    // Revision forces metadata update → photosCleared so every distinct slide is re-uploaded.
    desc: tri(`${seed.title} — produit de test E2E (placeholder ${photoRevision}).`),
    occasion: tri('quotidien'),
    shapeKeys: [...shapeKeys],
    shapeLengths: Object.fromEntries(
      Object.entries(shapeLengths).map(([shape, lengths]) => [shape, [...lengths]]),
    ),
    colorMainKeys: ['blanc'],
    colorSecondaryKeys: ['bleu'],
    hidden: false,
    featuredFrom: seed.featured ? '2026-01-01' : null,
    featuredFor: seed.featured ? 800 : null,
    creationDate: new Date().toISOString().slice(0, 10),
    price: seed.price,
    availability: seed.availability,
    audience: seed.audience ?? 'public',
    users: seed.users ? [...seed.users] : [],
    update: true,
  };
  if (seed.variationAxis && seed.variations?.length) {
    payload.variationAxis = seed.variationAxis;
    payload.variations = seed.variations.map((option) => ({ ...option }));
    // Variation photos live under a different path than plain shape/length.
    // Force a wipe so every option gets a fresh placeholder matrix.
    payload.refreshPhotos = true;
  }

  const importPath =
    productType === 'nail_single'
      ? '/operation/library-import/sets?audience=public&productType=nail_single'
      : '/operation/library-import/sets';
  const { status, json } = await opsJson(apiBaseUrl, token, 'POST', importPath, payload);
  if (status !== 200 || json.success !== true || typeof json.id !== 'string') {
    throw new Error(`seed ${seed.productUid} failed: ${status} ${JSON.stringify(json)}`);
  }

  const setId = json.id;
  const needPhotos = json.created === true || json.updated === true || json.photosCleared === true;
  if (needPhotos) {
    const variationKeys =
      seed.variations && seed.variations.length > 0
        ? seed.variations.map((option) => option.key)
        : [''];
    for (const shape of shapeKeys) {
      for (const length of shapeLengths[shape] ?? [E2E_LENGTH]) {
        for (const variationKey of variationKeys) {
          await uploadPlaceholders(
            apiBaseUrl,
            token,
            setId,
            shape,
            length,
            seed.photoColors,
            variationKey,
          );
        }
      }
    }
  }

  return setId;
}

async function deleteSeed(apiBaseUrl: string, token: string, productUid: string): Promise<void> {
  const { status, json } = await opsJson(
    apiBaseUrl,
    token,
    'DELETE',
    `/operation/library-import/sets/${encodeURIComponent(productUid)}`,
  );
  if (status === 404) return;
  if (status !== 200 || json.success !== true) {
    throw new Error(`delete ${productUid} failed: ${status} ${JSON.stringify(json)}`);
  }
}

function resolveOps(mode: TestMode = loadTestEnv().mode): { apiBaseUrl: string; token: string } {
  const env = loadTestEnv(mode);
  const token = process.env.OPS_TOKEN || loadOpsToken(env.root, mode);
  if (!token) {
    throw new Error(`OPS_TOKEN missing for mode=${mode} (needed to seed E2E catalogue).`);
  }
  // Operational routes are no longer mounted on the public API. During an
  // isolated test run, the orchestrator keeps a loopback ops server alive and
  // exposes it separately from the disposable public API URL.
  const apiBaseUrl = process.env.PAM_OPS_API_BASE_URL ?? env.apiBaseUrl;
  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, ''), token };
}

interface ImportedAccessory {
  productUid: string;
  productType: 'accessory';
  title: Record<string, string>;
  desc: Record<string, string>;
  occasion: null;
  shapeKeys: string[];
  shapeLengths: Record<string, string[]>;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
  hidden: boolean;
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  price: number;
  availability: number;
}

function accessoryAvailability(value: unknown): number | null {
  if (Number.isInteger(value) && (value as number) >= 0) return value as number;
  if (typeof value !== 'object' || value === null) return null;
  const nested = (value as Record<string, unknown>)[''];
  if (typeof nested !== 'object' || nested === null) return null;
  const sizes = (nested as Record<string, unknown>)[''];
  if (typeof sizes !== 'object' || sizes === null) return null;
  const quantity = (sizes as Record<string, unknown>)[''];
  return Number.isInteger(quantity) && (quantity as number) >= 0 ? (quantity as number) : null;
}

function giftStockSnapshotPath(mode: TestMode): string {
  return join(loadTestEnv(mode).tmpDir, 'functional-gift-stock.json');
}

async function getGiftAccessory(apiBaseUrl: string, token: string): Promise<ImportedAccessory> {
  const { status, json } = await opsJson(
    apiBaseUrl,
    token,
    'GET',
    '/operation/library-import/sets?productType=accessory',
  );
  const sets = Array.isArray(json.sets) ? json.sets : [];
  const importedGift = sets.find(
    (set): set is ImportedAccessory =>
      typeof set === 'object' &&
      set !== null &&
      (set as { productUid?: unknown }).productUid === GIFT_PRODUCT_UID &&
      (set as { productType?: unknown }).productType === 'accessory',
  );
  const availability = importedGift ? accessoryAvailability(importedGift.availability) : null;
  if (status !== 200 || json.success !== true || !importedGift || availability === null) {
    throw new Error(`Functional gift ${GIFT_PRODUCT_UID} is unavailable for stock setup.`);
  }
  return { ...importedGift, availability };
}

async function setGiftAccessoryStock(
  apiBaseUrl: string,
  token: string,
  gift: ImportedAccessory,
  availability: number,
): Promise<void> {
  const { status, json } = await opsJson(apiBaseUrl, token, 'POST', '/operation/library-import/sets', {
    productUid: gift.productUid,
    productType: gift.productType,
    title: gift.title,
    desc: gift.desc,
    occasion: gift.occasion,
    shapeKeys: gift.shapeKeys,
    shapeLengths: gift.shapeLengths,
    colorMainKeys: gift.colorMainKeys,
    colorSecondaryKeys: gift.colorSecondaryKeys,
    hidden: gift.hidden,
    featuredFrom: gift.featuredFrom,
    featuredFor: gift.featuredFor,
    creationDate: gift.creationDate,
    price: gift.price,
    availability,
    update: true,
  });
  if (status !== 200 || json.success !== true) {
    throw new Error(`Functional gift stock update failed: ${status} ${JSON.stringify(json)}`);
  }
}

async function prepareFunctionalGiftStock(mode: TestMode, apiBaseUrl: string, token: string): Promise<void> {
  const snapshotPath = giftStockSnapshotPath(mode);
  // A forcibly interrupted prior run may leave its snapshot behind. Restore
  // that true baseline before taking a new one, rather than preserving the
  // temporary functional-suite quantity as if it were real catalogue stock.
  if (existsSync(snapshotPath)) {
    await restoreFunctionalGiftStock(mode, apiBaseUrl, token);
  }
  const gift = await getGiftAccessory(apiBaseUrl, token);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify({ availability: gift.availability }), 'utf8');
  try {
    await setGiftAccessoryStock(apiBaseUrl, token, gift, FUNCTIONAL_GIFT_STOCK);
  } catch (error) {
    try {
      await restoreFunctionalGiftStock(mode, apiBaseUrl, token);
    } catch (restoreError) {
      throw new Error(
        `Functional gift stock setup failed and could not be restored: ${
          restoreError instanceof Error ? restoreError.message : String(restoreError)
        }`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function restoreFunctionalGiftStock(mode: TestMode, apiBaseUrl: string, token: string): Promise<void> {
  const snapshotPath = giftStockSnapshotPath(mode);
  if (!existsSync(snapshotPath)) return;
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { availability?: unknown };
  if (!Number.isInteger(snapshot.availability) || (snapshot.availability as number) < 0) {
    throw new Error('Functional gift stock snapshot is invalid.');
  }
  const gift = await getGiftAccessory(apiBaseUrl, token);
  await setGiftAccessoryStock(apiBaseUrl, token, gift, snapshot.availability as number);
  rmSync(snapshotPath, { force: true });
}

/** Create or reset all E2E products (suite-wide stock + OOS last-unit). */
export async function seedE2eCatalogue(mode: TestMode = loadTestEnv().mode): Promise<void> {
  const { apiBaseUrl, token } = resolveOps(mode);
  await ensureVocabulary(apiBaseUrl, token);
  await ensureUserLibraryTestAccounts(loadTestEnv(mode).apiBaseUrl);
  await prepareFunctionalGiftStock(mode, apiBaseUrl, token);
  try {
    const photoRevision = Date.now().toString(36);
    for (const seed of SEEDS) {
      await upsertSeed(apiBaseUrl, token, seed, photoRevision);
    }
  } catch (error) {
    try {
      await restoreFunctionalGiftStock(mode, apiBaseUrl, token);
    } catch (restoreError) {
      throw new Error(
        `E2E catalogue setup failed and gift stock could not be restored: ${
          restoreError instanceof Error ? restoreError.message : String(restoreError)
        }`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** Restore the single OOS race variant before an independent scenario.
 *
 * Each race deliberately consumes, cancels, or releases its one unit. A
 * failed/interrupted predecessor must not turn the next scenario into a
 * gallery-filter failure instead of exercising its own checkout race.
 */
export async function resetE2eOosStock(mode: TestMode = loadTestEnv().mode): Promise<void> {
  await resetE2eLastUnitStock(E2E_PRODUCT_UIDS.OOS, mode);
}

/** Restore a last-unit E2E set before a scenario that must hide it from the
 * public gallery while a gift hold covers its only remaining size. */
export async function resetE2eLastUnitStock(
  productUid: E2eProductUid,
  mode: TestMode = loadTestEnv().mode,
): Promise<void> {
  const { apiBaseUrl, token } = resolveOps(mode);
  const seed = SEEDS.find((candidate) => candidate.productUid === productUid);
  if (!seed) throw new Error(`Missing E2E last-unit catalogue seed ${productUid}.`);
  await upsertSeed(apiBaseUrl, token, seed, `e2e-last-unit-${productUid}`);
}

/** Delete all E2E products. Safe if already absent. */
export async function deleteE2eCatalogue(mode: TestMode = loadTestEnv().mode): Promise<void> {
  const { apiBaseUrl, token } = resolveOps(mode);
  const errors: string[] = [];
  const uids = [...Object.values(E2E_PRODUCT_UIDS), ...E2E_LEGACY_PRODUCT_UIDS];
  for (const uid of uids) {
    try {
      await deleteSeed(apiBaseUrl, token, uid);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  try {
    await restoreFunctionalGiftStock(mode, apiBaseUrl, token);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (errors.length > 0) {
    throw new Error(`E2E catalogue teardown incomplete:\n${errors.join('\n')}`);
  }
}

/** Convenience: seed, run work, always delete (even on failure). */
export async function withE2eCatalogue<T>(
  work: () => Promise<T>,
  mode: TestMode = loadTestEnv().mode,
): Promise<T> {
  await seedE2eCatalogue(mode);
  try {
    return await work();
  } finally {
    await deleteE2eCatalogue(mode);
  }
}
