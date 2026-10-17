/** One field that actually differed between the stored state and the write. */
export type ActivityChange = {
  field: string;
  before: unknown;
  after: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => valuesEqual(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    if (leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every((key) => valuesEqual(left[key], right[key]));
  }
  return false;
}

/** Diff two plain snapshots into a flat `changes` list. Nested objects become
 * dotted fields (`sizes.XS`). Arrays and scalars compare as a whole. Only
 * differing fields are returned. */
export function buildChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ActivityChange[] {
  const left = before ?? {};
  const right = after ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changes: ActivityChange[] = [];

  for (const key of [...keys].sort()) {
    const beforeValue = left[key];
    const afterValue = right[key];
    if (isPlainObject(beforeValue) || isPlainObject(afterValue)) {
      const nested = buildChanges(
        isPlainObject(beforeValue) ? beforeValue : {},
        isPlainObject(afterValue) ? afterValue : {},
      );
      for (const entry of nested) {
        changes.push({
          field: `${key}.${entry.field}`,
          before: entry.before,
          after: entry.after,
        });
      }
      continue;
    }
    if (!valuesEqual(beforeValue, afterValue)) {
      changes.push({ field: key, before: beforeValue ?? null, after: afterValue ?? null });
    }
  }

  return changes;
}

/** French summary fragment for one or two changes; otherwise a short count. */
export function summarizeChanges(
  changes: readonly ActivityChange[],
  labels: Record<string, string> = {},
): string {
  if (changes.length === 0) return 'aucun changement';
  const format = (change: ActivityChange): string => {
    const label = labels[change.field] ?? change.field;
    return `${label} ${formatValue(change.before)} -> ${formatValue(change.after)}`;
  };
  if (changes.length <= 2) return changes.map(format).join(', ');
  return `${changes.length} champs modifies`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  return String(value);
}

/** Common French labels for journal `changes.field` values. */
export const ACTIVITY_CHANGE_LABELS: Record<string, string> = {
  price: 'Prix',
  unitPrice: 'Prix unitaire',
  available: 'Stock',
  packPrices: 'Prix packs',
  hidden: 'Masque',
  featured: 'Mise en avant',
  enabled: 'Active',
  status: 'Statut',
  suppressed: 'Notification e-mail',
  adminVerified: 'Verifie',
  'sizes.XS': 'Taille XS',
  'sizes.S': 'Taille S',
  'sizes.M': 'Taille M',
  'sizes.L': 'Taille L',
};
