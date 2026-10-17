/** Pure rules for vinted-reviews: which Vinted profile may be read, which
 * feedback counts as a real customer review, and how a member page reveals
 * a reviewer's location. No Express, pg, filesystem or provider call here. */

/** At most this many reviews are shown on the home page. */
export const FEATURED_REVIEWS_MAX = 3;
/** Bounds on one scrape request: the admin chooses within them. */
export const SCRAPE_COUNT_MIN = 1;
export const SCRAPE_COUNT_MAX = 30;
export const SCRAPE_COUNT_DEFAULT = 5;
/** Stored review text is capped: Vinted feedback is short, this only guards
 * against a malformed payload. */
export const REVIEW_TEXT_MAX = 2000;

/** Vinted's country storefronts. A profile URL on any other host is refused,
 * which keeps the server from being pointed at an arbitrary address. */
const VINTED_HOST =
  /^www\.vinted\.(fr|be|es|it|nl|de|at|lu|pt|pl|cz|sk|lt|se|dk|fi|gr|hu|ro|hr|ie|co\.uk|com)$/;

export interface VintedProfile {
  origin: string;
  memberId: string;
}

/** `https://www.vinted.fr/member/254890649` (optionally `-login`, a query or
 * a trailing slash) to its origin and numeric member id; null otherwise. */
export function parseVintedProfileUrl(raw: unknown): VintedProfile | null {
  if (typeof raw !== 'string' || raw.length > 300) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!VINTED_HOST.test(url.hostname)) return null;
  const match = /^\/member\/(\d{1,15})(?:-[^/]*)?\/?$/.exec(url.pathname);
  if (!match) return null;
  return { origin: `https://${url.hostname}`, memberId: match[1]! };
}

export function parseScrapeCount(raw: unknown): number | null {
  if (raw === undefined || raw === null) return SCRAPE_COUNT_DEFAULT;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < SCRAPE_COUNT_MIN || raw > SCRAPE_COUNT_MAX) return null;
  return raw;
}

/** Vinted writes these on the buyer's behalf when no review was left. */
const AUTOMATIC_PREFIXES = ['évaluation automatique', 'auto-feedback', 'automatic feedback'];

export interface VintedFeedbackInput {
  id: unknown;
  feedback: unknown;
  rating: unknown;
  system_feedback?: unknown;
  created_at_ts?: unknown;
  user?: { id?: unknown; login?: unknown } | null;
}

export interface RealFeedback {
  feedbackId: string;
  text: string;
  rating: number;
  reviewedAt: string;
  authorVintedId: string;
  authorLogin: string;
}

export function isAutomaticFeedback(feedback: VintedFeedbackInput): boolean {
  if (feedback.system_feedback === true) return true;
  const text = typeof feedback.feedback === 'string' ? feedback.feedback.trim().toLowerCase() : '';
  return AUTOMATIC_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function idString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^\d{1,19}$/.test(value)) return value;
  return null;
}

/** A buyer-written review, or null when it is automatic or malformed. */
export function toRealFeedback(feedback: VintedFeedbackInput): RealFeedback | null {
  if (isAutomaticFeedback(feedback)) return null;
  const feedbackId = idString(feedback.id);
  const authorVintedId = idString(feedback.user?.id);
  const authorLogin = typeof feedback.user?.login === 'string' ? feedback.user.login.trim() : '';
  const text = typeof feedback.feedback === 'string' ? feedback.feedback.trim() : '';
  const rating = typeof feedback.rating === 'number' ? Math.round(feedback.rating) : NaN;
  const reviewedAt =
    typeof feedback.created_at_ts === 'string' && !Number.isNaN(Date.parse(feedback.created_at_ts))
      ? new Date(feedback.created_at_ts).toISOString()
      : null;
  if (!feedbackId || !authorVintedId || !authorLogin || authorLogin.length > 80) return null;
  if (!text || !reviewedAt || !(rating >= 1 && rating <= 5)) return null;
  return {
    feedbackId,
    text: text.slice(0, REVIEW_TEXT_MAX),
    rating,
    reviewedAt,
    authorVintedId,
    authorLogin,
  };
}

export interface MemberLocation {
  city: string | null;
  countryCode: string | null;
}

function unescapeJsonString(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return null;
  }
}

/** The member page embeds the profile as escaped JSON in a Next.js payload:
 * `\\"id\\":146700350,...\\"expose_location\\":true,\\"city\\":\\"Châteaubriant\\",
 * \\"city_id\\":15274,\\"country_code\\":\\"FR\\"`. Only the block that follows the
 * member's own id is read. Like Vinted's own profile page, a member who hides
 * their location (`expose_location: false`) keeps their city hidden but still
 * shows their country. */
