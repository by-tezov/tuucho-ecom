import type { AdminUiStrings } from './types';

/** Name from the language files. English is the kernel default. A missing
 * entry means the role was named on the Roles page, so the stored label is used. */
export function staffRoleLabel(
  code: string,
  storedLabel: string,
  a: AdminUiStrings,
  administrator: string,
): string {
  if (code === 'super-admin') return administrator;
  if (code === 'user') return a.roles.customerRole;
  const names: Partial<Record<string, string>> = a.roles.names;
  return names[code] ?? storedLabel;
}
