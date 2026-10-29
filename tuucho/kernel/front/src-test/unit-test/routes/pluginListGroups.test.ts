import { describe, expect, it } from 'vitest';
import type { AdminPlugin } from '@/api/admin/shopSetup';
import {
  filterPluginGroups,
  groupAdminPlugins,
  groupLocaleSearchHit,
  localeComplementParentId,
  pluginIsTuucho,
} from '@/routes/pluginListGroups';

function plugin(
  id: string,
  name = id,
  extra: Partial<AdminPlugin> = {},
  kinds: string[] = ['generic'],
): AdminPlugin {
  return {
    id,
    enabled: true,
    settings: {},
    rates: [],
    bundled: id.startsWith('tuucho-'),
    manifest: { name, kinds, description: '', version: '1.0.0' },
    ...extra,
  };
}

describe('groupAdminPlugins', () => {
  it('nests locale complements under their parent and hides standalone locale packs', () => {
    const gift = plugin('tuucho-commerce-gift', 'Gift');
    const giftFr = plugin('tuucho-commerce-gift-locale-fr', 'Gift French', {}, ['locale']);
    const localeFr = plugin('tuucho-kernel-locale-fr', 'French', {}, ['locale']);
    const localeEn = plugin('tuucho-kernel-locale-en', 'English', {}, ['locale']);
    const orphan = plugin('shop-notes-locale-fr', 'Notes French', {}, ['locale']);
    const groups = groupAdminPlugins([giftFr, localeFr, localeEn, gift, orphan]);
    // Standalone / orphan locale-only packs are managed on Admin → Core.
    expect(groups.map((group) => group.parent.id)).toEqual(['tuucho-commerce-gift']);
    const giftGroup = groups.find((group) => group.parent.id === 'tuucho-commerce-gift');
    expect(giftGroup?.locales.map((entry) => entry.id)).toEqual(['tuucho-commerce-gift-locale-fr']);
    expect(localeComplementParentId('tuucho-kernel-locale-fr')).toBeNull();
    expect(localeComplementParentId('tuucho-commerce-gift-locale-fr')).toBe('tuucho-commerce-gift');
  });

  it('searches parent plugins and keeps locales with the parent', () => {
    const groups = groupAdminPlugins([
      plugin('tuucho-commerce-gift', 'Gift'),
      plugin('tuucho-commerce-gift-locale-fr', 'Gift French', {}, ['locale']),
      plugin('page-home', 'Home'),
    ]);
    expect(filterPluginGroups(groups, 'gift').map((group) => group.parent.id)).toEqual([
      'tuucho-commerce-gift',
    ]);
    expect(filterPluginGroups(groups, 'french')[0]?.locales[0]?.id).toBe(
      'tuucho-commerce-gift-locale-fr',
    );
    const gift = filterPluginGroups(groups, 'french')[0]!;
    expect(groupLocaleSearchHit(gift, 'french')).toBe(true);
    expect(groupLocaleSearchHit(gift, 'gift')).toBe(false);
  });
});

describe('filterPluginGroups origin and status', () => {
  const tuuchoMail = plugin('tuucho-mail-spy', 'Mail spy');
  const tuuchoGift = plugin('tuucho-commerce-gift', 'Gift', { enabled: false });
  const userFaq = plugin('home-faq', 'Home FAQ');
  const userHome = plugin('page-home', 'Home');
  const userGuides = plugin('page-guides', 'Guides');
  const userNotes = plugin('shop-notes', 'Notes', { enabled: false, bundled: false });

  it('treats bundled or tuucho- ids as Tuucho', () => {
    expect(pluginIsTuucho(tuuchoMail)).toBe(true);
    expect(pluginIsTuucho(userFaq)).toBe(false);
    expect(pluginIsTuucho(userHome)).toBe(false);
    expect(pluginIsTuucho(userGuides)).toBe(false);
    expect(pluginIsTuucho(plugin('legacy-theme', 'Legacy', { bundled: true }))).toBe(true);
    expect(pluginIsTuucho(plugin('tuucho-new-page', 'New', { bundled: false }))).toBe(true);
  });

  it('defaults to the Tuucho tab and splits User plugins out', () => {
    const groups = groupAdminPlugins([tuuchoMail, tuuchoGift, userFaq, userHome, userGuides, userNotes]);
    expect(filterPluginGroups(groups, '').map((group) => group.parent.id)).toEqual([
      'tuucho-commerce-gift',
      'tuucho-mail-spy',
    ]);
    expect(filterPluginGroups(groups, '', 'user').map((group) => group.parent.id)).toEqual([
      'page-guides',
      'page-home',
      'home-faq',
      'shop-notes',
    ]);
  });

  it('filters enabled and disabled across parent rows, with search', () => {
    const groups = groupAdminPlugins([tuuchoMail, tuuchoGift, userFaq, userHome, userGuides, userNotes]);
    expect(filterPluginGroups(groups, '', 'tuucho', 'enabled').map((group) => group.parent.id)).toEqual([
      'tuucho-mail-spy',
    ]);
    expect(filterPluginGroups(groups, '', 'tuucho', 'disabled').map((group) => group.parent.id)).toEqual([
      'tuucho-commerce-gift',
    ]);
    expect(filterPluginGroups(groups, '', 'user', 'disabled').map((group) => group.parent.id)).toEqual([
      'shop-notes',
    ]);
    expect(filterPluginGroups(groups, 'gift', 'tuucho', 'all').map((group) => group.parent.id)).toEqual([
      'tuucho-commerce-gift',
    ]);
    expect(filterPluginGroups(groups, 'gift', 'tuucho', 'enabled')).toEqual([]);
  });

  it('disabled filter uses the parent row only, not locale complements', () => {
    const parent = plugin('tuucho-commerce-gift', 'Gift', { enabled: true });
    const locale = plugin('tuucho-commerce-gift-locale-fr', 'Gift French', { enabled: false }, ['locale']);
    const groups = groupAdminPlugins([parent, locale]);
    expect(filterPluginGroups(groups, '', 'tuucho', 'disabled')).toEqual([]);
    expect(filterPluginGroups(groups, '', 'tuucho', 'enabled').map((group) => group.parent.id)).toEqual([
      'tuucho-commerce-gift',
    ]);
    const afterEnable = groupAdminPlugins([plugin('tuucho-commerce-gift', 'Gift', { enabled: true })]);
    expect(filterPluginGroups(afterEnable, '', 'tuucho', 'disabled')).toEqual([]);
  });
});
