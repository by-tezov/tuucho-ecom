<?php
declare(strict_types=1);

// This file is published at the shop's document root by version-dist.mjs.
// The build substitutes the endpoint for the matching environment; it is not
// user input, so this relay cannot be turned into a general-purpose proxy.
const API_SITEMAP_URL = '__API_SITEMAP_URL__';
const DEFAULT_CACHE_TTL = '__SITEMAP_CACHE_TTL__';

function unavailable()
{
    http_response_code(502);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store');
    echo 'Product sitemap temporarily unavailable.\n';
    exit;
}

function notFound()
{
    http_response_code(404);
    header('Cache-Control: no-store');
    exit;
}

function durationSeconds($value)
{
    if (!is_string($value) || preg_match('/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i', $value, $matches) !== 1) {
        return null;
    }
    $factors = ['ms' => 0.001, 's' => 1, 'm' => 60, 'h' => 3600, 'd' => 86400];
    $unit = strtolower($matches[2]);
    $seconds = (float) $matches[1] * $factors[$unit];
    return floor($seconds) === $seconds && $seconds >= 60 && $seconds <= 604800
        ? (int) $seconds
        : null;
}

function cacheTtlSeconds()
{
    $value = getenv('SITEMAP_RELAY_CACHE_TTL');
    if ($value === false && isset($_SERVER['SITEMAP_RELAY_CACHE_TTL'])) {
        $value = $_SERVER['SITEMAP_RELAY_CACHE_TTL'];
    }
    return durationSeconds($value) ?? durationSeconds(DEFAULT_CACHE_TTL);
}

function sendSitemap($body, $maxAge)
{
    header('Content-Type: application/xml; charset=UTF-8');
    header('Cache-Control: public, max-age=' . $maxAge);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo $body;
    }
    exit;
}

function fetchSitemap()
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $request = curl_init(API_SITEMAP_URL);
    if ($request === false) {
        return null;
    }
    curl_setopt_array($request, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => [
            'Accept: application/xml',
            // This is an access discriminator, not a secret: the sitemap's
            // content is public at the shop URL.
            'X-Lumen-Sitemap-Relay: 1',
        ],
    ]);
    $body = curl_exec($request);
    $status = (int) curl_getinfo($request, CURLINFO_HTTP_CODE);
    curl_close($request);
    return is_string($body) && $status === 200 && str_starts_with(ltrim($body), '<?xml') ? $body : null;
}

function cacheFilePath()
{
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'pamsurin-sitemap-' . hash('sha256', __DIR__);
    if (!is_dir($directory) && !@mkdir($directory, 0700, true)) {
        return null;
    }
    @chmod($directory, 0700);
    return is_dir($directory) && is_writable($directory)
        ? $directory . DIRECTORY_SEPARATOR . 'products.xml'
        : null;
}

function readCachedSitemap($handle, $ttl)
{
    if (!rewind($handle)) {
        return null;
    }
    $body = stream_get_contents($handle);
    $stats = fstat($handle);
    if (!is_string($body) || !is_array($stats) || !isset($stats['mtime']) || !str_starts_with(ltrim($body), '<?xml')) {
        return null;
    }
    return ['body' => $body, 'fresh' => time() - (int) $stats['mtime'] < $ttl];
}

function writeCachedSitemap($handle, $body)
{
    if (!ftruncate($handle, 0) || !rewind($handle)) {
        return false;
    }
    $offset = 0;
    $length = strlen($body);
    while ($offset < $length) {
        $written = fwrite($handle, substr($body, $offset));
        if ($written === false || $written === 0) {
            return false;
        }
        $offset += $written;
    }
    return fflush($handle);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (($method !== 'GET' && $method !== 'HEAD') || ($_SERVER['QUERY_STRING'] ?? '') !== '') {
    notFound();
}

$ttl = cacheTtlSeconds();
$cachePath = cacheFilePath();
if ($cachePath !== null) {
    $cache = @fopen($cachePath, 'c+');
    if ($cache !== false && flock($cache, LOCK_EX)) {
        $cached = readCachedSitemap($cache, $ttl);
        if ($cached !== null && $cached['fresh']) {
            flock($cache, LOCK_UN);
            fclose($cache);
            sendSitemap($cached['body'], $ttl);
        }

        $fresh = fetchSitemap();
        if ($fresh !== null) {
            writeCachedSitemap($cache, $fresh);
            flock($cache, LOCK_UN);
            fclose($cache);
            sendSitemap($fresh, $ttl);
        }

        flock($cache, LOCK_UN);
        fclose($cache);
        // A short outage must not erase the last good sitemap. It remains
        // cacheable for only a minute while the next request retries the API.
        if ($cached !== null) {
            sendSitemap($cached['body'], 60);
        }
    }
}

$body = fetchSitemap();
if ($body !== null) {
    sendSitemap($body, $ttl);
}
unavailable();
