import type { AdminPlugin } from '../api/admin/shopSetup';

export type SettingsSchema = NonNullable<AdminPlugin['manifest']['settingsSchema']>;
export type SettingsFieldSpec = SettingsSchema[string];

export type SettingsFieldGroup = {
  id: string;
  title: string;
  description?: string;
  keys: string[];
};

/** Consecutive keys that share `section` wrap in one FormSection.
 * First `sectionTitle` / `sectionDescription` on that id wins. */
export function groupSettingsFields(
  keys: string[],
  schema: SettingsSchema,
  fallbackTitle: string,
): SettingsFieldGroup[] {
  const groups: SettingsFieldGroup[] = [];
  const titled = new Set<string>();
  for (const key of keys) {
    const spec = schema[key];
    const sectionId = spec?.section?.trim() ?? '';
    const last = groups[groups.length - 1];
    if (last && last.id === sectionId) {
      last.keys.push(key);
      if (sectionId && !titled.has(sectionId)) {
        const title = spec?.sectionTitle?.trim();
        const description = spec?.sectionDescription?.trim();
        if (title) last.title = title;
        if (description) last.description = description;
        if (title || description) titled.add(sectionId);
      }
      continue;
    }
    const title = spec?.sectionTitle?.trim() || fallbackTitle;
    const description = spec?.sectionDescription?.trim();
    if (sectionId && (spec?.sectionTitle?.trim() || description)) titled.add(sectionId);
    groups.push({
      id: sectionId,
      title,
      ...(description ? { description } : {}),
      keys: [key],
    });
  }
  return groups;
}

export function settingFieldKeys(plugin: AdminPlugin): string[] {
  const schema = plugin.manifest.settingsSchema ?? {};
  const fromSchema = Object.keys(schema);
  if (fromSchema.length > 0) return fromSchema;
  return Object.keys(plugin.settings ?? {});
}
