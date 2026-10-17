/** Measures what the LWS "Fastest Cache" edge (a Varnish in front of Apache on
 * the hosting node itself, not a CDN) actually does to this site's responses.
 *
 * The cPanel plugin that drives that edge has no path rules, no TTL setting and
 * no exclusion list: per domain it stores only `cache_enabled`, a
 * `wordpress|prestashop` profile, and a temporary developer-mode flag. So the
 * ONLY way to keep a URL out of the edge cache is the response header the
 * origin sends, which for the front means `../pamsurin-front/public/.htaccess`.
 * Whether the edge honours those headers is not documented anywhere by LWS,
 * which is what this command exists to find out and to keep verifying.
 *
 * Usage:
 *   npm run edge-cache -- probe --preprod [--json]
 *   npm run edge-cache -- probe --prod
 *
 * Every check is read-only: it issues plain GETs against the public site.
 *
 * The six questions, and why each one matters:
 *
 *  1. `mode`     Is the edge even active for this domain? Everything below is
 *                meaningless while it reports INACTIVE, so this runs first and
 *                short-circuits the rest.
 *  2. `caching`  Which URL shapes actually get stored? Two identical requests;
 *                the second should report a HIT if the edge decided to cache.
 *  3. `no-store` Does an origin `Cache-Control` that forbids storage actually
 *                prevent it? This is the question the whole exclusion strategy
 *                rests on. Answered by correlating each URL's origin header
 *                with whether it was stored anyway.
 *  4. `vary`     Is `Vary` respected? The API localizes on `Accept-Language`
 *                alone, so an edge that ignores `Vary` would serve one
 *                visitor's language to the next.
 *  5. `ua-mix`   The critical one for this site. Share-preview bots get a 302
 *                to the backend's preview endpoint (see the front .htaccess).
 *                Varnish keys on URL and ignores User-Agent, so a bot's
 *                redirect can be stored and then served to a human, bouncing
 *                real visitors off the site. This probes it directly: fetch a
 *                product URL as a bot, then as a browser, and see what the
 *                browser gets, and the reverse.
 *  6. `compression` The edge compresses responses itself. Handed one that
 *                already carries the `Content-Encoding: gzip` the front's .gz
 *                rewrite forces, it answers 503 to any client asking for `br`
 *                (which is every browser). This is what made enabling the
 *                cache blank the site, so it stays a permanent regression test.
 *
 * Exit code is 1 when any check reports a `fail` verdict, so this can gate a
 * deploy. A `skip` (edge inactive, no product to test with) never fails.
 */
import { Command } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addTargetOptions, DEPLOY_MODES, makeFail, resolveModeFromOpts } from './cliCommon.js';
import { loadApiBaseUrl, loadPublicEnv } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A browser-shaped UA. The share-bot rules in the front `.htaccess` match on
 * scraper-specific tokens, so this must contain none of them. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
/** One of the tokens the front `.htaccess` redirects.
 *
 * Deliberately NOT `facebookexternalhit`, `Twitterbot` or any other major
 * platform's token: the LWS edge verifies those against the owning network's
 * IP ranges and answers 403 to anything else ("identifying as from a known bot
 * but is not received from the correct network"). That check is correct
 * behaviour and real crawlers pass it, but it makes those tokens unusable from
 * a developer machine or CI. `line-poker` is LINE's preview fetcher, is in the
 * front's redirect list, and is not IP-verified here, so it exercises the same
 * rewrite from anywhere. */
const SHARE_BOT_UA = 'Mozilla/5.0 (compatible; line-poker/1.0)';

type Verdict = 'pass' | 'fail' | 'warn' | 'skip';

type Probe = {
  label: string;
  url: string;
  /** What the origin asked for, read from the first response. */
  originCacheControl: string | null;
  firstHit: string | null;
  secondHit: string | null;
  age: string | null;
  firstMs: number;
  secondMs: number;
  status: number;
  cached: boolean;
};

type Check = {
  id: string;
  verdict: Verdict;
  detail: string;
};

type Fetched = {
  status: number;
  headers: Headers;
  body: string;
  elapsedMs: number;
};

/** Pause between requests. The host throttles a burst of rapid connections
 * (observed as a 503, then as the socket being closed mid-response), and a
 * probe that trips the throttle measures the throttle rather than the cache. */
