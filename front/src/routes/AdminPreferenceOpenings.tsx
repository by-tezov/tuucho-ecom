import { OpeningEntries } from '../plugins/OpeningEntries';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import type { CoreOpenings } from '../plugins/types';
import styles from './AdminPreferencesPage.module.css';

/** Plugin contributions into core Preferences (or the sign-in / notification
 * openings on that page). Renders nothing until a plugin registers entries. */
export function AdminPreferenceOpenings({ slot }: { slot: keyof CoreOpenings }) {
  const { openings } = useStorefrontBootstrap();
  const entries = openings?.[slot] ?? [];
  if (entries.length === 0) return null;
  return (
    <section className={styles.panel}>
      <OpeningEntries entries={entries} />
    </section>
  );
}
