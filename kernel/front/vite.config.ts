import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveCssComposeSpecifier, viteResolveAlias } from './importAliases.ts';

/**
 * Plugin CSS lives outside the Vite root (`plugins/tuucho/<group>/<feature>/<id>/front`). A relative
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

function loadEnvFile(fileName: string): Record<string, string> {
  const filePath = resolve(process.cwd(), '.env', fileName);
  if (!existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const { version: appVersion } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));

export default defineConfig(({ mode }) => {
  // Same layered pattern as kernel/back: .env/.public.env (common) ->
  // .env/<target>/.public.env -> .env/.private.env (common) ->
  // .env/<target>/.private.env, each overriding the last. `target` comes
  // from Vite's own --mode flag: `npm run dev`'s default mode 'development'
  // -> 'dev'; a future `vite build --mode preprod` -> 'preprod'; anything
  // else (npm run build's default mode 'production') -> 'prod'.
  const targetFileSuffix = mode === 'development' ? 'dev' : mode === 'preprod' ? 'preprod' : 'prod';
  const isolatedTestProcess = Boolean(process.env.PAM_TEST_API_BASE_URL);
  // The backend functional suite exercises real Stripe test-mode and Mondial
  // Relay widgets against an isolated API/database. Its Vite child needs the
  // same client-public provider values as local dev. The front-end's own CI
  // server never sets PAM_TEST_SUITE and remains private-env-free.
  const backendFunctionalSuite = process.env.PAM_TEST_SUITE === 'dev';
  Object.assign(
    process.env,
    loadEnvFile('.public.env'),
    loadEnvFile(`${targetFileSuffix}/.public.env`),
    // Preserve test-e2e:ci's non-secret isolated server. The backend suite is
    // the deliberate exception above; Vite exposes only VITE_* values to the
    // browser, and these provider identifiers are client-public by design.
    ...(isolatedTestProcess && !backendFunctionalSuite
      ? []
      : [loadEnvFile('.private.env'), loadEnvFile(`${targetFileSuffix}/.private.env`)]),
  );
  // The backend functional runner starts an isolated API for each suite.
  // This process-only override deliberately wins over the normal dev files;
  // it is never written to disk or used by an ordinary frontend dev server.
  if (process.env.PAM_TEST_API_BASE_URL) process.env.VITE_API_BASE_URL = process.env.PAM_TEST_API_BASE_URL;
  if (process.env.PAM_TEST_SITE_URL) process.env.VITE_SITE_URL = process.env.PAM_TEST_SITE_URL;
  // CI may inject inert provider identifiers to mount static UI. The backend
  // functional suite intentionally leaves these unset so its dev provider
  // configuration above is used for real widget interactions.
  if (process.env.PAM_TEST_GOOGLE_CLIENT_ID)
    process.env.VITE_GOOGLE_CLIENT_ID = process.env.PAM_TEST_GOOGLE_CLIENT_ID;
  if (process.env.PAM_TEST_APPLE_CLIENT_ID)
    process.env.VITE_APPLE_CLIENT_ID = process.env.PAM_TEST_APPLE_CLIENT_ID;
  if (process.env.PAM_TEST_STRIPE_PUBLISHABLE_KEY) {
    process.env.VITE_STRIPE_PUBLISHABLE_KEY = process.env.PAM_TEST_STRIPE_PUBLISHABLE_KEY;
  }
  if (process.env.PAM_TEST_MONDIAL_RELAY_BRAND) {
    process.env.VITE_MONDIAL_RELAY_BRAND = process.env.PAM_TEST_MONDIAL_RELAY_BRAND;
  }
  // The functional runner uses dedicated names because the .env merge above
  // would otherwise replace direct VITE_* process values with normal dev
  // timings. These are test-process-only and leave ordinary Vite unchanged.
  if (process.env.PAM_TEST_LOADING_MIN) {
    process.env.VITE_LOADING_MIN = process.env.PAM_TEST_LOADING_MIN;
  }
  if (process.env.PAM_TEST_BOOT_SPLASH_SPEED) {
    process.env.VITE_BOOT_SPLASH_SPEED = process.env.PAM_TEST_BOOT_SPLASH_SPEED;
  }

  return {
    base: '/',
    resolve: { alias: viteResolveAlias },
    plugins: [absoluteCssModuleComposes(), react()],
    css: {
      postcss: {
        plugins: [stampPostcssFrom()],
      },
    },
    // The backend's functional runner starts a one-shot Vite process. It
    // never edits frontend source while that process is alive, so watching
    // tens of thousands of files is wasted work and can exceed Linux's
    // per-user inotify watch limit (ENOSPC). Normal `npm run dev` keeps Vite
    // watching/HMR exactly as usual — but never on IDE shelves / VCS junk,
    // which can burn the whole watch budget alone.
    server:
      process.env.PAM_TEST_DISABLE_VITE_WATCH === '1'
        ? { watch: null }
        : {
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
