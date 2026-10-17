import { Command } from 'commander';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version: pkgVersion } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// build.mjs's --patch-version forwards here as an env var (not a CLI flag —
// this script has no argv parsing of its own) so the version folder/.htaccess
// can target an already-live version without ever writing package.json.
const patchVersion = process.env.PATCH_VERSION ?? '';
if (patchVersion && !/^\d+\.\d+\.\d+$/.test(patchVersion)) {
  throw new Error(`version-dist: PATCH_VERSION must be X.Y.Z (got "${patchVersion}")`);
}
const version = patchVersion || pkgVersion;
const versionDir = `v${version}`;
const currentDir = 'current';

const program = new Command();
program
  .name('version-dist')
  .description('Move dist/ into a versioned folder and generate per-deploy .htaccess files.')
  .option('--preprod', 'target preprod')
  .option('--prod', 'target production')
  .option('--local', 'add a local-only index.html redirect for opening dist/ directly')
  .parse();

const opts = program.opts();
const selected = [];
if (opts.preprod) selected.push('preprod');
if (opts.prod) selected.push('prod');
if (selected.length !== 1) {
  throw new Error('version-dist: exactly one of --preprod or --prod is required');
}
const mode = selected[0];
const local = Boolean(opts.local);

/** prod is the apex domain — its real DocumentRoot is public_html itself,
 * unlike preprod's own subdomain docroot (public_html/preprod). Nesting
 * prod's own versioned files one level down, at public_html/prod/, keeps
 * its per-deploy .htaccess swap scoped to its own folder exactly like
 * preprod's already is, instead of sitting at public_html's own root where
 * it cascades into every sibling subdomain folder nested under it — Apache
 * merges .htaccess from every parent directory in the filesystem path, not
 * just the docroot of whichever vhost is actually being served, so an
 * unscoped rule at public_html's root previously broke preprod/preprod-api
 * the moment prod was deployed there (see README's "Deploying"). Empty for
 * every other mode: their docroot already *is* where these files land,
 * nothing to nest under. */
const mountPrefix = mode === 'prod' ? 'prod/' : '';

/** Reads a build-only setting from the target public env file. Vite loads that
 * file in its own process, so it is deliberately read here rather than from
 * process.env. */
function targetPublicEnv(name) {
  const envPath = join(root, '.env', mode, '.public.env');
  const match = new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm').exec(readFileSync(envPath, 'utf8'));
  if (!match) throw new Error(`version-dist: ${name} missing from .env/${mode}/.public.env`);
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

/** This environment's API origin, for the CSP connect-src placeholder in
 * public/.htaccess. Deliberately one host and not a shared list — a preprod
 * page must not even be allowed to reach the production API. */
function apiOrigin() {
  const value = targetPublicEnv('VITE_API_BASE_URL');
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(
      `version-dist: VITE_API_BASE_URL in .env/${mode}/.public.env is not a valid URL ("${value}")`,
    );
  }
}

/** Converts the project's normal duration notation (e.g. 12h) to seconds
 * for the HTTP cache header while preserving the readable env value for PHP. */
function relayCacheTtlConfig(name) {
  const value = targetPublicEnv(name);
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i.exec(value);
  const unitSeconds = { ms: 0.001, s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 };
  if (!match || !(match[2].toLowerCase() in unitSeconds)) {
    throw new Error(`version-dist: ${name} must be a duration such as "12h" (got "${value}")`);
  }
  const seconds = Number(match[1]) * unitSeconds[match[2].toLowerCase()];
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 7 * 24 * 60 * 60) {
    throw new Error(`version-dist: ${name} must be between 60s and 7d (got "${value}")`);
  }
  return { value, seconds };
}

function sitemapRelayCacheTtlConfig() {
  return relayCacheTtlConfig('SITEMAP_RELAY_CACHE_TTL');
}

/** The SSR relay's own file cache. Shorter than the sitemap's by design: this
 * one holds a rendered product page, so a price or stock edit is invisible
 * until it expires. */
