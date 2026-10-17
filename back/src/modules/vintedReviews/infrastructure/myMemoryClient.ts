/** MyMemory (api.mymemory.translated.net): free public translation, no key
 * and no account; anonymous use is limited to 5,000 characters a day.
 *
 * Polite like a person using it: one request at a time for the whole
 * process, with a random pause between two requests. Bounded: a timeout per
 * request and the caller's signal, a byte cap on the response. */

const ENDPOINT = 'https://api.mymemory.translated.net/get';
const REQUEST_TIMEOUT_MS = 8000;
const RESPONSE_MAX_BYTES = 256 * 1024;
/** Random pause between two MyMemory requests. */
const PAUSE_MIN_MS = 700;
const PAUSE_MAX_MS = 1500;

export class TranslationUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`translation_unavailable: ${reason}`);
    this.reason = reason;
  }
}

let queue: Promise<void> = Promise.resolve();
let lastFinishedAt = 0;

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

/** Runs `work` alone, after the previous request and a pause. */
function paced<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const pause =
      lastFinishedAt + PAUSE_MIN_MS + Math.floor(Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS)) - Date.now();
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

/** One piece of at most 500 bytes, `from` and `to` as MyMemory codes. */
export function myMemoryTranslate(
  text: string,
  from: string,
  to: string,
  signal: AbortSignal,
): Promise<string> {
  return paced(signal, async () => {
    const params = new URLSearchParams({ q: text, langpair: `${from}|${to}` });
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}?${params}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      throw new TranslationUnavailableError(
        error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network',
      );
    }
    const raw = await response.text().catch(() => '');
    if (!response.ok) throw new TranslationUnavailableError(`status_${response.status}`);
    if (raw.length > RESPONSE_MAX_BYTES) throw new TranslationUnavailableError('response_too_large');
    let body: {
      responseStatus?: unknown;
      quotaFinished?: unknown;
      responseData?: { translatedText?: unknown };
    };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new TranslationUnavailableError('not_json');
    }
    // Errors come back as HTTP 200 with their own status, and the message
    // in place of the translation.
    if (body.quotaFinished === true) throw new TranslationUnavailableError('quota');
    if (Number(body.responseStatus) !== 200) {
      throw new TranslationUnavailableError(`status_${String(body.responseStatus)}`);
    }
    const translated = body.responseData?.translatedText;
    if (typeof translated !== 'string' || !translated.trim() || translated.startsWith('MYMEMORY WARNING')) {
      throw new TranslationUnavailableError('empty');
    }
    return translated.trim();
  });
}
