import { lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { RequireAuth, RequireAnonymous } from './components/auth/RequireAuth';
import { RequireAdmin } from './components/auth/RequireAdmin';
import { AdminSessionRedirect } from './components/auth/AdminSessionRedirect';
import { adminPath } from './utils/adminRoute';
import { ENABLED_LANGUAGES } from './config/i18nRoutes';

/*
 * Route loading is split along one line: **is this route prerendered?**
 *
 * The pages below are — they're what scripts/prerender.mjs builds static HTML
 * for, and what a search visitor lands on. They must be imported eagerly:
 * main.tsx calls hydrateRoot against their prerendered markup, and a lazy
 * component would suspend on that first render and hydrate a fallback
 * instead of the real page.
 */
import { SplashEntry } from './routes/SplashEntry';
import { HomePage } from './routes/HomePage';
import { GalleryPage } from './routes/GalleryPage';
import { AboutPage } from './routes/AboutPage';
import {
  pluginAdminRouteElements,
  pluginCustomerRouteElements,
  pluginPublicRouteElements,
} from './plugins/PluginHost';
import { GuidePage } from './routes/GuidePage';
import { LegalNoticePage } from './routes/LegalNoticePage';
import { PrivacyPage } from './routes/PrivacyPage';
import { TermsPage } from './routes/TermsPage';
import { SalesTermsPage } from './routes/SalesTermsPage';
import { SitemapPage } from './routes/SitemapPage';
import { NotFoundPage } from './routes/NotFoundPage';

/*
 * These are not, and never can be: they're behind auth or mid-checkout, so
 * they're always reached through the SPA-fallback rewrite, which main.tsx
 * serves with createRoot rather than hydrateRoot — nothing hydrates, so
 * nothing can mismatch. Together with the components only they pull in
 * (cart, orders, address, account, auth) and Stripe.js, that's the large
 * majority of the app, and none of it is needed to render the pages Google
 * actually sends people to. Loading it lazily keeps it out of the entry
 * chunk; Suspense lives in Layout, around <Outlet /> only.
 */
const LoginPage = lazy(() => import('./routes/LoginPage').then((m) => ({ default: m.LoginPage })));
// Product pages are API-backed and deliberately excluded from the static
// prerender set (entry-server.tsx). Keep their data/UI graph off the public
// landing-page bundle just like other runtime-only routes.
const ProductPage = lazy(() => import('./routes/ProductPage').then((m) => ({ default: m.ProductPage })));
const RegisterPage = lazy(() => import('./routes/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() =>
  import('./routes/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./routes/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const ConfirmEmailPage = lazy(() =>
  import('./routes/ConfirmEmailPage').then((m) => ({ default: m.ConfirmEmailPage })),
);
const ManageOrderPage = lazy(() =>
  import('./routes/ManageOrderPage').then((m) => ({ default: m.ManageOrderPage })),
);
const SecurityLockPage = lazy(() =>
  import('./routes/SecurityLockPage').then((m) => ({ default: m.SecurityLockPage })),
);
const AccountPage = lazy(() => import('./routes/AccountPage').then((m) => ({ default: m.AccountPage })));
const AccountAddressesPage = lazy(() =>
  import('./routes/AccountAddressesPage').then((m) => ({ default: m.AccountAddressesPage })),
);
const AccountPaymentMethodsPage = lazy(() =>
  import('./routes/AccountPaymentMethodsPage').then((m) => ({ default: m.AccountPaymentMethodsPage })),
);
const AccountNotificationsPage = lazy(() =>
  import('./routes/AccountNotificationsPage').then((m) => ({ default: m.AccountNotificationsPage })),
);
const CartPage = lazy(() => import('./routes/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutReturnPage = lazy(() =>
  import('./routes/CheckoutReturnPage').then((m) => ({ default: m.CheckoutReturnPage })),
);
const FacebookReturnPage = lazy(() =>
  import('./routes/FacebookReturnPage').then((m) => ({ default: m.FacebookReturnPage })),
);
const AppleReturnPage = lazy(() =>
  import('./routes/AppleReturnPage').then((m) => ({ default: m.AppleReturnPage })),
);
const FacebookDataDeletionPage = lazy(() =>
  import('./routes/FacebookDataDeletionPage').then((m) => ({ default: m.FacebookDataDeletionPage })),
);
const OrdersPage = lazy(() => import('./routes/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const OrdersHistoryPage = lazy(() =>
  import('./routes/OrdersHistoryPage').then((m) => ({ default: m.OrdersHistoryPage })),
);
const AdminLayout = lazy(() => import('./routes/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminPage = lazy(() => import('./routes/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminImpersonatePage = lazy(() =>
  import('./routes/AdminImpersonatePage').then((m) => ({ default: m.AdminImpersonatePage })),
);
const AdminOrdersPage = lazy(() =>
  import('./routes/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })),
);
const AdminLibraryStockPage = lazy(() =>
  import('./routes/AdminLibraryStockPage').then((m) => ({ default: m.AdminLibraryStockPage })),
);
const AdminAccessoryStockPage = lazy(() =>
  import('./routes/AdminAccessoryStockPage').then((m) => ({ default: m.AdminAccessoryStockPage })),
);
const AdminActivityPage = lazy(() =>
  import('./routes/AdminActivityPage').then((m) => ({ default: m.AdminActivityPage })),
);
const AdminPreferencesPage = lazy(() =>
  import('./routes/AdminPreferencesPage').then((m) => ({ default: m.AdminPreferencesPage })),
);
const AdminSeoPage = lazy(() =>
  import('./routes/AdminSeoPage').then((m) => ({ default: m.AdminSeoPage })),
);
const AdminCatalogueVocabularyPage = lazy(() =>
  import('./routes/AdminCatalogueVocabularyPage').then((m) => ({ default: m.AdminCatalogueVocabularyPage })),
);
const AdminCourierCatalogPage = lazy(() =>
  import('./routes/AdminCourierCatalogPage').then((m) => ({ default: m.AdminCourierCatalogPage })),
);
const AdminRolesPage = lazy(() =>
  import('./routes/AdminRolesPage').then((m) => ({ default: m.AdminRolesPage })),
);
const AdminUsersPage = lazy(() =>
  import('./routes/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);
const AdminPluginsPage = lazy(() =>
  import('./routes/AdminPluginsPage').then((m) => ({ default: m.AdminPluginsPage })),
);
const AdminPluginConfigurePage = lazy(() =>
  import('./routes/AdminPluginConfigurePage').then((m) => ({ default: m.AdminPluginConfigurePage })),
);
const AdminStoreSettingsPage = lazy(() =>
  import('./routes/AdminStoreSettingsPage').then((m) => ({ default: m.AdminStoreSettingsPage })),
);
const PluginContentPage = lazy(() =>
  import('./routes/PluginContentPage').then((m) => ({ default: m.PluginContentPage })),
);

/** The public/indexable route family — rendered once unprefixed as a
 * compatibility entry (LanguageProvider redirects those to `/{lang}/…`)
 * and once per ENABLED_LANGUAGES under its own `/xx` prefix, including
 * French `/fr`. Paths here are relative (no leading slash) so the same
 * list composes correctly nested under a `<Route path="xx">`. */
const PUBLIC_ROUTE_DEFS: { path: string; element: ReactNode }[] = [
  { path: 'home', element: <HomePage /> },
  { path: 'gallery', element: <GalleryPage /> },
  // API-backed product page. The slug's trailing product uid resolves it at
  // runtime; link-preview bots are served by the backend instead.
  { path: 'creations/:slug', element: <ProductPage /> },
  { path: 'about', element: <AboutPage /> },
  { path: 'sizes', element: <GuidePage /> },
  { path: 'legal', element: <LegalNoticePage /> },
  { path: 'privacy', element: <PrivacyPage /> },
  { path: 'terms', element: <TermsPage /> },
  { path: 'sales-terms', element: <SalesTermsPage /> },
  { path: 'sitemap', element: <SitemapPage /> },
];

/** The signed-in/mid-checkout customer journey — not indexable (all
 * noindex or auth-gated), but still gets a locale mirror: a visitor's
 * language must survive clicking from a localized public page into their
 * account or cart, not silently drop back to French. Same reasoning and
 * mechanism as PUBLIC_ROUTE_DEFS above. The admin area deliberately does
 * NOT get one — it's a single-operator internal tool, never indexed, and
 * nothing about it benefits from a per-visitor language in its URL. */
const CUSTOMER_ROUTE_DEFS: { path: string; element: ReactNode }[] = [
  {
    path: 'login',
    element: (
      <RequireAnonymous>
        <LoginPage />
      </RequireAnonymous>
    ),
  },
  { path: 'register', element: <RegisterPage /> },
  { path: 'forgot-password', element: <ForgotPasswordPage /> },
  { path: 'account/reset-password', element: <ResetPasswordPage /> },
  { path: 'account/confirm-email', element: <ConfirmEmailPage /> },
  { path: 'account/manage-order', element: <ManageOrderPage /> },
  { path: 'account/security-lock', element: <SecurityLockPage /> },
  {
    path: 'account',
    element: (
      <RequireAuth>
        <AccountPage />
      </RequireAuth>
    ),
  },
  {
    path: 'account/addresses',
    element: (
      <RequireAuth>
        <AccountAddressesPage />
      </RequireAuth>
    ),
  },
  {
    path: 'account/payment-methods',
    element: (
      <RequireAuth>
        <AccountPaymentMethodsPage />
      </RequireAuth>
    ),
  },
  {
    path: 'account/notifications',
    element: (
      <RequireAuth>
        <AccountNotificationsPage />
      </RequireAuth>
    ),
  },
  {
    path: 'cart',
    // Deliberately not RequireAuth-gated — a guest can browse, favorite,
    // add to cart, and fill out the whole checkout form (see
    // state/guestCart.ts); only actually paying requires an account,
    // prompted in-page by GuestCheckoutPrompt.
    // Layout owns the persistent CartPage instance so a legal/auth detour can
    // hide it without destroying checkout state. This leaf only marks the
    // route match; rendering a second lazy CartPage here would be dead work.
    element: null,
  },
  // Not RequireAuth-gated: this is Stripe's redirect return_url after an
  // off-site PayPal round trip (see CartCheckoutSection.tsx), and guest
  // checkout has no session to gate on — an anonymous visitor landing here
  // mid-payment must still see their own confirmation.
  { path: 'checkout/return', element: <CheckoutReturnPage /> },
  {
    path: 'orders',
    element: (
      <RequireAuth>
        <OrdersPage />
      </RequireAuth>
    ),
  },
  {
    path: 'orders/history',
    element: (
      <RequireAuth>
        <OrdersHistoryPage />
      </RequireAuth>
    ),
  },
];

export default function App() {
  return (
    <>
      <AdminSessionRedirect />
      <Routes>
        <Route element={<Layout cartPage={<CartPage />} preprodUnavailable={<NotFoundPage />} />}>
          <Route path="/" element={<SplashEntry />} />
          {PUBLIC_ROUTE_DEFS.map(({ path, element }) => (
            <Route key={path} path={`/${path}`} element={element} />
          ))}
          {pluginPublicRouteElements()}
          {CUSTOMER_ROUTE_DEFS.map(({ path, element }) => (
            <Route key={path} path={`/${path}`} element={element} />
          ))}
          {pluginCustomerRouteElements()}
          <Route path="/:pluginSlug" element={<PluginContentPage />} />
          {/* Facebook Login fallback_redirect_uri — fixed path only (no /en/…),
            must match Meta Valid OAuth Redirect URIs exactly. */}
          <Route path="/auth/facebook-return" element={<FacebookReturnPage />} />
          {/* Apple Sign in with Apple form_post bridge — fixed path only,
            must match the Services ID Return URL exactly. */}
          <Route path="/auth/apple-return" element={<AppleReturnPage />} />
          <Route path="/auth/facebook-data-deletion" element={<FacebookDataDeletionPage />} />
          {/* Locale-prefixed mirror of both blocks above, one subtree per
            enabled language including French — see config/i18nRoutes.ts.
            Unprefixed routes above remain so a bookmark such as /gallery
            still matches while LanguageProvider redirects to /fr/gallery.
            Only the admin area below has no prefixed counterpart. */}
          {ENABLED_LANGUAGES.map((lang) => (
            <Route key={lang} path={lang}>
              <Route index element={<SplashEntry />} />
              {PUBLIC_ROUTE_DEFS.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
              {pluginPublicRouteElements()}
              {CUSTOMER_ROUTE_DEFS.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
              {pluginCustomerRouteElements()}
              <Route path=":pluginSlug" element={<PluginContentPage />} />
            </Route>
          ))}
          <Route
            path={adminPath()}
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<AdminPage />} />
            <Route path="activity" element={<AdminActivityPage />} />
            <Route path="impersonate" element={<AdminImpersonatePage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            {/* Stats was folded into the dashboard (AdminPage) — this keeps any
              bookmarked/shared link to the old page working. */}
            <Route path="stats" element={<Navigate to={adminPath()} replace />} />
            <Route path="library-stock" element={<AdminLibraryStockPage />} />
            <Route path="accessory-stock" element={<AdminAccessoryStockPage />} />
            <Route path="preferences" element={<AdminPreferencesPage />} />
            <Route path="seo" element={<AdminSeoPage />} />
            <Route path="plugins/:pluginId" element={<AdminPluginConfigurePage />} />
            <Route path="plugins" element={<AdminPluginsPage />} />
            <Route path="shop" element={<AdminStoreSettingsPage />} />
            <Route path="catalogue-vocabulary" element={<AdminCatalogueVocabularyPage />} />
            <Route path="couriers" element={<AdminCourierCatalogPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="roles" element={<AdminRolesPage />} />
            {pluginAdminRouteElements()}
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
