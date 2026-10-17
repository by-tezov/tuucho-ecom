import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/latin-600-italic.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
// Pinyon / Cinzel: lazy via gift share-card chunk (assets/fonts/giftShareFonts.ts).
// Noto Thai: lazy when lang === 'th' (assets/fonts/thaiFonts.ts + LanguageContext).

import './styles/reset.css';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/global.css';

import { LanguageProvider } from './assets/i18n';
import { startAuthBootstrap } from './api/identity';
import { shopConfig } from './config/env';
import { AuthProvider } from './state/AuthContext';
import { CartProvider } from './hooks/CartProvider';
import { GiftReceiverProvider } from './hooks/useGiftReceiver';
import { OrdersProvider } from './hooks/useOrders';
import { GalleryFavoritesProvider } from './hooks/useGalleryFavorites';
import { PrerenderPayloadProvider, readPrerenderPayload } from './state/PrerenderPayload';
import { checkBackendHealth } from './api/session/backendHealth';
import { installGiftLockAliveGuard } from './state/giftLockSession';
import { mountLiveRegions } from './state/liveAnnouncer';
import { appPathnameFromWindow, prepareSplashColdEntry } from './state/splashEntryGate';
import { ThemeProvider } from './theme/ThemeProvider';
import { StorefrontBootstrapProvider } from './plugins/StorefrontBootstrap';
import { ThemeTokens } from './plugins/ThemeTokens';
import { initializeThemePreference } from './theme/themePreference';
import { AppErrorBoundary } from './components/app/AppErrorBoundary';
import { reportHydrationError } from './observability/clientError';
import App from './App.tsx';

// Resolve the saved light/dark/system choice before the splash or the React
// tree can paint, so the preference applies to every route from first render.
initializeThemePreference();

// Any cold URL (bookmark, refresh, typed path) must still play the entry
// splash first: stash the intended route and own `/` before React mounts
// (avoids a flash of the favorite page). Soft in-app navigations never
// re-run this module init.
prepareSplashColdEntry();
installGiftLockAliveGuard();
// Empty live regions first, so the first announcement is already a change.
mountLiveRegions();

// Start session restore and health probe before React commits so the
// network overlaps provider mount (and the `/` splash gallery preload).
void startAuthBootstrap();
void checkBackendHealth();

const container = document.getElementById('root')!;
// What scripts/prerender.mjs built this exact HTML with — null in dev, and on
// any route served through the SPA-fallback rewrite. Product pages carry
// their set here, so hydration renders the same tree without a round-trip.
const payload = readPrerenderPayload();
const app = (
  <StrictMode>
    <BrowserRouter {...(shopConfig.routerBasename ? { basename: shopConfig.routerBasename } : {})}>
      <PrerenderPayloadProvider value={payload}>
        <LanguageProvider>
          <AppErrorBoundary>
            <AuthProvider>
              <ThemeProvider>
                <StorefrontBootstrapProvider>
                  <ThemeTokens />
                  <OrdersProvider>
                    <GiftReceiverProvider>
                      <CartProvider>
                        <GalleryFavoritesProvider>
                          <App />
                        </GalleryFavoritesProvider>
                      </CartProvider>
                    </GiftReceiverProvider>
                  </OrdersProvider>
                </StorefrontBootstrapProvider>
              </ThemeProvider>
            </AuthProvider>
          </AppErrorBoundary>
        </LanguageProvider>
      </PrerenderPayloadProvider>
    </BrowserRouter>
  </StrictMode>
);

// Production HTML is prerendered by scripts/prerender.mjs — attach to it
// instead of re-rendering. In dev the root only holds the placeholder
// comment, so check for an element rather than any child node. But the
// SPA-fallback .htaccess rule serves index.html's own prerendered snapshot
// for every route scripts/prerender.mjs didn't build a page for (e.g.
// account pages, behind auth) — hydrating against that markup would ask
// React to reconcile this route's tree onto a different page's DOM, which
// throws a hydration-mismatch error and forces a full client re-render
// anyway. Skip straight to that re-render for those routes instead.
//
// Cold splash always createRoot: deep links are rewritten to `/` above, and
// Accueil lives at `/home` — never hydrate a bookmarked page under the intro.
// SEO crawlers that never run JS still see each route's prerendered HTML.
// The payload's own `path` settles other routes after splash has already
// played this document load.
const isSplashColdEntry = appPathnameFromWindow() === '/';
const isPrerenderedRoute = payload?.path === appPathnameFromWindow();
if (container.firstElementChild && isPrerenderedRoute && !isSplashColdEntry) {
  hydrateRoot(container, app, { onRecoverableError: reportHydrationError });
} else {
  container.innerHTML = '';
  createRoot(container).render(app);
}
