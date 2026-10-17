/** Read-only HTTP access to Vinted's public pages, the way a signed-out
 * visitor's browser sees them. No account and no credentials: the home page
 * hands out an anonymous session cookie, which the feedback JSON endpoint
 * requires.
 *
 * Polite by construction:
 * - one request at a time for the whole process, with a random pause of a
 *   second or two between two requests, so Vinted sees the pace of someone
 *   reading, never a burst;
 * - one anonymous session reused for a while, its cookies kept up to date
 *   from every response like a browser's cookie jar, instead of a fresh visit
 *   to the home page for every scrape;
 * - the request headers a browser sends for the same navigation.
 * A refusal (401/403) drops the session so the next scrape starts a new one.
 *
 * Every call is bounded by its own timeout and by the caller's signal, and
 * every body by a byte cap, so a slow or hostile response can neither hang a
 * request nor exhaust memory. */
import type { VintedFeedbackInput, VintedProfile } from '../domain/vintedReviewsRules.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 8000;
const PAGE_MAX_BYTES = 4 * 1024 * 1024;
const JSON_MAX_BYTES = 2 * 1024 * 1024;
/** Random pause between two Vinted requests. */
const PAUSE_MIN_MS = 1200;
const PAUSE_MAX_MS = 2800;
/** An anonymous session is reused for this long. */
const SESSION_TTL_MS = 20 * 60_000;

export class VintedUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`vinted_unavailable: ${reason}`);
    this.reason = reason;
  }
}

export interface VintedSession {
  origin: string;
  /** Cookie name to value, updated from every response. */
  jar: Map<string, string>;
  expiresAt: number;
}

let cachedSession: VintedSession | null = null;
/** Tail of the request queue: each request starts after the previous one
 * finished and a pause elapsed. */
let queue: Promise<void> = Promise.resolve();
let lastFinishedAt = 0;

function pauseMs(): number {
  return PAUSE_MIN_MS + Math.floor(Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Runs `work` alone, after the previous request and a human-length pause. */
function paced<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const pause = lastFinishedAt + pauseMs() - Date.now();
    if (pause > 0) await wait(pause, signal);
    try {
      return await work();
    } finally {
      lastFinishedAt = Date.now();
    }
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function storeCookies(jar: Map<string, string>, response: Response): void {
  // Vinted clears a cookie and sets it again in the same response: like a
  // browser jar, the last value of a name wins and an emptied one is dropped.
  for (const entry of response.headers.getSetCookie()) {
    const pair = entry.split(';')[0]!.trim();
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** What Chrome sends when the visitor opens a page (`document`) or when that
 * page's script calls the API (`api`). */
function browserHeaders(kind: 'document' | 'api', referer?: string): Record<string, string> {
  const common = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    ...(referer ? { Referer: referer } : {}),
  };
  if (kind === 'api') {
    return { ...common, Accept: 'application/json, text/plain, */*' };
  }
  return {
    ...common,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1',
  };
}

function signalFor(parent: AbortSignal): AbortSignal {
  return AbortSignal.any([parent, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new VintedUnavailableError('response_too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** One paced GET; the response's cookies go into the session's jar. */
async function get(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string>,
  session?: VintedSession,
): Promise<Response> {
  return paced(signal, async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: signalFor(signal),
        redirect: 'follow',
        headers: session ? { ...headers, Cookie: cookieHeader(session.jar) } : headers,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new VintedUnavailableError(
        error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network',
      );
    }
    if (session) storeCookies(session.jar, response);
    if (response.status === 401 || response.status === 403) cachedSession = null;
    return response;
  });
}

/** The current anonymous session for this Vinted site, or a new one. */
export async function openVintedSession(profile: VintedProfile, signal: AbortSignal): Promise<VintedSession> {
  if (cachedSession && cachedSession.origin === profile.origin && cachedSession.expiresAt > Date.now()) {
    return cachedSession;
  }
  const session: VintedSession = {
    origin: profile.origin,
    jar: new Map(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const response = await get(`${profile.origin}/`, signal, browserHeaders('document'), session);
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok || !session.jar.has('access_token_web')) {
    throw new VintedUnavailableError(`session_${response.status}`);
  }
  cachedSession = session;
  return session;
}

export interface VintedFeedbackPage {
  feedbacks: VintedFeedbackInput[];
  totalPages: number;
}

export async function fetchVintedFeedbackPage(
  session: VintedSession,
  memberId: string,
  page: number,
  perPage: number,
  signal: AbortSignal,
): Promise<VintedFeedbackPage> {
  const params = new URLSearchParams({
    user_id: memberId,
    page: String(page),
    per_page: String(perPage),
    by: 'all',
  });
  const response = await get(
    `${session.origin}/api/v2/user_feedbacks?${params}`,
    signal,
    browserHeaders('api', `${session.origin}/member/${memberId}?tab=feedback`),
    session,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new VintedUnavailableError(`feedbacks_${response.status}`);
  }
  let body: { user_feedbacks?: unknown; pagination?: { total_pages?: unknown } };
  try {
    body = JSON.parse(await readBounded(response, JSON_MAX_BYTES));
  } catch (error) {
    if (error instanceof VintedUnavailableError) throw error;
    throw new VintedUnavailableError('feedbacks_not_json');
  }
  if (!Array.isArray(body.user_feedbacks)) throw new VintedUnavailableError('feedbacks_shape');
  const totalPages = Number(body.pagination?.total_pages);
  return {
    feedbacks: body.user_feedbacks as VintedFeedbackInput[],
    totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : page,
  };
}

/** A member's public profile page as HTML (location and rating are embedded).
 * `referer`: the page a visitor would have clicked through from. */
export async function fetchVintedMemberPage(
  session: VintedSession,
  memberId: string,
  signal: AbortSignal,
  referer?: string,
): Promise<string> {
  const response = await get(
    `${session.origin}/member/${memberId}`,
    signal,
    browserHeaders('document', referer),
    session,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new VintedUnavailableError(`member_${response.status}`);
  }
  return readBounded(response, PAGE_MAX_BYTES);
}