export function parseMemberLocation(html: string, memberId: string): MemberLocation {
  const none: MemberLocation = { city: null, countryCode: null };
  const anchor = html.indexOf(`\\"id\\":${memberId},\\"`);
  if (anchor < 0) return none;
  const block = html.slice(anchor, anchor + 20000);
  const country = /\\"country_code\\":\\"([A-Z]{2})\\"/.exec(block);
  const countryCode = country ? country[1]! : null;
  const expose = /\\"expose_location\\":(true|false)/.exec(block);
  if (!expose || expose[1] !== 'true') return { city: null, countryCode };
  const city = /\\"city\\":\\"((?:(?!\\").){1,200})\\"/.exec(block);
  // Escaped twice (JSON inside a JS string): undo both levels.
  const once = city ? unescapeJsonString(city[1]!) : null;
  const cityText = once ? (unescapeJsonString(once) ?? once).trim().slice(0, 120) || null : null;
  return { city: cityText, countryCode };
}

export interface ShopRating {
  /** One decimal, as Vinted shows it: "4.9". */
  rating: string;
  reviewCount: number;
}

/** The shop's own rating from its member page: Vinted's
 * `feedback_reputation` (0 to 1) is its star score divided by five. */
export function parseShopRating(html: string, memberId: string): ShopRating | null {
  const anchor = html.indexOf(`\\"id\\":${memberId},\\"`);
  if (anchor < 0) return null;
  const block = html.slice(anchor, anchor + 20000);
  const reputation = /\\"feedback_reputation\\":([0-9.]+)/.exec(block);
  const count = /\\"feedback_count\\":(\d+)/.exec(block);
  if (!reputation || !count) return null;
  const value = Number(reputation[1]);
  const reviewCount = Number(count[1]);
  if (!(value >= 0 && value <= 1) || !Number.isSafeInteger(reviewCount)) return null;
  return { rating: (Math.round(value * 50) / 10).toFixed(1), reviewCount };
}

/** Newest selection first, then the previously featured ones, capped: the
 * oldest featured review drops off. */
export function nextFeaturedIds(currentNewestFirst: string[], selected: string[]): string[] {
  const unique = [...new Set(selected)];
  const kept = currentNewestFirst.filter((id) => !unique.includes(id));
  return [...unique, ...kept].slice(0, FEATURED_REVIEWS_MAX);
}

/** Site languages a review is translated into (same set as the front). */
export const REVIEW_LANGS = ['fr', 'en', 'es', 'it', 'nl', 'pt', 'th'] as const;
export type ReviewLang = (typeof REVIEW_LANGS)[number];

/** MyMemory language code per site language: British English and European
 * Portuguese, the variants a European shop's visitors expect. */
const MYMEMORY_CODE: Record<ReviewLang, string> = {
  fr: 'fr',
  en: 'en-GB',
  es: 'es',
  it: 'it',
  nl: 'nl',
  pt: 'pt-PT',
  th: 'th',
};

export function myMemoryCode(lang: ReviewLang): string {
  return MYMEMORY_CODE[lang];
}

export function isReviewLang(value: unknown): value is ReviewLang {
  return typeof value === 'string' && (REVIEW_LANGS as readonly string[]).includes(value);
}

/** Vinted gives no language per review: a review is taken to be in the
 * storefront's language (www.vinted.fr: French). Null for a storefront whose
 * language the site does not offer. */
const STOREFRONT_LANG: Record<string, ReviewLang> = {
  fr: 'fr',
  be: 'fr',
  lu: 'fr',
  es: 'es',
  it: 'it',
  nl: 'nl',
  pt: 'pt',
  'co.uk': 'en',
  ie: 'en',
  com: 'en',
};

export function storefrontLang(origin: string): ReviewLang | null {
  const match = /^https:\/\/www\.vinted\.(.+)$/.exec(origin);
  return (match && STOREFRONT_LANG[match[1]!]) || null;
}

/** MyMemory takes at most 500 bytes per query: the text is cut at sentence
 * ends, then at spaces, into pieces of at most `maxBytes` UTF-8 bytes. */
export function splitForTranslation(text: string, maxBytes = 450): string[] {
  const encoder = new TextEncoder();
  const bytes = (value: string) => encoder.encode(value).length;
  const pieces: string[] = [];
  let current = '';
  const push = (part: string) => {
    if (!part) return;
    if (bytes(current + part) <= maxBytes) {
      current += part;
      return;
    }
    if (current) pieces.push(current.trim());
    current = '';
    if (bytes(part) <= maxBytes) {
      current = part;
      return;
    }
    for (const word of part.split(/(?<=\s)/)) {
      if (bytes(current + word) > maxBytes && current) {
        pieces.push(current.trim());
        current = '';
      }
      let rest = word;
      while (bytes(rest) > maxBytes) {
        let cut = rest.length;
        while (bytes(rest.slice(0, cut)) > maxBytes) cut -= 1;
        pieces.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current += rest;
    }
  };
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) push(current ? ` ${sentence}` : sentence);
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

/** Stored translations are trusted only for site languages, as non-empty
 * text within the review bound. */
export function cleanTranslations(raw: unknown): Partial<Record<ReviewLang, string>> {
  const clean: Partial<Record<ReviewLang, string>> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const lang of REVIEW_LANGS) {
    const text = (raw as Record<string, unknown>)[lang];
    if (typeof text === 'string' && text.trim()) clean[lang] = text.trim().slice(0, REVIEW_TEXT_MAX);
  }
  return clean;
}
