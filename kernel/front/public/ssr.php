<?php
declare(strict_types=1);

// Server-side rendering relay for the two catalogue surfaces this build
// cannot prerender: /<lang>/gallery and /<lang>/creations/<slug>.
//
// Why it exists. The catalogue lives in the database and changes daily, so
// scripts/prerender.mjs deliberately snapshots neither. Both therefore fell
// through to the SPA-fallback rewrite, which serves the prerendered `/`
// splash — and that page ships `<meta name="robots" content="noindex">` by
// design. Google honours a noindex found in the served HTML and skips
// rendering the page entirely, so the JS that would have replaced it never
// ran: measured on production, all 497 product URLs were unindexable.
//
// This file reads the placeholder shell written beside it by prerender.mjs,
// fills the title/head/body from kernel/back's /seo/* routes and serves the
// result from the shop origin, so the canonical URL and the crawlable markup
// stay on shop.example. A redirect to the API host could not do that.
//
// The build substitutes the endpoint below for the matching environment; it
// is not user input, and every request parameter is validated against a fixed
// pattern before it reaches a URL, so this relay cannot be turned into a
// general-purpose proxy.
const API_SSR_BASE = '__API_SSR_BASE__';
const DEFAULT_CACHE_TTL = '__SSR_CACHE_TTL__';

const SHELL_FILE = 'ssr-shell.html';
const LANGS = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'];

function durationSeconds($value)
{
    if (!is_string($value) || preg_match('/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i', $value, $matches) !== 1) {
        return null;
    }
    $factors = ['ms' => 0.001, 's' => 1, 'm' => 60, 'h' => 3600, 'd' => 86400];
    $seconds = (float) $matches[1] * $factors[strtolower($matches[2])];
    return floor($seconds) === $seconds && $seconds >= 60 && $seconds <= 604800 ? (int) $seconds : null;
}

function cacheTtlSeconds()
{
    $value = getenv('SSR_RELAY_CACHE_TTL');
    if ($value === false && isset($_SERVER['SSR_RELAY_CACHE_TTL'])) {
        $value = $_SERVER['SSR_RELAY_CACHE_TTL'];
    }
    return durationSeconds($value) ?? durationSeconds(DEFAULT_CACHE_TTL) ?? 300;
}

function shellFor($lang)
{
    $path = __DIR__ . DIRECTORY_SEPARATOR . $lang . DIRECTORY_SEPARATOR . SHELL_FILE;
    $shell = @file_get_contents($path);
    return is_string($shell) && str_contains($shell, '<!--seo-body-->') ? $shell : null;
}

function sendHtml($body, $status, $maxAge)
{
    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    header($maxAge > 0 ? 'Cache-Control: public, max-age=' . $maxAge : 'Cache-Control: no-store');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo $body;
    }
    exit;
}

// No cached copy and no API: 503 is the only honest answer. A thin 200 would
// invite Google to index an empty page, and a 404 would drop a URL that still
// exists.
function unavailable()
{
    http_response_code(503);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store');
    header('Retry-After: 120');
    echo "Temporarily unavailable.\n";
    exit;
}

/** The SPA shell with an empty, explicitly non-indexable head, under the
 * status the API reported. react-router then renders its own 404 page. */
function notFound($shell)
{
    if ($shell === null) {
        http_response_code(404);
        header('Cache-Control: no-store');
        exit;
    }
    $body = str_replace(
        ['<!--seo-title-->', '<!--seo-head-->', '<!--seo-body-->'],
        ['', '<meta name="robots" content="noindex" />', ''],
        $shell
    );
    sendHtml($body, 404, 0);
}

function fetchDocument($url)
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $request = curl_init($url);
    if ($request === false) {
        return null;
    }
    curl_setopt_array($request, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            // An access discriminator, not a secret: every byte returned is
            // public at this same shop URL. It keeps a second crawlable copy
            // of the catalogue off the API origin, which would otherwise
            // compete for the canonical.
            'X-Tuucho-Ssr-Relay: 1',
        ],
    ]);
    $body = curl_exec($request);
    $status = (int) curl_getinfo($request, CURLINFO_HTTP_CODE);
    curl_close($request);
    if ($status === 404) {
        return 404;
    }
    if (!is_string($body) || $status !== 200) {
        return null;
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return null;
    }
    foreach (['title', 'head', 'body'] as $key) {
        if (!isset($decoded[$key]) || !is_string($decoded[$key])) {
            return null;
        }
    }
    return $decoded;
}