const REQUEST_SPACING_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One GET, with the body fully read so the timing includes transfer, and
 * redirects left unfollowed so a 302 is visible as itself.
 *
 * Retries a dropped connection once: this runs against a shared host whose
 * throttling closes sockets under burst, and a transport blip must not abort
 * the whole run. A request that still fails comes back as status 0, which
 * every caller treats as "no answer" rather than as evidence. */
async function fetchOnce(url: string, headers: Record<string, string> = {}): Promise<Fetched> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': BROWSER_UA, ...headers },
        redirect: 'manual',
      });
      const body = await response.text();
      // Measured before the pacing sleep, or every timing would report the
      // sleep instead of the request.
      const elapsedMs = Math.round(performance.now() - startedAt);
      await sleep(REQUEST_SPACING_MS);
      return { status: response.status, headers: response.headers, body, elapsedMs };
    } catch {
      await sleep(1000);
    }
  }
  return { status: 0, headers: new Headers(), body: '', elapsedMs: 0 };
}

/** Which of the host's two mutually exclusive edges is serving this domain.
 * Fastest Cache (Varnish) and LsCache (LiteSpeed) report themselves, and their
 * state, through different headers. */
function edgeEngine(response: Fetched): 'varnish' | 'litespeed' | 'unknown' {
  const engine = response.headers.get('edge-cache-engine')?.toLowerCase();
  if (engine === 'varnish' || engine === 'litespeed') return engine;
  return 'unknown';
}

/** HIT/MISS for this request, normalised across both engines.
 *
 * Varnish answers with `edge-cache-engine-hit`. LiteSpeed uses
 * `x-litespeed-cache`, and sends NO header at all when the URL was never
 * eligible for caching, which is the normal state for anything the
 * `<IfModule LiteSpeed>` block in the front `.htaccess` does not opt in. */
function edgeHit(response: Fetched): string | null {
  return response.headers.get('edge-cache-engine-hit') ?? response.headers.get('x-litespeed-cache');
}

/** Two identical requests, far enough apart that the edge has stored the first
 * before the second asks for it. */
async function probeUrl(label: string, url: string): Promise<Probe> {
  const first = await fetchOnce(url);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const second = await fetchOnce(url);
  const secondHit = edgeHit(second);
  return {
    label,
    url,
    originCacheControl: first.headers.get('cache-control'),
    firstHit: edgeHit(first),
    secondHit,
    age: second.headers.get('age'),
    firstMs: first.elapsedMs,
    secondMs: second.elapsedMs,
    status: first.status,
    cached: secondHit?.toUpperCase() === 'HIT',
  };
}

/** A real hashed asset URL, scraped from the splash HTML.
 *
 * Asset filenames carry a content hash, so they cannot be guessed and a made-up
 * path like `/assets/index.js` does not 404: the SPA-fallback rewrite answers
 * 200 with `index.html`, which would silently make this row measure the HTML
 * again instead of an asset. */
async function firstAssetPath(frontBaseUrl: string): Promise<string | undefined> {
  try {
    const response = await fetchOnce(frontBaseUrl);
    const match = /(?:src|href)="(\/?assets\/[^"]+\.(?:js|css))"/.exec(response.body);
    if (!match) return undefined;
    return match[1].startsWith('/') ? match[1] : `/${match[1]}`;
  } catch {
    return undefined;
  }
}

/** A live product uid, so the share-bot check runs against a URL that really
 * resolves. Returns undefined rather than throwing: a catalogue that is empty
 * or an API that is down turns the UA check into a skip, not a failure. */
