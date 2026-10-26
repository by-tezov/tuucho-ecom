import type { AdminUpdateCheck } from '../api/admin/shopSetup';

export type UpdateFocus = 'kernel' | 'plugins';

export type UpdateCheckKind = 'nothing' | 'ahead' | 'error' | 'plan';

/** Core shows the kernel diff. Plugins shows bundled and user plugin diffs. */
export function focusUpdateCheck(check: AdminUpdateCheck, focus: UpdateFocus): AdminUpdateCheck {
  const githubFailed = Boolean(check.officialRefuse) && check.tagPath.length === 0 && !check.officialAhead;
  if (githubFailed) {
    return focus === 'kernel' ? { ...check, plugins: [], userPlugins: [] } : { ...check, kernel: undefined };
  }
  if (focus === 'kernel') {
    const kernel = check.kernel;
    return {
      ...check,
      plugins: [],
      userPlugins: [],
      kernel,
      tagPath: kernel ? check.tagPath : [],
      canApplyOfficial: Boolean(kernel) && check.canApplyOfficial,
      officialRefuse: kernel ? check.officialRefuse : undefined,
      officialUpToDate: !kernel && !check.officialAhead,
      restartRequired: Boolean(kernel),
    };
  }
  const bundled = check.plugins.length > 0;
  return {
    ...check,
    kernel: undefined,
    tagPath: bundled ? check.tagPath : [],
    canApplyOfficial: bundled && check.canApplyOfficial,
    officialRefuse: bundled ? check.officialRefuse : undefined,
    officialAhead: false,
    officialUpToDate: !bundled,
    restartRequired: false,
  };
}

export function classifyUpdateCheck(check: AdminUpdateCheck): {
  kind: UpdateCheckKind;
  canApplyOfficial: boolean;
} {
  const userChanges = check.userPlugins.some((row) => Boolean(row.toTag) || Boolean(row.error));
  const officialPath = check.tagPath.length > 0 || Boolean(check.kernel) || check.plugins.length > 0;
  if (officialPath || userChanges) {
    return { kind: 'plan', canApplyOfficial: check.canApplyOfficial };
  }
  if (check.officialRefuse) {
    return { kind: 'error', canApplyOfficial: false };
  }
  if (check.officialAhead) {
    return { kind: 'ahead', canApplyOfficial: false };
  }
  return { kind: 'nothing', canApplyOfficial: false };
}

export function coreLineCheckStatus(check: AdminUpdateCheck): 'ahead' | 'upToDate' | 'updateAvailable' {
  const classified = classifyUpdateCheck(focusUpdateCheck(check, 'kernel'));
  if (classified.kind === 'ahead') return 'ahead';
  if (classified.kind === 'nothing') return 'upToDate';
  return 'updateAvailable';
}

export function latestTagLabel(check: AdminUpdateCheck, unknown: string): string {
  const tag = check.latestTag?.trim();
  return tag ? tag : unknown;
}