function renderInto($shell, array $document)
{
    return str_replace(
        ['<!--seo-title-->', '<!--seo-head-->', '<!--seo-body-->'],
        [htmlspecialchars($document['title'], ENT_QUOTES, 'UTF-8'), $document['head'], $document['body']],
        $shell
    );
}

function cacheFilePath($key)
{
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'tuucho-ssr-' . hash('sha256', __DIR__);
    if (!is_dir($directory) && !@mkdir($directory, 0700, true)) {
        return null;
    }
    @chmod($directory, 0700);
    return is_dir($directory) && is_writable($directory)
        ? $directory . DIRECTORY_SEPARATOR . hash('sha256', $key) . '.html'
        : null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Cache-Control: no-store');
    exit;
}

$kind = $_GET['ssr'] ?? '';
$lang = $_GET['lang'] ?? '';
$uid = $_GET['uid'] ?? '';
if (
    !is_string($kind) || !is_string($lang) || !is_string($uid)
    || !in_array($lang, LANGS, true)
) {
    http_response_code(404);
    header('Cache-Control: no-store');
    exit;
}

if ($kind === 'gallery') {
    $endpoint = API_SSR_BASE . '/seo/gallery?lang=' . rawurlencode($lang);
    $cacheKey = 'gallery|' . $lang;
} elseif ($kind === 'product' && preg_match('/^[A-Za-z]{2}-[A-Za-z]{2}-[0-9]{3}$/', $uid) === 1) {
    $endpoint = API_SSR_BASE . '/seo/product/' . rawurlencode(strtolower($uid)) . '?lang=' . rawurlencode($lang);
    $cacheKey = 'product|' . $lang . '|' . strtolower($uid);
} else {
    http_response_code(404);
    header('Cache-Control: no-store');
    exit;
}

$shell = shellFor($lang);
if ($shell === null) {
    unavailable();
}

$ttl = cacheTtlSeconds();
$cachePath = cacheFilePath($cacheKey);
$cached = null;
$handle = null;
if ($cachePath !== null) {
    $handle = @fopen($cachePath, 'c+');
    if ($handle !== false && flock($handle, LOCK_EX)) {
        rewind($handle);
        $stored = stream_get_contents($handle);
        $stats = fstat($handle);
        if (is_string($stored) && $stored !== '' && is_array($stats)) {
            $cached = $stored;
            if (time() - (int) $stats['mtime'] < $ttl) {
                flock($handle, LOCK_UN);
                fclose($handle);
                sendHtml($stored, 200, $ttl);
            }
        }
    } else {
        $handle = null;
    }
}

$document = fetchDocument($endpoint);

if ($document === 404) {
    if ($handle !== null) {
        // The set is gone; its cached page must go with it.
        ftruncate($handle, 0);
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    notFound($shell);
}

if (is_array($document)) {
    $html = renderInto($shell, $document);
    if ($handle !== null) {
        if (ftruncate($handle, 0) && rewind($handle)) {
            fwrite($handle, $html);
            fflush($handle);
        }
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    sendHtml($html, 200, $ttl);
}

if ($handle !== null) {
    flock($handle, LOCK_UN);
    fclose($handle);
}
// A short outage must not erase a page Google already indexed: serve the last
// good copy, cacheable for only a minute while the next request retries.
if ($cached !== null) {
    sendHtml($cached, 200, 60);
}

// The gallery has a prerendered snapshot of its own, so an outage there can
// degrade to exactly what this URL served before the relay existed: the SPA
// shell, which still renders the grid client-side. Thin for a crawler, but it
// is a real 200 for a shopper and it carries the correct indexable head.
// A product page has no snapshot, so it has nothing to fall back to.
if ($kind === 'gallery') {
    $snapshot = @file_get_contents(__DIR__ . DIRECTORY_SEPARATOR . $lang . DIRECTORY_SEPARATOR . $kind . '.html');
    if (is_string($snapshot) && $snapshot !== '') {
        sendHtml($snapshot, 200, 60);
    }
}

unavailable();
