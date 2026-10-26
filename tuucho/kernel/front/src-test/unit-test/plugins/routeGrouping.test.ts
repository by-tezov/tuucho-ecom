import { describe, expect, it } from 'vitest';
import { groupPluginRoutes, pickRouteCandidate } from '@/plugins/routeGrouping';

const earlier = {
  pluginId: 'page-home',
  routes: [
    { path: 'home', element: 'example-home' },
    { path: 'about', element: 'example-about' },
  ],
};
const later = {
  pluginId: 'shop-home',
  routes: [{ path: 'home', element: 'override-home' }],
};

describe('groupPluginRoutes', () => {
  it('emits one group per path and keeps candidate load order', () => {
    const grouped = groupPluginRoutes([earlier, later]);
    expect(grouped.map((entry) => entry.path)).toEqual(['home', 'about']);
    const home = grouped[0];
    expect(home?.candidates.map((candidate) => candidate.pluginId)).toEqual([
      'page-home',
      'shop-home',
    ]);
    expect(grouped[1]?.candidates).toHaveLength(1);
  });

  it('applies the path prefix before grouping', () => {
    const grouped = groupPluginRoutes(
      [
        { pluginId: 'a', routes: [{ path: 'x', element: null }] },
        { pluginId: 'b', routes: [{ path: 'x', element: null }] },
      ],
      '/admin/',
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.path).toBe('/admin/x');
  });

  it('keeps distinct paths from one plugin as separate groups', () => {
    const grouped = groupPluginRoutes([earlier]);
    expect(grouped).toHaveLength(2);
  });

  it('treats a plugin without routes as no candidates', () => {
    expect(groupPluginRoutes([{ pluginId: 'empty', routes: undefined }])).toEqual([]);
  });
});

describe('pickRouteCandidate', () => {
  const candidates = groupPluginRoutes([earlier, later])[0]?.candidates ?? [];

  it('lets the later candidate shadow the earlier one when both are on', () => {
    const winner = pickRouteCandidate(candidates, new Set(['page-home', 'shop-home']));
    expect(winner?.element).toBe('override-home');
  });

  it('falls back to the earlier candidate when the override plugin is disabled', () => {
    const winner = pickRouteCandidate(candidates, new Set(['page-home']));
    expect(winner?.element).toBe('example-home');
  });

  it('returns null when no candidate plugin is enabled', () => {
    expect(pickRouteCandidate(candidates, new Set())).toBeNull();
    expect(pickRouteCandidate([], new Set(['page-home']))).toBeNull();
  });
});
