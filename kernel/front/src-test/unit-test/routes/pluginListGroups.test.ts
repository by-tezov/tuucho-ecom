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
): AdminPlugin {
  return {
    id,
    enabled: true,
    settings: {},
    rates: [],
    bundled: id.startsWith('tuucho-'),
    manifest: { name, kind: 'generic', description: '', version: '1.0.0' },
    ...extra,
  };
}

describe('groupAdminPlugins', () => {
  it('nests locale complements under their parent and keeps standalone locale packs', () => {
    const gift = plugin('tuucho-commerce-gift', 'Gift');
    const giftFr = plugin('tuucho-commerce-gift-locale-fr', 'Gift French');
    const localeFr = plugin('tuucho-locale-fr', 'French');
    const orphan = plugin('shop-notes-locale-fr', 'Notes French');
    const groups = groupAdminPlugins([giftFr, localeFr, gift, orphan]);
    expect(groups.map((group) => group.parent.id)).toEqual([
      'tuucho-locale-fr',
      'tuucho-commerce-gift',
      'shop-notes-locale-fr',
    ]);
    const giftGroup = groups.find((group) => group.parent.id === 'tuucho-commerce-gift');
    expect(giftGroup?.locales.map((entry) => entry.id)).toEqual(['tuucho-commerce-gift-locale-fr']);
    expect(groups.find((group) => group.parent.id === 'tuucho-locale-fr')?.locales).toEqual([]);
    expect(localeComplementParentId('tuucho-locale-fr')).toBe('tuucho');
    expect(localeComplementParentId('tuucho-commerce-gift-locale-fr')).toBe('tuucho-commerce-gift');
  });

  it('searches parent plugins and keeps locales with the parent', () => {
    const groups = groupAdminPlugins([
      plugin('tuucho-commerce-gift', 'Gift'),
      plugin('tuucho-commerce-gift-locale-fr', 'Gift French'),
      plugin('tuucho-page-home', 'Home'),
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
  const tuuchoHome = plugin('tuucho-page-home', 'Home');
  const tuuchoGift = plugin('tuucho-commerce-gift', 'Gift', { enabled: false });
  const userGuides = plugin('demo-page-guides', 'Guides');
  const userNotes = plugin('shop-notes', 'Notes', { enabled: false, bundled: false });

  it('treats bundled or tuucho- ids as Tuucho', () => {
    expect(pluginIsTuucho(tuuchoHome)).toBe(true);
    expect(pluginIsTuucho(userGuides)).toBe(false);
    expect(pluginIsTuucho(plugin('legacy-theme', 'Legacy', { bundled: true }))).toBe(true);
    expect(pluginIsTuucho(plugin('tuucho-new-page', 'New', { bundled: false }))).toBe(true);
  });

  it('defaults to the Tuucho tab and splits User plugins out', () => {
    const groups = groupAdminPlugins([tuuchoHome, tuuchoGift, userGuides, userNotes]);
    expect(filterPluginGroups(groups, '').map((group) => group.parent.id)).toEqual([
      'tuucho-commerce-gift',
      'tuucho-page-home',
    ]);
    expect(filterPluginGroups(groups, '', 'user').map((group) => group.parent.id)).toEqual([
      'demo-page-guides',
      'shop-notes',
    ]);
  });

  it('filters enabled and disabled across parent rows, with search', () => {
    const groups = groupAdminPlugins([tuuchoHome, tuuchoGift, userGuides, userNotes]);
    expect(filterPluginGroups(groups, '', 'tuucho', 'enabled').map((group) => group.parent.id)).toEqual([
      'tuucho-page-home',
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
});
