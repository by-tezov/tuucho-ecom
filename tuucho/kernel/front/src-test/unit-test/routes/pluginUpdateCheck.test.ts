import { describe, expect, it } from 'vitest';
import type { AdminUpdateCheck } from '@/api/admin/shopSetup';
import { classifyUpdateCheck, coreLineCheckStatus, focusUpdateCheck, latestTagLabel } from '@/routes/pluginUpdateCheck';

function check(overrides: Partial<AdminUpdateCheck> = {}): AdminUpdateCheck {
  return {
    currentTag: '0.0.2',
    currentKernel: '0.0.2',
    inferred: false,
    latestTag: '0.0.2',
    officialUpToDate: true,
    officialAhead: false,
    canApplyOfficial: false,
    dirtyPaths: [],
    tagPath: [],
    plugins: [],
    userPlugins: [],
    restartRequired: false,
    ...overrides,
  };
}

describe('classifyUpdateCheck', () => {
  it('treats matching current and latest tags as nothing to update', () => {
    expect(classifyUpdateCheck(check())).toEqual({ kind: 'nothing', canApplyOfficial: false });
    expect(coreLineCheckStatus(check())).toBe('upToDate');
  });

  it('treats a local version newer than the published tag as ahead, with no Apply', () => {
    expect(
      classifyUpdateCheck(
        check({
          currentTag: '0.0.3',
          currentKernel: '0.0.3',
          latestTag: '0.0.2',
          officialUpToDate: false,
          officialAhead: true,
        }),
      ),
    ).toEqual({ kind: 'ahead', canApplyOfficial: false });
    expect(
      coreLineCheckStatus(
        check({
          currentTag: '0.0.3',
          officialUpToDate: false,
          officialAhead: true,
          latestTag: '0.0.2',
        }),
      ),
    ).toBe('ahead');
  });

  it('surfaces a GitHub refuse without a path as an error, not an empty plan', () => {
    expect(
      classifyUpdateCheck(
        check({
          officialUpToDate: false,
          latestTag: null,
          officialRefuse: 'GitHub check failed.',
        }),
      ),
    ).toEqual({ kind: 'error', canApplyOfficial: false });
  });

  it('lists an official tag path as a plan that can apply', () => {
    expect(
      classifyUpdateCheck(
        check({
          officialUpToDate: false,
          latestTag: '0.0.4',
          canApplyOfficial: true,
          tagPath: ['0.0.3', '0.0.4'],
          kernel: { id: 'kernel', from: '0.0.2', to: '0.0.4' },
          plugins: [{ id: 'tuucho-home', from: '0.1.0', to: '0.1.1' }],
        }),
      ),
    ).toEqual({ kind: 'plan', canApplyOfficial: true });
    expect(
      coreLineCheckStatus(
        check({
          officialUpToDate: false,
          latestTag: '0.0.4',
          canApplyOfficial: true,
          tagPath: ['0.0.3', '0.0.4'],
          kernel: { id: 'kernel', from: '0.0.2', to: '0.0.4' },
        }),
      ),
    ).toBe('updateAvailable');
  });

  it('keeps a plugin-only release off the kernel line', () => {
    const source = check({
      officialUpToDate: false,
      latestTag: '0.0.4',
      canApplyOfficial: true,
      tagPath: ['0.0.4'],
      plugins: [{ id: 'tuucho-home', from: '0.1.0', to: '0.1.1' }],
    });
    expect(coreLineCheckStatus(source)).toBe('upToDate');
    const plugins = focusUpdateCheck(source, 'plugins');
    expect(plugins.kernel).toBeUndefined();
    expect(plugins.plugins).toHaveLength(1);
    expect(classifyUpdateCheck(plugins)).toEqual({ kind: 'plan', canApplyOfficial: true });
    const kernel = focusUpdateCheck(
      check({
        officialUpToDate: false,
        latestTag: '0.0.4',
        canApplyOfficial: true,
        tagPath: ['0.0.4'],
        kernel: { id: 'kernel', from: '0.0.2', to: '0.0.4' },
        plugins: [{ id: 'tuucho-home', from: '0.1.0', to: '0.1.1' }],
        userPlugins: [
          {
            id: 'shop-notes',
            name: 'Notes',
            repository: 'https://github.com/example/notes',
            from: '1.0.0',
            to: '1.1.0',
            toTag: '1.1.0',
            tags: ['1.1.0'],
          },
        ],
      }),
      'kernel',
    );
    expect(kernel.plugins).toEqual([]);
    expect(kernel.userPlugins).toEqual([]);
    expect(kernel.kernel?.to).toBe('0.0.4');
  });

  it('keeps a dirty official path as a plan that cannot apply', () => {
    expect(
      classifyUpdateCheck(
        check({
          officialUpToDate: false,
          latestTag: '0.0.3',
          canApplyOfficial: false,
          dirtyPaths: ['plugins/home'],
          tagPath: ['0.0.3'],
          kernel: { id: 'kernel', from: '0.0.2', to: '0.0.3' },
        }),
      ),
    ).toEqual({ kind: 'plan', canApplyOfficial: false });
  });

  it('lists user-plugin tags or errors as a plan', () => {
    expect(
      classifyUpdateCheck(
        check({
          userPlugins: [
            {
              id: 'shop-notes',
              name: 'Notes',
              repository: 'https://github.com/example/notes',
              from: '1.0.0',
              to: '1.1.0',
              toTag: '1.1.0',
              tags: ['1.1.0'],
            },
          ],
        }),
      ),
    ).toEqual({ kind: 'plan', canApplyOfficial: false });
  });
});

describe('latestTagLabel', () => {
  it('falls back when GitHub did not return a tag', () => {
    expect(latestTagLabel(check({ latestTag: null }), 'unknown')).toBe('unknown');
    expect(latestTagLabel(check({ latestTag: '  ' }), 'unknown')).toBe('unknown');
    expect(latestTagLabel(check({ latestTag: '0.0.2' }), 'unknown')).toBe('0.0.2');
  });
});