function ssrRelayCacheTtlConfig() {
  return relayCacheTtlConfig('SSR_RELAY_CACHE_TTL');
}

/** Writes a gzipped sibling next to every JS/CSS file, which the version
 * .htaccess then serves under the original URL. This host gives us no other
 * option: its edge strips Accept-Encoding before Apache sees the request, so
 * mod_deflate never fires and the whole bundle used to go out uncompressed —
 * ~750 KB of JS/CSS on a first visit, about 70% of it pure transfer waste,
 * paid on every cold load and worst on a phone. See public/.htaccess. */
function precompress(dir) {
  const totals = { files: 0, raw: 0, gz: 0 };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = precompress(path);
      totals.files += nested.files;
      totals.raw += nested.raw;
      totals.gz += nested.gz;
      continue;
    }
    if (!/\.(js|css)$/.test(entry.name)) continue;
    const source = readFileSync(path);
    const compressed = gzipSync(source, { level: 9 });
    writeFileSync(`${path}.gz`, compressed);
    totals.files += 1;
    totals.raw += source.length;
    totals.gz += compressed.length;
  }
  return totals;
}

function main() {
  const versionPath = join(dist, versionDir);
  if (existsSync(versionPath)) {
    throw new Error(`dist/${versionDir} already exists — bump "version" in package.json before building.`);
  }
  mkdirSync(versionPath);

  for (const entry of readdirSync(dist)) {
    if (entry === versionDir) continue;
    renameSync(join(dist, entry), join(versionPath, entry));
  }

  // Apple Pay domain association must live at the shop apex
  // (/.well-known/apple-developer-merchantid-domain-association), sibling of
  // current/ and media/ — never inside a version folder. Vite copies
  // public/.well-known into the build; hoist it back to dist/ so deploy
  // lands it next to dist/.htaccess. README.md in that folder is docs only.
  const versionWellKnown = join(versionPath, '.well-known');
  if (existsSync(versionWellKnown)) {
    const distWellKnown = join(dist, '.well-known');
    if (existsSync(distWellKnown)) {
      throw new Error('version-dist: dist/.well-known already exists before hoist');
    }
    renameSync(versionWellKnown, distWellKnown);
    console.log(
      '[version-dist] hoisted .well-known/ to dist/ (Apple Pay domain association; upload alongside .htaccess).',
    );
  }

  // The live product sitemap belongs only to production. Its PHP template is
  // copied from public/ by Vite, then the production build fills in its API
  // origin and hoists it to the stable document root. Preprod removes the
  // template altogether: that environment must never expose a sitemap.
  const versionProductSitemapRelay = join(versionPath, 'sitemap-products.php');
  if (!existsSync(versionProductSitemapRelay)) {
    throw new Error('version-dist: public/sitemap-products.php is missing from the Vite build');
  }
  if (mode === 'prod') {
    const productSitemapRelay = join(dist, 'sitemap-products.php');
    if (existsSync(productSitemapRelay)) {
      throw new Error('version-dist: dist/sitemap-products.php already exists before hoist');
    }
    renameSync(versionProductSitemapRelay, productSitemapRelay);
    const productSitemapRelaySource = readFileSync(productSitemapRelay, 'utf8');
    if (
      !productSitemapRelaySource.includes('__API_SITEMAP_URL__') ||
      !productSitemapRelaySource.includes('__SITEMAP_CACHE_TTL__')
    ) {
      throw new Error(
        'version-dist: sitemap-products.php no longer contains an API URL or cache-TTL placeholder',
      );
    }
    const sitemapRelayCacheTtl = sitemapRelayCacheTtlConfig();
    writeFileSync(
      productSitemapRelay,
      productSitemapRelaySource
        .replaceAll('__API_SITEMAP_URL__', `${apiOrigin()}/sitemap-products.xml`)
        .replaceAll('__SITEMAP_CACHE_TTL__', sitemapRelayCacheTtl.value),
    );
    console.log('[version-dist] hoisted sitemap-products.php to dist/ (dynamic product sitemap relay).');
  } else {
    rmSync(versionProductSitemapRelay);
  }

  // The SSR relay stays inside the version folder, unlike the sitemap relay
  // above: it reads `<lang>/ssr-shell.html` from its own directory, so it has
  // to live beside the build that produced those shells. Prod only. The head
  // it serves declares `index, follow`, which must never be true of preprod,
  // and public/.htaccess gates its rewrites on the prod host for the same
  // reason.
  const versionSsrRelay = join(versionPath, 'ssr.php');
  if (!existsSync(versionSsrRelay)) {
    throw new Error('version-dist: public/ssr.php is missing from the Vite build');
  }
  if (mode === 'prod') {
    const ssrRelaySource = readFileSync(versionSsrRelay, 'utf8');
    if (!ssrRelaySource.includes('__API_SSR_BASE__') || !ssrRelaySource.includes('__SSR_CACHE_TTL__')) {
      throw new Error('version-dist: ssr.php no longer contains an API base or cache-TTL placeholder');
    }
    writeFileSync(
      versionSsrRelay,
      ssrRelaySource
        .replaceAll('__API_SSR_BASE__', apiOrigin())
        .replaceAll('__SSR_CACHE_TTL__', ssrRelayCacheTtlConfig().value),
    );
    console.log('[version-dist] filled ssr.php (server-rendered gallery and product pages).');
  } else {
    rmSync(versionSsrRelay);
  }

  // The SPA-routing .htaccess (copied verbatim from public/.htaccess) moved in
  // with everything else. Its fallback rule targeted "/index.html" assuming it
  // lived at the site root — scope it to this version folder instead (and, for
  // prod, to the /prod/ mount point it's nested under — see mountPrefix above).
  // It also carries the CSP, whose connect-src names this environment's API
  // host through the __API_ORIGIN__ placeholder — fill that in here.
  const versionHtaccessPath = join(versionPath, '.htaccess');
  const sourceHtaccess = readFileSync(versionHtaccessPath, 'utf8');
  if (!sourceHtaccess.includes('__API_ORIGIN__')) {
    throw new Error(
      'version-dist: public/.htaccess no longer contains the __API_ORIGIN__ CSP placeholder — the built CSP would name no API host, or a hardcoded one shared with the other environment.',
    );
  }
  const versionHtaccess = sourceHtaccess
    .replace('RewriteBase /', `RewriteBase /${mountPrefix}${currentDir}/`)
    .replace('RewriteRule . /index.html [L]', 'RewriteRule . index.html [L]')
    .replaceAll('__API_ORIGIN__', apiOrigin());
  writeFileSync(versionHtaccessPath, versionHtaccess);

  const compressed = precompress(versionPath);
  const saved = compressed.raw - compressed.gz;
  const percent = compressed.raw === 0 ? 0 : Math.round((saved / compressed.raw) * 100);
  console.log(
    `[version-dist] pre-compressed ${compressed.files} JS/CSS files: ` +
      `${Math.round(compressed.raw / 1024)} KB -> ${Math.round(compressed.gz / 1024)} KB (-${percent}%).`,
  );

  // Per-deploy .htaccess: transparently routes every request into the active
  // version folder. This is the only file that needs to change (and the only
  // one FileZilla needs to re-upload) to cut this environment over to a new
  // build — the versioned folder can be uploaded ahead of time with zero
  // effect on the live site. The REQUEST_URI guard stops Apache's internal
  // re-processing pass from prefixing an already-versioned path a second
  // time (e.g. /v0.9.0/assets/foo.js -> /v0.9.0/v0.9.0/assets/foo.js).
  // A second guard excludes /media/ — pamsurin-back writes uploaded photos
  // straight into this docroot's media/ folder (MEDIA_DIR, sibling to every
  // version folder, never inside one — see its own README) so Apache can
  // serve them as static files without proxying through Node; without this
  // exclusion every photo URL would get swallowed into the SPA fallback and
  // serve index.html instead of the image.
  //
  // /.well-known/ is the same shape: Apple Pay's domain association file
  // must answer at the apex (Stripe + Apple crawl it without auth), so it
  // stays a sibling of media/ and is never rewritten into current/.
  //
  // For prod (mountPrefix set), this file uploads to public_html/prod/
  // .htaccess — NOT public_html/.htaccess itself. See dist/root.htaccess
  // below for the file that actually goes there.
  const htaccessLines = [
    '<IfModule mod_rewrite.c>',
    '  RewriteEngine On',
    '  # Force HTTPS, before the version-folder rewrite below — a redirect',
    '  # issued from inside the version folder would leak the internal',
    `  # /${mountPrefix}${versionDir}/ path (see the canonical-host comment in`,
    '  # root.htaccess). The X-Forwarded-Proto guard is defensive against',
    '  # this host\'s TLS-terminating "fastestcache" edge (see public/',
    "  # .htaccess's compression note): without it, if that edge never sets",
    '  # the header, %{HTTPS} would read "off" forever and this would',
    '  # 301-loop every request.',
    '  RewriteCond %{HTTPS} off',
    '  RewriteCond %{HTTP:X-Forwarded-Proto} !=https',
    '  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]',
    '',
    mode === 'prod'
      ? '  # Keep the live product sitemap at this document root rather than rewriting it into the SPA release.'
      : '  # Preprod must not expose either sitemap, even when a crawler ignores robots.txt.',
    mode === 'prod'
      ? '  RewriteRule ^sitemap-products\\.xml$ /sitemap-products.php [END]'
      : '  RewriteRule ^sitemap(?:-products)?\\.xml$ - [R=404,END]',
    '',
    `  RewriteCond %{REQUEST_URI} !^/${mountPrefix}${currentDir}/`,
    `  RewriteCond %{REQUEST_URI} !^/${mountPrefix}media/`,
    `  RewriteCond %{REQUEST_URI} !^/${mountPrefix}\\.well-known/`,
    `  RewriteRule ^(.*)$ /${mountPrefix}${currentDir}/$1 [L]`,
    '</IfModule>',
    '',
    '# Product photos. media/ is a sibling of the version folders, never',
    '# inside one, so the caching rules in the version .htaccess have never',
    '# applied to it — every photo went out with no Cache-Control and no',
    '# ETag at all, and phones re-downloaded every cart thumbnail on each',
    '# navigation. This file is the nearest parent both folders share, so',
    '# the header has to be set here. Photos do get re-uploaded, so a month',
    "# rather than the assets' immutable year.",
    '<IfModule mod_headers.c>',
    '  <FilesMatch "\\.(jpg|jpeg|png|webp|avif)$">',
    '    Header set Cache-Control "public, max-age=2592000"',
    '  </FilesMatch>',
    '</IfModule>',
    '',
  ].filter((line) => line !== null);

  writeFileSync(join(dist, '.htaccess'), htaccessLines.join('\n'));

  // prod only: the one-time, stable file that belongs at public_html/
  // .htaccess itself (the apex domain's real docroot) — 301s www to the
  // apex, then routes apex traffic into /prod/, where the per-deploy
  // .htaccess above takes over. Never references the version number, so it
  // never needs re-uploading on a version bump (re-uploading it is harmless
  // if you do — the content is identical every build). Its content DID
  // change when the canonical-host redirect was added, so it needs
  // re-uploading once after that change. The HTTP_HOST guard is what makes it safe to
  // sit at public_html's root at all: without it this exact rule already
  // broke preprod/preprod-api once (see mountPrefix's own comment above).
  if (mountPrefix) {
    const sitemapRelayCacheTtl = sitemapRelayCacheTtlConfig();
    writeFileSync(
      join(dist, 'root.htaccess'),
      [
        '<IfModule mod_env.c>',
        `  SetEnv SITEMAP_RELAY_CACHE_TTL ${sitemapRelayCacheTtl.value}`,
        `  SetEnv SSR_RELAY_CACHE_TTL ${ssrRelayCacheTtlConfig().value}`,
        '</IfModule>',
        '',
        '<IfModule mod_rewrite.c>',
        '  RewriteEngine On',
        '  # Force HTTPS, before anything else — same rule dist/.htaccess',
        '  # carries for preprod (which has no apex file of its own to run',
        '  # this ahead of); see its comment for why the X-Forwarded-Proto',
        "  # guard is needed against this host's TLS-terminating edge.",
        '  RewriteCond %{HTTPS} off',
        '  RewriteCond %{HTTP:X-Forwarded-Proto} !=https',
        '  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]',
        '',
        '  # Canonical host, next: www.pamsurin.fr and pamsurin.fr both resolve',
        '  # here, so without this every page answers 200 at two addresses and',
        "  # the domain's authority is split between them. This has to run at",
        '  # the apex docroot, before the /prod/ mount rewrite below — a',
        '  # redirect issued from inside the version folder would expose the',
        '  # internal /prod/vX.Y.Z/ path. Product photos are served from this',
        "  # same host (pamsurin-back's URL_PUBLIC_MEDIA), so it keeps images",
        '  # on the indexed domain too.',
        '  RewriteCond %{HTTP_HOST} ^www\\.pamsurin\\.fr$ [NC]',
        '  RewriteRule ^(.*)$ https://pamsurin.fr/$1 [R=301,L]',
        '',
        '  # This PHP relay serves the database-backed product sitemap at the',
        '  # public apex. It must run before the general /prod/ mount rewrite.',
        '  RewriteCond %{HTTP_HOST} ^pamsurin\\.fr$ [NC]',
        '  RewriteRule ^sitemap-products\\.xml$ /sitemap-products.php [END]',
        '',
        '  RewriteCond %{HTTP_HOST} ^(www\\.)?pamsurin\\.fr$ [NC]',
        `  RewriteCond %{REQUEST_URI} !^/${mountPrefix}`,
        `  RewriteRule ^(.*)$ /${mountPrefix}$1 [L]`,
        '</IfModule>',
        '',
      ].join('\n'),
    );
  }

  // --local only: a convenience redirect for opening dist/ directly (e.g.
  // `npx serve dist`) — never part of a production dist/, never uploaded.
  if (local) {
    writeFileSync(
      join(dist, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="fr">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        `    <meta http-equiv="refresh" content="0; url=/${versionDir}/" />`,
        '    <title>Redirecting…</title>',
        '  </head>',
        '  <body>',
        `    <script>location.replace('/${versionDir}/');</script>`,
        '  </body>',
        '</html>',
        '',
      ].join('\n'),
    );
  }

  console.log(`[version-dist] dist/${versionDir}/ ready, dist/.htaccess now routes to it.`);
  if (existsSync(join(dist, '.well-known'))) {
    console.log(
      '[version-dist] dist/.well-known/ present — upload next to .htaccess (Apple Pay domain association).',
    );
  }
  if (mountPrefix) {
    console.log(
      `[version-dist] Upload dist/${versionDir}/ and dist/.htaccess into public_html/${mountPrefix} (not public_html itself).`,
    );
    console.log(
      '[version-dist] dist/root.htaccess goes to public_html/.htaccess — stable across version bumps, but re-upload it once now: it gained the forced-HTTPS redirect.',
    );
  } else {
    console.log(
      local
        ? `[version-dist] dist/ also has a local-only index.html redirect — do not upload it, only dist/${versionDir}/ and dist/.htaccess.`
        : `[version-dist] dist/ contains only ${versionDir}/ and .htaccess — ready to upload as-is.`,
    );
  }
}

main();
