import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const serverDir = join(dist, 'server');
const verbose = process.argv.includes('--verbose');

const {
  render,
  renderHead,
  renderTitle,
  renderPayloadScript,
  pages,
  headOnlyPages,
  shopConfig,
  isProd,
  ENABLED_LANGUAGES,
  localizedSiblings,
} = await import(join(serverDir, 'entry-server.js'));

/** Strips the shell's indentation: every run of whitespace sitting entirely
 * between two tags collapses away. A gap holding anything but whitespace does
 * not match, so text nodes keep their spacing.
 *
 * `<script>` and `<style>` bodies are split out and passed through untouched.
 * index.html carries an inline theme bootstrap whose `try {} catch {}` relies
 * on newlines for automatic semicolon insertion, and a `>` in a comparison
 * there could otherwise pair with a later `<`.
 *
 * Deliberately applied to the static shell ONLY, before anything is injected
 * into it. React's SSR output must never go through here: it carries hydration
 * markers (`<!-- -->`, `<!--$-->`, `<!--/$-->` — 26 of them on the home page)
 * and whitespace-significant text nodes, and rewriting either makes the
 * client's first render disagree with the server's markup. React emits its
 * output unindented on one line already, so there is nothing to win there.
 */
function minifyShell(html) {
  return html
    .split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/i)
    .map((chunk, index) => (index % 2 === 1 ? chunk : chunk.replace(/>\s*\n\s*</g, '><')))
    .join('');
}

const rawTemplate = readFileSync(join(dist, 'index.html'), 'utf8');
if (!rawTemplate.includes('<!--app-html-->') || !rawTemplate.includes('<!--app-head-->')) {
  throw new Error('dist/index.html is missing the <!--app-head--> / <!--app-html--> placeholders');
}
const template = minifyShell(rawTemplate);
// The placeholders are comments, which minifyShell never removes. Asserted
// anyway: losing one would silently ship a page with no head or no app markup.
if (!template.includes('<!--app-html-->') || !template.includes('<!--app-head-->')) {
  throw new Error('minifyShell dropped the <!--app-head--> / <!--app-html--> placeholders');
}

/** Paths that exist only for a signed-in or mid-checkout visitor. None of
 * them has prerendered markup, so the SPA-fallback rewrite serves the home
 * page's HTML under each — indexable duplicates of the home page, under
 * URLs no search visitor should ever land on. Kept out of robots.txt's
 * crawl and never listed in the sitemap. */
const PRIVATE_PATHS = [
  '/account',
  '/cart',
  '/checkout',
  '/orders',
  '/login',
  '/register',
  '/forgot-password',
];

