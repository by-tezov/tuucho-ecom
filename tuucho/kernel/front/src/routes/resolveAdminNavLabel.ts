import type { AdminUiStrings } from '../assets/i18n/admin';

/** Resolve `labelKey` (dot path on admin strings) then fall back to manifest label. */
export function resolveAdminNavLabel(
  item: { label?: string; labelKey?: string },
  a: AdminUiStrings,
): string {
  if (!item.labelKey) return item.label ?? '';
  const parts = item.labelKey.split('.').filter(Boolean);
  let cursor: unknown = a;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return item.label ?? '';
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' && cursor.trim() ? cursor : (item.label ?? '');
}
