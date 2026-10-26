import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings } from '@kernel/front/assets/i18n/admin';
import { staffRoleLabel } from '@kernel/front/assets/i18n/admin/roleLabel';
import { SpyMailChannels } from './SpyMailChannels';
import { useSpyMailAdmin } from './useSpyMailAdmin';
import styles from './AdminSpyMailPage.module.css';

export function SpyRulesPanel() {
  const { t } = useLang();
  const a = useAdminStrings();
  const { copy, channels, staffRoles, loading, error, busyId, toggle, addFilter, remove } = useSpyMailAdmin();
  const namedRoles = staffRoles.map((role) => ({
    ...role,
    label: staffRoleLabel(role.code, role.label, a, t.admin.userAdministrator),
  }));
  if (loading) return <p className={styles.panelHint}>{copy.loading}</p>;
  return (
    <section>
      <p className={styles.panelHint}>{copy.intro}</p>
      {error ? <p className={styles.panelHint}>{error}</p> : null}
      {channels.length === 0 ? <p className={styles.noneYet}>{copy.empty}</p> : null}
      <SpyMailChannels
        channels={channels}
        staffRoles={namedRoles}
        copy={copy}
        showSearch={channels.length > 2}
        busyId={busyId}
        onToggle={(channel, enabled) => void toggle(channel, enabled)}
        onAdd={(channel, filter, value) => void addFilter(channel, filter, value)}
        onRemove={(id, channelId) => void remove(id, channelId)}
      />
    </section>
  );
}