async function productUids(apiBaseUrl: string, count: number): Promise<string[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/gallery/feed?limit=${count}`);
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: { productUid?: string }[] };
    return (payload.items ?? []).map((item) => item.productUid).filter((uid): uid is string => Boolean(uid));
  } catch {
    return [];
  }
}

/** `Cache-Control` values that forbid an intermediary from storing the
 * response at all. `max-age=0, must-revalidate` is deliberately NOT one of
 * them: it permits storage and only forces revalidation, which is why the
 * prerendered HTML is a legitimate cache candidate. */
function forbidsStorage(cacheControl: string | null): boolean {
  if (!cacheControl) return false;
  return /no-store|private/i.test(cacheControl);
}

function checkNoStoreHonoured(probes: Probe[]): Check {
  const relevant = probes.filter((probe) => forbidsStorage(probe.originCacheControl));
  if (relevant.length === 0)
    return {
      id: 'no-store',
      verdict: 'skip',
      detail: 'no probed URL sent no-store/private, so the edge was never asked to skip one',
    };
  const violated = relevant.filter((probe) => probe.cached);
  if (violated.length === 0)
    return {
      id: 'no-store',
      verdict: 'pass',
      detail: `${relevant.length} no-store URL(s) all stayed out of the cache`,
    };
  return {
    id: 'no-store',
    verdict: 'fail',
    detail: `the edge stored ${violated.length} URL(s) the origin marked no-store: ${violated
      .map((probe) => probe.label)
      .join(', ')}. Header-based exclusion does not work here.`,
  };
}

/** Same URL, two languages. If the edge caches it and ignores `Vary`, the
 * second language gets the first's body back. */
async function checkVary(url: string): Promise<Check> {
  const french = await fetchOnce(url, { 'accept-language': 'fr-FR,fr;q=0.9' });
  // The API lives on its own domain with its own Fastest Cache switch. If that
  // switch is off there is no cache to fool, so a "pass" here would mean
  // nothing: report it as a skip rather than as evidence.
  const apiEdgeMode = french.headers.get('edge-cache-engine-mode');
  if (apiEdgeMode?.toUpperCase() !== 'ACTIVE')
    return {
      id: 'vary',
      verdict: 'skip',
      detail: `the API domain's edge is ${apiEdgeMode ?? 'absent'}, so nothing could be served from cache`,
    };
  const thai = await fetchOnce(url, { 'accept-language': 'th-TH,th;q=0.9' });
  if (french.status !== 200 || thai.status !== 200)
    return { id: 'vary', verdict: 'skip', detail: `unexpected status ${french.status}/${thai.status}` };
  if (french.body === thai.body) {
    const cached = edgeHit(thai)?.toUpperCase() === 'HIT';
    if (!cached)
      return {
        id: 'vary',
        verdict: 'skip',
        detail: 'identical bodies but the response was not cached, so this proves nothing',
      };
    return {
      id: 'vary',
      verdict: 'fail',
      detail: 'a cached response was served across two different Accept-Language values (Vary ignored)',
    };
  }
  return { id: 'vary', verdict: 'pass', detail: 'different Accept-Language values got different bodies' };
}

/** The one that decides whether this site can have an edge cache at all.
 *
 * Both directions are failures and both are real:
 *  - bot warms the URL, human gets the 302: visitors are bounced off the site
 *    to the API's preview endpoint.
 *  - human warms the URL, bot gets the 200: the SPA shell is served to a
 *    preview fetcher that cannot run JS, so every share card silently falls
 *    back to the generic one.
 *
 * Each direction needs a URL that nothing has requested yet, or the first
 * fetch just reads whatever the probe table already stored, so this takes two
 * distinct product uids and warms each one itself.
 */
async function checkUserAgentMixing(frontBaseUrl: string, uids: string[]): Promise<Check> {
  if (uids.length < 2)
    return { id: 'ua-mix', verdict: 'skip', detail: 'needs two unprobed product uids from the gallery feed' };
  const [botFirstUid, humanFirstUid] = uids;
  const botFirstUrl = `${frontBaseUrl}/fr/creations/${botFirstUid}`;
  const humanFirstUrl = `${frontBaseUrl}/fr/creations/${humanFirstUid}`;

  // Direction 1: bot warms it, then a browser asks.
  const bot = await fetchOnce(botFirstUrl, { 'user-agent': SHARE_BOT_UA });
  if (bot.status !== 302)
    return {
      id: 'ua-mix',
      verdict: 'skip',
      detail: `share-bot UA got ${bot.status} on a cold URL, expected a 302. Is the front .htaccess deployed to this target?`,
    };
  await new Promise((resolve) => setTimeout(resolve, 400));
  const human = await fetchOnce(botFirstUrl, { 'user-agent': BROWSER_UA });

  // Direction 2: a browser warms it, then the bot asks.
  const humanWarm = await fetchOnce(humanFirstUrl, { 'user-agent': BROWSER_UA });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const botSecond = await fetchOnce(humanFirstUrl, { 'user-agent': SHARE_BOT_UA });

  const failures: string[] = [];
  if (human.status === 302)
    failures.push(`a browser received the bot's redirect (${human.headers.get('location') ?? 'no location'})`);
  if (humanWarm.status === 200 && botSecond.status !== 302)
    failures.push(`a share bot received the browser's ${botSecond.status} instead of its redirect`);

  if (failures.length > 0)
    return {
      id: 'ua-mix',
      verdict: 'fail',
      detail: `${failures.join('; ')}. The edge ignores User-Agent, so these URLs cannot be cached.`,
    };
  return {
    id: 'ua-mix',
    verdict: 'pass',
    detail: `bot got 302 and browser got ${human.status} on one URL; bot still got ${botSecond.status} after a browser warmed another`,
  };
}

