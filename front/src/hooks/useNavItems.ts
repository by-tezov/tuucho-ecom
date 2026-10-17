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
  const giftOn = usePluginEnabled('commerce-gift');
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

  const items: NavItem[] = [
    // A link (it navigates), whose click still runs goHome for the
    // scroll-to-top / mobile back-stack behaviour.
    { key: 'home', label: t.nav.home, to: homePath, onClick: goHome },
    ...(menuVisible('gallery')
      ? [{ key: 'gallery', label: t.nav.gallery, to: localizedPath('/gallery', lang) }]
      : []),
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
    {
      key: 'info',
      label: t.nav.info,
      children: [
        { key: 'contact', label: t.nav.contact, to: localizedPath('/contact', lang) },
        ...(menuVisible('about')
          ? [{ key: 'about', label: t.nav.about, to: localizedPath('/about', lang) }]
          : []),
        ...(menuVisible('legal')
          ? [{ key: 'legal', label: t.footer.legalLink, to: localizedPath('/legal', lang) }]
          : []),
        ...extraPluginPages(bootstrap, lang),
      ],
    },
    // Admin is never localized — not part of the public/indexable subtree.
    ...(options.includeAdmin && isStaffRole(user?.role) && !isImpersonating
      ? [{ key: 'admin', label: t.nav.admin, to: adminPath() }]
      : []),
  ];

  return { items, goHome };
}

const CORE_MENU_KEYS = new Set(['home', 'gallery', 'guide', 'about', 'legal']);

function extraPluginPages(bootstrap: StorefrontBootstrap, lang: Lang): NavItem[] {
  return bootstrap.menus.flatMap((item) => {
    if (!item.visible || CORE_MENU_KEYS.has(item.key)) return [];
    const plugin = bootstrap.plugins.find((entry) => entry.id === item.pluginId && entry.enabled);
    const route = plugin?.route;
    if (!route) return [];
    return [{ key: item.key, label: item.label, to: localizedPath(route, lang) }];
  });
}
