import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { inspectConfig } from '../back/src/config/loadJsonConfig.ts';
import { resolveCssComposeSpecifier, viteResolveAlias } from './importAliases.ts';

/**
 * Plugin CSS lives outside the Vite root (`tuucho/plugins/<group>/<feature>/<id>/front`). A relative
 * `composes: … from '…'` is handed to postcss-modules as a non-absolute path
 * when resolution misses, and the dev server then throws
 * "The returned path from the fileResolve option must be absolute" — the
 * module never loads and the page stays blank. Absolute paths always pass.
 */
function absoluteCssModuleComposes(): Plugin {
  const composeFrom = /\/\*[\s\S]*?\*\/|composes:\s*([^;]*?)\s+from\s+(['"])([^'"]+)\2/g;
  return {
    name: 'tuucho-absolute-css-composes',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (!file.endsWith('.module.css') || !code.includes('composes:')) return null;
      let changed = false;
      const next = code.replace(composeFrom, (match, symbols: string, quote: string, spec: string) => {
        if (match.startsWith('/*')) return match;
        const abs = resolveCssComposeSpecifier(file, spec);
        if (!abs) return match;
        changed = true;
        return `composes: ${symbols} from ${quote}${abs}${quote}`;
      });
      return changed ? next : null;
    },
  };
}

/**
 * postcss-modules prepends composed CSS with `root.prepend(string)`, which
 * parses those nodes without `from`. Vite's URL rewriter then warns on every
 * `npm run dev` even though the declarations are class aliases, not assets.
 * Stamp the file already on the root so the check sees a real path.
 */
function stampPostcssFrom() {
  return {
    postcssPlugin: 'tuucho-stamp-postcss-from',
    OnceExit(root: {
      source?: { input: { file?: string } };
      walkDecls: (cb: (decl: { source?: { input?: { file?: string } } }) => void) => void;
    }) {
      const input = root.source?.input;
      if (!input?.file) return;
      root.walkDecls((decl) => {
        if (!decl.source?.input?.file) decl.source = { input };
      });
    },
  };
}

function loadKernelHttp(target: string): {
  apiBaseUrl?: string;
  frontendBaseUrl?: string;
  enabledLanguages?: string;
} {
  const status = inspectConfig(resolve(process.cwd(), '../../../tuucho-config'), target);
  if (!status.ok || !status.merged) {
    throw new Error(status.errors.join('\n') || `kernel config for ${target} failed`);
  }
  const http = (status.merged.http ?? {}) as Record<string, unknown>;
  const i18n = (status.merged.i18n ?? {}) as Record<string, unknown>;
  const loaded: { apiBaseUrl?: string; frontendBaseUrl?: string; enabledLanguages?: string } = {};
  if (typeof http.apiBaseUrl === 'string') loaded.apiBaseUrl = http.apiBaseUrl;
  if (typeof http.frontendBaseUrl === 'string') loaded.frontendBaseUrl = http.frontendBaseUrl;
  if (Array.isArray(i18n.enabled) && i18n.enabled.every((entry) => typeof entry === 'string')) {
    loaded.enabledLanguages = i18n.enabled.map((entry) => entry.trim().toLowerCase()).filter(Boolean).join(',');
  } else if (typeof i18n.enabled === 'string' && i18n.enabled.trim()) {
    loaded.enabledLanguages = i18n.enabled
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .join(',');
  }
  return loaded;
}

const rootPkg = JSON.parse(readFileSync(resolve(process.cwd(), '../../../package.json'), 'utf-8')) as {
  version?: unknown;
};
if (typeof rootPkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(rootPkg.version)) {
  throw new Error('Root package.json must contain a MAJOR.MINOR.PATCH version');
}
const appVersion = rootPkg.version;

export default defineConfig(({ mode }) => {
  // Origins come from kernel JSON (`http.apiBaseUrl` / `http.frontendBaseUrl`).
  // Shop copy and plugin keys come from `/storefront/bootstrap`.
  const targetFileSuffix = process.env.APP_TARGET || (mode === 'development' ? 'dev' : mode);
  const kernelHttp = loadKernelHttp(targetFileSuffix);
  if (kernelHttp.apiBaseUrl) process.env.VITE_API_BASE_URL = kernelHttp.apiBaseUrl;
  if (kernelHttp.frontendBaseUrl) process.env.VITE_SITE_URL = kernelHttp.frontendBaseUrl;
  // Build list matches config `i18n.enabled` so shops can enable codes that
  // are not hard-coded in the kernel (locale plugins supply catalogs).
  if (kernelHttp.enabledLanguages) process.env.VITE_ENABLED_LANGUAGES = kernelHttp.enabledLanguages;
  const testApi = process.env.TUUCHO_TEST_API_BASE?.trim();
  const testSite = process.env.TUUCHO_TEST_SITE_URL?.trim() || process.env.TUUCHO_TEST_FRONTEND_BASE?.trim();
  if (testApi) process.env.VITE_API_BASE_URL = testApi.replace(/\/$/, '');
  if (testSite) process.env.VITE_SITE_URL = testSite.replace(/\/$/, '');

  return {
    base: '/',
    resolve: { alias: viteResolveAlias },
    plugins: [absoluteCssModuleComposes(), react()],
    css: {
      postcss: {
        plugins: [stampPostcssFrom()],
      },
    },
    server: {
      watch: {
        ignored: ['**/.idea/**', '**/.git/**', '**/node_modules/**', '**/dist/**', '**/coverage/**'],
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_TARGET__: JSON.stringify(targetFileSuffix),
    },
    build: {
      // MUST stay set explicitly. Vite's default target is
      // 'baseline-widely-available' (Chrome/Edge 107, Firefox 104, Safari 16),
      // but that default does not reach the CSS minifier: left unset, the
      // minifier rewrites every `@media (max-width: 1023px)` into Media
      // Queries Level 4 range syntax, `@media (width<=1023px)`. Safari only
      // parses that from 16.4, so on iOS 16.0-16.3 all 92 of this site's
      // width media queries were dropped as parse errors at once — the
      // bottom tab bar and Retour links stayed `display:none`, the footer and
      // page bodies kept their desktop base layout, and only the hamburger
      // (which is the *unqueried* default) still looked right. Naming the
      // same browsers here makes the minifier actually honour them; verified
      // against the built CSS, which goes back to `(max-width:1023px)`.
      cssTarget: ['chrome107', 'edge107', 'firefox104', 'safari16'],
      // No manualChunks, deliberately. There used to be one here that sent
      // `@stripe/*` to its own chunk and everything else in node_modules to a
      // single `vendor`, so that a visitor landing on a product page would not
      // download the payment SDK. Good intent, but on this toolchain it did
      // the opposite of what it says, in two ways.
      //
      // First, `return 'vendor'` for everything else is a catch-all: it pins
      // each dependency to one chunk regardless of which routes can actually
      // reach it. Since React lives there, `vendor` is by definition
      // entry-critical — so libphonenumber-js and react-phone-number-input,
      // which only AddressFormModal and AccountPage import (both behind
      // lazy() in App.tsx), were dragged into first paint anyway.
      //
      // Second, naming a chunk is what makes a shared dependency land in it.
      // Adding a `phone` chunk moved React into *that* one, so the entry
      // statically imported it and the 205 kB of phone metadata stayed eager
      // under a new name. Splitting Stripe out had the same fate at HEAD:
      // js.stripe.com was reachable from the entry graph despite its chunk.
      //
      // Letting Rolldown split by reachability gets both right on its own.
      // Measured on production builds, as the *entry's static import graph*
      // (which is what first paint actually costs), not as chunk sizes:
      //
      //   catch-all vendor (before)   25 chunks   960.1 kB   274.7 kB gzip
      //   + explicit phone chunk      25 chunks   947.2 kB   270.6 kB gzip
      //   no manualChunks (this)      23 chunks   749.2 kB   223.0 kB gzip
      //
      // -51.7 kB gzip (-19%) off every cold load, in fewer requests, and both
      // the payment SDK and the phone metadata are finally lazy for real.
      // Before adding a rule back here, re-measure the entry graph: chunk
      // sizes in the build log do not tell you what first paint downloads.
      //
      // Auth modal + onboarding are also lazy from Layout (Suspense) for the
      // same reason — they are not needed to hydrate prerendered pages. Product
      // zoom (`PhotoLightbox` → `PhotoLightboxView`) and contact chat follow
      // the same pattern. Do not raise chunkSizeWarningLimit to hide a fat
      // entry; keep non-critical UI off the static import graph instead.
    },
  };
});