/** The regression test for the failure that made Fastest Cache unusable here.
 *
 * The front `.htaccess` serves a pre-compressed `.gz` sibling under the
 * original URL and forces `Content-Encoding: gzip` on it unconditionally,
 * because with the edge INACTIVE this host strips `Accept-Encoding` before
 * Apache sees it and nothing that negotiates on that header can work.
 *
 * With the edge ACTIVE that premise inverts: the edge compresses responses
 * itself (HTML and SVG come back as `br`, which Apache never produced). Handed
 * a response that already declares `Content-Encoding: gzip` while the client
 * asked for `br`, it answers 503. Browsers all send `br`, so every JS and CSS
 * bundle fails and the site is blank.
 *
 * Checks the two encodings that matter: what a real browser sends, and the
 * gzip-only subset that works either way.
 */
async function checkCompression(frontBaseUrl: string, assetPath: string | undefined): Promise<Check> {
  if (!assetPath)
    return { id: 'compression', verdict: 'skip', detail: 'no hashed asset found in the splash HTML' };
  const url = `${frontBaseUrl}${assetPath}`;
  const browser = await fetchOnce(url, { 'accept-encoding': 'gzip, deflate, br, zstd' });
  const gzipOnly = await fetchOnce(url, { 'accept-encoding': 'gzip, deflate' });
  if (browser.status === 200)
    return {
      id: 'compression',
      verdict: 'pass',
      detail: `${assetPath} served 200 to a browser Accept-Encoding (${browser.headers.get('content-encoding') ?? 'identity'})`,
    };
  return {
    id: 'compression',
    verdict: 'fail',
    detail: `${assetPath} returned ${browser.status} for "gzip, deflate, br, zstd" but ${gzipOnly.status} for "gzip, deflate". The edge cannot re-encode the forced Content-Encoding from the .gz rewrite: every browser bundle is broken.`,
  };
}

/** `?FC-Cache-Bypass=1` is the documented per-request escape hatch. Worth
 * confirming it works, because it is the only way to look at origin output
 * once the edge is live. */
async function checkBypass(url: string): Promise<Check> {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetchOnce(`${url}${separator}FC-Cache-Bypass=1`);
  const hit = edgeHit(response)?.toUpperCase();
  if (hit === 'HIT')
    return { id: 'bypass', verdict: 'fail', detail: 'FC-Cache-Bypass=1 still served a cached response' };
  return { id: 'bypass', verdict: 'pass', detail: `FC-Cache-Bypass=1 reached the origin (${hit ?? 'no hit header'})` };
}

const program = new Command();
program.name('edge-cache').description('Probe the LWS Fastest Cache edge for a target.');
// Flags follow the subcommand name, so they are attached there rather than to
// the root. Only the deployed targets exist: there is no edge in front of dev.
const probeCommand = program.command('probe').description('Read-only measurement of what the edge caches.');
addTargetOptions(probeCommand, DEPLOY_MODES).option(
  '--json',
  'print one JSON object to stdout instead of the human-readable output',
);
const fail: (message: string) => never = makeFail(program, 'edge-cache');

