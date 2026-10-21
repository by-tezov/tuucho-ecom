import type { AdminUpdateCheck } from '../api/admin/shopSetup';

export type UpdateCheckKind = 'nothing' | 'ahead' | 'error' | 'plan';

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
  const classified = classifyUpdateCheck(check);
  if (classified.kind === 'ahead') return 'ahead';
  if (classified.kind === 'nothing') return 'upToDate';
  return 'updateAvailable';
}

export function latestTagLabel(check: AdminUpdateCheck, unknown: string): string {
  const tag = check.latestTag?.trim();
  return tag ? tag : unknown;
}
