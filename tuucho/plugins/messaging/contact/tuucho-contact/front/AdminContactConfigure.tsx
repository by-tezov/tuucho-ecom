import { LoadingModal } from '@kernel/front/ui';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { SpyMailChannels } from '../../../mail-spy/tuucho-mail-spy/front/SpyMailChannels';
import { useSpyMailAdmin } from '../../../mail-spy/tuucho-mail-spy/front/useSpyMailAdmin';
import { contactMailCopy } from './contactMailCopy';
import styles from '../../../mail-spy/tuucho-mail-spy/front/AdminSpyMailPage.module.css';

const CONTACT_CHANNELS: ReadonlySet<string> = new Set(['contact.inbound', 'contact.chat']);

export function AdminContactConfigure() {
  const spyOn = usePluginEnabled('tuucho-mail-spy');
  const { copy, channels, staffRoles, loading, error, busyId, toggle, addFilter, remove } =
    useSpyMailAdmin(CONTACT_CHANNELS);

  if (!spyOn) {
    return (
      <section className={styles.section}>
        <p className={styles.intro}>{contactMailCopy.intro}</p>
        <p className={styles.error}>{contactMailCopy.needSpyPlugin}</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <p className={styles.intro}>{contactMailCopy.intro}</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <LoadingModal message={copy.loading} /> : null}
      {!loading && channels.length > 0 ? (
        <SpyMailChannels
          channels={channels}
          staffRoles={staffRoles}
          copy={copy}
          showPluginId={false}
          showSearch={channels.length > 2}
          busyId={busyId}
          onToggle={(channel, enabled) => void toggle(channel, enabled)}
          onAdd={(channel, filter, value) => void addFilter(channel, filter, value)}
          onRemove={(id, channelId) => void remove(id, channelId)}
        />
      ) : null}
    </section>
  );
}