async function main(): Promise<void> {
  program.parse();
  const command = program.args[0];
  if (command !== 'probe') fail(`unknown subcommand ${command ?? '(none)'} (expected: probe)`);

  const opts = probeCommand.opts();
  let mode: Mode;
  try {
    mode = resolveModeFromOpts(opts, DEPLOY_MODES);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const json = Boolean(opts.json);

  const publicEnv = loadPublicEnv(root, mode);
  const frontBaseUrl = publicEnv.URL_FRONTEND_BASE;
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!frontBaseUrl) fail(`URL_FRONTEND_BASE not found for ${mode}`);
  if (!apiBaseUrl) fail(`URL_API_BASE not found for ${mode}`);

  // Which edge is live, and is it on? Everything else is noise while it is not.
  // The two engines are mutually exclusive per domain and announce themselves
  // differently: Varnish carries an explicit ACTIVE/INACTIVE mode header, while
  // LiteSpeed just names itself and is on whenever it answers.
  const entry = await fetchOnce(`${frontBaseUrl}/fr/home`);
  const engine = edgeEngine(entry);
  const edgeMode = entry.headers.get('edge-cache-engine-mode') ?? (engine === 'litespeed' ? 'ACTIVE' : null);
  if (edgeMode?.toUpperCase() !== 'ACTIVE') {
    const detail = `edge=${engine} reports mode=${edgeMode ?? 'no header'} for ${frontBaseUrl}. Enable Fastest Cache or LiteSpeed LsCache for this domain in cPanel before probing.`;
    if (json) printJson({ mode, frontBaseUrl, engine, edgeMode, checks: [{ id: 'mode', verdict: 'skip', detail }] });
    else log(json, `[edge-cache] ${detail}`);
    return;
  }

  // Three uids: one for the probe table, two more kept cold for `ua-mix`,
  // which has to warm its own URLs to prove anything.
  const uids = await productUids(apiBaseUrl, 3);
  const productUid = uids[0];
  const uaMixUids = uids.slice(1);
  const assetPath = await firstAssetPath(frontBaseUrl);
  const targets: { label: string; path: string }[] = [
    { label: 'splash', path: '/' },
    { label: 'prerendered-html', path: '/fr/home' },
    { label: 'prerendered-gallery', path: '/fr/gallery' },
    { label: 'sitemap-php', path: '/sitemap-products.xml' },
    { label: 'account-shell', path: '/fr/account' },
  ];
  if (assetPath) targets.push({ label: 'hashed-asset', path: assetPath });
  if (productUid) targets.push({ label: 'product-page', path: `/fr/creations/${productUid}` });
  if (productUid) targets.push({ label: 'product-query', path: `/fr/gallery?product=${productUid}` });

  const probes: Probe[] = [];
  for (const target of targets) probes.push(await probeUrl(target.label, `${frontBaseUrl}${target.path}`));

  const checks: Check[] = [{ id: 'mode', verdict: 'pass', detail: `edge active: ${engine} (${edgeMode})` }];
  checks.push(checkNoStoreHonoured(probes));
  checks.push(await checkVary(`${apiBaseUrl}/gallery/filter-options`));
  checks.push(await checkUserAgentMixing(frontBaseUrl, uaMixUids));
  checks.push(await checkCompression(frontBaseUrl, assetPath));
  checks.push(await checkBypass(`${frontBaseUrl}/fr/home`));

  // The speed answer: how much the edge saves on what it did cache.
  const cached = probes.filter((probe) => probe.cached);
  const savedMs = cached.map((probe) => probe.firstMs - probe.secondMs);
  const medianSaved =
    savedMs.length === 0 ? null : savedMs.slice().sort((a, b) => a - b)[Math.floor(savedMs.length / 2)];

  if (json) {
    printJson({ mode, frontBaseUrl, apiBaseUrl, engine, edgeMode, productUid, probes, checks, medianSavedMs: medianSaved });
  } else {
    log(json, `[edge-cache] mode=${mode} front=${frontBaseUrl} edge=${engine} (${edgeMode})`);
    logTable(
      json,
      probes.map((probe) => ({
        url: probe.label,
        status: probe.status,
        origin: probe.originCacheControl ?? '-',
        '1st': probe.firstHit ?? '-',
        '2nd': probe.secondHit ?? '-',
        cached: probe.cached ? 'yes' : 'no',
        'ms 1st': probe.firstMs,
        'ms 2nd': probe.secondMs,
      })),
    );
    log(json, '');
    for (const check of checks) log(json, `  [${check.verdict.toUpperCase()}] ${check.id}: ${check.detail}`);
    log(json, '');
    log(
      json,
      medianSaved === null
        ? '  speed: nothing was cached, so there is no saving to report'
        : `  speed: ${cached.length}/${probes.length} URL(s) cached, median saving ${medianSaved}ms per request`,
    );
  }

  if (checks.some((check) => check.verdict === 'fail')) process.exitCode = 1;
}

main();
