import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { HOME_PATH } from '../config/paths';
import { localizedPath } from '../config/i18nRoutes';
import type { Lang } from '../assets/i18n/types';
import type { StorefrontBootstrap } from '../plugins/types';
import { prefersReducedMotion } from '../utils/scroll';
import type { NavItem } from '../components/layout/navItems';
import { shouldReplaceMobileBackPage } from '../utils/mobileBackNavigation';
import { useAuthSession } from '../state/AuthContext';
import { adminPath, isStaffRole } from '../utils/adminRoute';
import { useGiftLock } from './useGiftLock';
import { usePluginEnabled, useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';

/** Single source of truth for header/footer nav items. The HTML plan-du-site
 * reuses this list and adds the pose video watch pages under Pose (SEO crawl
 * path without putting those URLs in the main nav). */
export function useNavItems(options: { includeAdmin?: boolean; includeOfferWhenEnabled?: boolean } = {}): {
  items: NavItem[];
  goHome: () => void;
} {
  const { t, lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isImpersonating } = useAuthSession();
  const { shopLocked, originBlocked } = useGiftLock();
  const bootstrap = useStorefrontBootstrap();
  const giftOn = usePluginEnabled('tuucho-commerce-gift');
  // Contact is an Info item (Tuucho), not a page-plugin nav.key. Missing from
  // bootstrap.plugins (FALLBACK, or a failed fetch) must not hide it: the
  // plugin is defaultEnabled. Disable only when the catalogue says so.
  const contactOn = pluginEnabled(bootstrap, 'tuucho-contact', true);
  const menuVisible = (key: string) => bootstrap.menus.some((item) => item.key === key && item.visible);
  const homePath = localizedPath(HOME_PATH, lang);

  const goHome = () => {
    if (location.pathname === homePath) {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else {
      navigate(homePath, {
        replace: shouldReplaceMobileBackPage(location.pathname, homePath),
      });
    }
  };

  const infoChildren: NavItem[] = [
    ...(contactOn
      ? [{ key: 'contact', label: t.nav.contact, to: localizedPath('/contact', lang) }]
      : []),
    ...(menuVisible('about')
      ? [{ key: 'about', label: t.nav.about, to: localizedPath('/about', lang) }]
      : []),
    ...infoPluginPages(bootstrap, lang),
  ];

  const peerPages = topLevelPluginPages(bootstrap, lang);

  const items: NavItem[] = [
    { key: 'home', label: t.nav.home, to: homePath, onClick: goHome },
    ...(menuVisible('gallery')
      ? [{ key: 'gallery', label: t.nav.gallery, to: localizedPath('/gallery', lang) }]
      : []),
    ...peerPages,
    ...((options.includeOfferWhenEnabled || (!shopLocked && !originBlocked)) && giftOn
      ? [{ key: 'offer', label: t.nav.offer, to: localizedPath('/gift', lang) }]
      : []),
    ...(menuVisible('guide')
      ? [
          {
            key: 'guide',
            label: t.nav.guide,
            children: [
              { key: 'guide-shapes', label: t.nav.capsules, to: localizedPath('/capsules', lang) },
              { key: 'guide-sizes', label: t.nav.sizes, to: localizedPath('/sizes', lang) },
              { key: 'guide-application', label: t.nav.application, to: localizedPath('/pose', lang) },
            ],
          },
        ]
      : []),
    ...(infoChildren.length ? [{ key: 'info', label: t.nav.info, children: infoChildren }] : []),
    ...(options.includeAdmin && isStaffRole(user?.role) && !isImpersonating
      ? [{ key: 'admin', label: t.nav.admin, to: adminPath() }]
      : []),
  ];

  return { items, goHome };
}

function pluginEnabled(bootstrap: StorefrontBootstrap, id: string, whenMissing: boolean): boolean {
  const found = bootstrap.plugins.find((plugin) => plugin.id === id);
  return found ? found.enabled : whenMissing;
}

const CORE_MENU_KEYS = new Set(['home', 'gallery', 'guide', 'about', 'legal', 'contact', 'info', 'offer']);
/** About/contact-style keys stay under Infos; catalogue peers are top-level by order. */
const INFO_MENU_KEYS = new Set(['about', 'legal', 'contact', 'accessibility', 'sitemap']);

function resolvedMenuNav(
  bootstrap: StorefrontBootstrap,
  lang: Lang,
  item: StorefrontBootstrap['menus'][number],
): NavItem | null {
  if (!item.visible) return null;
  const plugin = bootstrap.plugins.find((entry) => entry.id === item.pluginId && entry.enabled);
  const route = plugin?.route;
  if (!route) return null;
  return { key: item.key, label: item.label, to: localizedPath(route, lang) };
}

function topLevelPluginPages(bootstrap: StorefrontBootstrap, lang: Lang): NavItem[] {
  return [...bootstrap.menus]
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      if (CORE_MENU_KEYS.has(item.key) || INFO_MENU_KEYS.has(item.key)) return [];
      const nav = resolvedMenuNav(bootstrap, lang, item);
      return nav ? [nav] : [];
    });
}

function infoPluginPages(bootstrap: StorefrontBootstrap, lang: Lang): NavItem[] {
  return [...bootstrap.menus]
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      // about/contact already rendered above with localized core labels.
      if (item.key === 'about' || item.key === 'contact') return [];
      if (!INFO_MENU_KEYS.has(item.key)) return [];
      const nav = resolvedMenuNav(bootstrap, lang, item);
      return nav ? [nav] : [];
    });
}
