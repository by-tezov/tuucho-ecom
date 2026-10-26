import { OpeningEntries } from '../plugins/OpeningEntries';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import type { CoreOpenings } from '../plugins/types';
import { useAdminStrings } from '../assets/i18n/admin';
import { adminPath } from '../utils/adminRoute';
import styles from './AdminPreferencesPage.module.css';

/** Plugin contributions into core Preferences (the preferences / notification
 * openings on that page). Renders nothing until a plugin registers entries.
 * Sign-in entries keep a Configure target here. Preferences does not render
 * that slot. */
export function AdminPreferenceOpenings({ slot }: { slot: keyof CoreOpenings }) {
  const { openings, plugins } = useStorefrontBootstrap();
  const w = useAdminStrings().whiteLabel;
  const pluginOn = (id: string) => plugins.some((plugin) => plugin.id === id && plugin.enabled);
  const raw = (openings?.[slot] ?? []).filter((entry) => pluginOn(entry.pluginId));
  if (raw.length === 0) return null;
  const entries =
    slot === 'signInMethods'
      ? raw.map((entry) => ({
          ...entry,
          href: entry.href ?? adminPath(`/plugins/${entry.pluginId}`),
        }))
      : raw;
  return (
    <section className={styles.panel}>
      <OpeningEntries entries={entries} actionLabel={w.configure} />
    </section>
  );
}
