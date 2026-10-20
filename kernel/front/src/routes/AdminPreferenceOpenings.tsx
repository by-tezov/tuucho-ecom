import { OpeningEntries } from '../plugins/OpeningEntries';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import type { CoreOpenings } from '../plugins/types';
import { useAdminStrings } from '../assets/i18n/admin';
import { adminPath } from '../utils/adminRoute';
import styles from './AdminPreferencesPage.module.css';

/** Plugin contributions into core Preferences (or the sign-in / notification
 * openings on that page). Renders nothing until a plugin registers entries. */
export function AdminPreferenceOpenings({ slot }: { slot: keyof CoreOpenings }) {
  const { openings } = useStorefrontBootstrap();
  const w = useAdminStrings().whiteLabel;
  const raw = openings?.[slot] ?? [];
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