function writePage(page) {
  // Callback form so '$' sequences in the markup can't act as replacement patterns.
  const html = template
    .replace(/<html lang="[^"]*">/, () => `<html lang="${page.lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, () => renderTitle(page))
    .replace('<!--app-head-->', () => renderHead(page))
    .replace('<!--app-html-->', () => render(page))
    .replace('</body>', () => `${renderPayloadScript(page)}</body>`);
  const target = join(dist, page.file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** A sitemap entry per page. `pages` (this function's only caller) only ever
 * holds the static marketing/legal paths — product URLs live in a separate,
 * backend-hosted sitemap generated from the database (see the comment further
 * down), because this build has no catalogue access by design. Every path
 * here really does have one URL per enabled language, so `localizedSiblings`
 * is always meaningful. */
function sitemapEntry(page, fallbackLastmod) {
  const loc = `${shopConfig.siteUrl}${page.path === '/' ? '/' : page.path}`;
  const lines = [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    `    <lastmod>${page.lastmod ?? fallbackLastmod}</lastmod>`,
  ];
  if (page.changefreq) lines.push(`    <changefreq>${page.changefreq}</changefreq>`);
  if (page.priority) lines.push(`    <priority>${page.priority}</priority>`);
  for (const { lang, href } of localizedSiblings(page.path)) {
    const altLoc = `${shopConfig.siteUrl}${href}`;
    lines.push(`    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(altLoc)}" />`);
  }
  lines.push('  </url>');
  return lines.join('\n');
}

// Builds are independent of the backend and database. The catalogue is
// loaded by the browser at runtime; product-specific HTML is not generated
// here because a frontend build must not depend on a live API.
const allPages = [...pages];

for (const page of allPages) {
  if (verbose) console.log(`[prerender] ${page.path} -> /${page.file}`);
  writePage(page);
}

/** A page whose head is indexable but whose body the client renders (see
 * entry-server.tsx's headOnlyPages): the page's own head over an empty root
 * and no payload, so main.tsx creates the root instead of hydrating. */
function writeHeadOnlyPage(page) {
  const html = template
    .replace(/<html lang="[^"]*">/, () => `<html lang="${page.lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, () => renderTitle(page))
    .replace('<!--app-head-->', () => renderHead(page))
    .replace('<!--app-html-->', () => '');
  const target = join(dist, page.file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

for (const page of headOnlyPages) {
  if (verbose) console.log(`[prerender] ${page.path} -> /${page.file} (head only)`);
  writeHeadOnlyPage(page);
}

/**
 * The shell the shop host's SSR relay fills in (public/ssr.php).
 *
 * `/xx/gallery` and every `/xx/creations/<slug>` are database-backed, so this
 * build cannot snapshot them: the catalogue changes daily and nobody
 * redeploys the front on a product edit. Before this existed they fell
 * through to the SPA-fallback rewrite, which serves the prerendered `/`
 * splash, and that page carries `noindex` by design. Google honours a noindex
 * found in the served HTML and skips rendering entirely, so the whole
 * catalogue was unindexable no matter what Seo.tsx did after hydration.
 *
 * This file is that same shell with the head, title and app markup left as
 * placeholders for the relay to substitute from pamsurin-back's /seo/*
 * routes. Two deliberate differences from a real prerendered page:
 *
 * - no payload script, so main.tsx takes its `createRoot` branch and discards
 *   the server markup instead of trying to hydrate against a tree it did not
 *   build. That branch already exists for every SPA-fallback route.
 * - no robots/canonical/hreflang of its own. The relay supplies them per URL,
 *   and a shell that shipped its own would contradict whatever it is filled
 *   with.
 */
const SSR_SHELL_FILE = 'ssr-shell.html';

function writeSsrShell(lang) {
  const html = template
    .replace(/<html lang="[^"]*">/, () => `<html lang="${lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, () => '<title><!--seo-title--></title>')
    .replace('<!--app-head-->', () => '<!--seo-head-->')
    .replace('<!--app-html-->', () => '<!--seo-body-->');
  for (const placeholder of ['<!--seo-title-->', '<!--seo-head-->', '<!--seo-body-->']) {
    if (!html.includes(placeholder)) {
      throw new Error(`prerender: ${lang}/${SSR_SHELL_FILE} lost the ${placeholder} placeholder`);
    }
  }
  const target = join(dist, lang, SSR_SHELL_FILE);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  if (verbose) console.log(`[prerender] ssr shell -> /${lang}/${SSR_SHELL_FILE}`);
}

for (const lang of ENABLED_LANGUAGES) {
  writeSsrShell(lang);
}

// A real sitemap (and robots.txt advertising it) only ever makes sense for
// the actual production site — dev/preprod builds get a hard `Disallow: /`
// instead and no sitemap file at all, so there's nothing pointing crawlers
// at a non-production copy of the site (see entry-server.tsx's isProd,
// which drives the matching per-page noindex/no-canonical).
if (isProd) {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
      [...allPages.filter((page) => page.path !== '/'), ...headOnlyPages]
        .map((page) => sitemapEntry(page, today))
        .join('\n') +
      `\n</urlset>\n`,
  );
  // Pose video watch pages (`/pose-colle`, `/pose-patch`) ride
  // PRERENDERED_PATHS → `pages` → this sitemap. Fail the build if they
  // ever drop out: Google video discovery needs them crawlable and listed.
  const sitemapPaths = new Set(
    [...allPages.filter((page) => page.path !== '/'), ...headOnlyPages].map((page) => page.path),
  );
  for (const lang of ENABLED_LANGUAGES) {
    for (const slug of ['pose-colle', 'pose-patch']) {
      const path = `/${lang}/${slug}`;
      if (!sitemapPaths.has(path)) {
        throw new Error(`prerender: production sitemap is missing ${path} (pose video watch page)`);
      }
    }
  }

  writeFileSync(
    join(dist, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      ...PRIVATE_PATHS.flatMap((path) => [
        `Disallow: ${path}`,
        ...ENABLED_LANGUAGES.map((lang) => `Disallow: /${lang}${path}`),
      ]),
      // Filter/search permutations of the gallery are the same catalogue
      // re-sorted — crawling them burns budget that should go to the
      // product pages, and every one canonicalises to /gallery anyway. Same
      // rule under every locale-prefixed /xx/gallery.
      'Disallow: /gallery?',
      ...ENABLED_LANGUAGES.map((lang) => `Disallow: /${lang}/gallery?`),
      // Carve-out for the share button's own /gallery?product=<uid> deep
      // link (productGalleryDeepLinkPath) — the more specific Allow wins
      // over the Disallow above per the robots.txt longest-match rule.
      // Matters for a bot like Twitterbot, which respects robots.txt before
      // unfurling a link; see public/.htaccess's own bot-UA redirect and
      // pamsurin-back's /gallery/set/:uid/preview for what actually answers
      // that fetch. Unprefixed Allow covers leftover legacy shares.
      'Allow: /gallery?product=',
      ...ENABLED_LANGUAGES.map((lang) => `Allow: /${lang}/gallery?product=`),
      // Same reasoning for the single-nail catalogue, whose only carve-out
      // is the share link below: /gallery-nail?composition=<id> is one
      // shopper's own draft set, not
      // a shareable page, and the filter permutations canonicalise to
      // /gallery-nail like the set ones do.
      'Disallow: /gallery-nail?',
      ...ENABLED_LANGUAGES.map((lang) => `Disallow: /${lang}/gallery-nail?`),
      // Same carve-out as /gallery?product= above: a single nail's share
      // link (nailGalleryDeepLinkPath).
      'Allow: /gallery-nail?product=',
      ...ENABLED_LANGUAGES.map((lang) => `Allow: /${lang}/gallery-nail?product=`),
      // Pose video watch pages stay crawlable (Allow: /). They are never
      // under PRIVATE_PATHS; production sitemap.xml lists every locale.
      '',
      `Sitemap: ${shopConfig.siteUrl}/sitemap.xml`,
      // Product URLs remain live from the database, but the PHP relay
      // deployed at the shop apex keeps this public sitemap on the same host
      // as every URL it lists (see public/sitemap-products.php).
      `Sitemap: ${shopConfig.siteUrl}/sitemap-products.xml`,
      '',
    ].join('\n'),
  );
  // Nothing here is a secret — it points an assistant at the same pages a
  // crawler already gets, in the order a shopper would want them.
  writeFileSync(
    join(dist, 'llms.txt'),
    [
      `# ${shopConfig.shopName}`,
      '',
      `> ${shopConfig.siteUrl} — faux ongles (capsules press-on) peints et montés à la main en France, vendus en sets sur mesure.`,
      '',
      '## Catalogue',
      `- [Galerie complète](${shopConfig.siteUrl}/fr/gallery) : catalogue filtrable par occasion, forme et couleur.`,
      `- [Composer un set](${shopConfig.siteUrl}/fr/gallery-nail) : ongles à l'unité, pour composer son propre set.`,
      `- [Plan du site](${shopConfig.siteUrl}/fr/sitemap)`,
      `- [Sitemap des pages](${shopConfig.siteUrl}/sitemap.xml) : pages fixes de la boutique.`,
      `- [Sitemap des produits](${shopConfig.siteUrl}/sitemap-products.xml) : sets et ongles à l'unité visibles, mis à jour depuis le catalogue.`,
      '',
      '## Guides',
      `- [Guide des formes et longueurs](${shopConfig.siteUrl}/fr/capsules) : chaque forme et chaque longueur portées sur la main, longueurs en mm.`,
      `- [Guide des tailles](${shopConfig.siteUrl}/fr/sizes) : mesurer ses ongles, correspondances en mm.`,
      `- [Guide de pose](${shopConfig.siteUrl}/fr/pose) : préparation, pose et dépose des capsules.`,
      `- [Vidéo : pose à la colle](${shopConfig.siteUrl}/fr/pose-colle) : la pose complète en vidéo, méthode colle.`,
      `- [Vidéo : pose au patch](${shopConfig.siteUrl}/fr/pose-patch) : la pose complète en vidéo, méthode patch adhésif.`,
      '',
      '## Boutique',
      `- [À propos](${shopConfig.siteUrl}/fr/about)`,
      `- [Cadeau](${shopConfig.siteUrl}/fr/gift) : offrir un set, la destinataire choisit.`,
      `- [Contact](${shopConfig.siteUrl}/fr/contact) — ${shopConfig.contactEmail}`,
      `- [Conditions générales de vente](${shopConfig.siteUrl}/fr/sales-terms) : livraison, retours, garanties.`,
      '',
    ].join('\n'),
  );
} else {
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nDisallow: /\n`);
}

// The SSR bundle is build tooling, not something to deploy.
rmSync(serverDir, { recursive: true, force: true });

console.log(
  `[prerender] ${pages.length} static pages + ${headOnlyPages.length} head-only pages` +
    `${isProd ? ' + sitemap.xml + robots.txt + llms.txt' : ' + robots.txt (Disallow: / — non-prod build)'}` +
    ` for ${shopConfig.siteUrl}`,
);
