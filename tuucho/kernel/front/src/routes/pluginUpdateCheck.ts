import type { AdminUpdateCheck } from '../api/admin/shopSetup';

export type UpdateFocus = 'kernel' | 'plugins';

export type UpdateCheckKind = 'nothing' | 'ahead' | 'error' | 'plan';

/** Core shows the kernel diff. Plugins shows bundled and user plugin diffs. */
export function focusUpdateCheck(check: AdminUpdateCheck, focus: UpdateFocus): AdminUpdateCheck {
  const githubFailed = Boolean(check.officialRefuse) && check.tagPath.length === 0 && !check.officialAhead;
  if (githubFailed) {
    if (focus === 'kernel') return { ...check, plugins: [], userPlugins: [] };
    const { kernel: _kernel, ...rest } = check;
    return rest;
  }
  if (focus === 'kernel') {
    const kernel = check.kernel;
    const next: AdminUpdateCheck = {
      ...check,
      plugins: [],
      userPlugins: [],
      tagPath: kernel ? check.tagPath : [],
      canApplyOfficial: Boolean(kernel) && check.canApplyOfficial,
      officialUpToDate: !kernel && !check.officialAhead,
      restartRequired: Boolean(kernel),
    };
    if (kernel) next.kernel = kernel;
    else delete next.kernel;
    if (kernel && check.officialRefuse) next.officialRefuse = check.officialRefuse;
    else delete next.officialRefuse;
    return next;
  }
  const bundled = check.plugins.length > 0;
  const { kernel: _kernel, ...withoutKernel } = check;
  const next: AdminUpdateCheck = {
    ...withoutKernel,
    tagPath: bundled ? check.tagPath : [],
    canApplyOfficial: bundled && check.canApplyOfficial,
    officialAhead: false,
    officialUpToDate: !bundled,
    restartRequired: false,
  };
  if (bundled && check.officialRefuse) next.officialRefuse = check.officialRefuse;
  else delete next.officialRefuse;
  return next;
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
