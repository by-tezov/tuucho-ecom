import { Seo } from '@kernel/front/components/seo/Seo';
import { LoadingModal } from '@kernel/front/ui';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';
import { SpyMailChannels } from './SpyMailChannels';
import { useSpyMailAdmin } from './useSpyMailAdmin';
import styles from './AdminSpyMailPage.module.css';

export function AdminSpyMailPage() {
  const on = usePluginEnabled('tuucho-mail-spy');
  const { copy, channels, staffRoles, loading, error, busyId, toggle, addFilter, remove } = useSpyMailAdmin();

  if (!on) return <NotFoundPage />;

  return (
    <section className={styles.section}>
      <Seo title={copy.title} />
      <h1 className={styles.title}>{copy.title}</h1>
      <p className={styles.intro}>{copy.intro}</p>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <LoadingModal message={copy.loading} />
      ) : error && channels.length === 0 ? null : channels.length === 0 ? (
        <p className={styles.intro}>{copy.empty}</p>
      ) : (
        <SpyMailChannels
          channels={channels}
          staffRoles={staffRoles}
          copy={copy}
          showSearch
          busyId={busyId}
          onToggle={(channel, enabled) => void toggle(channel, enabled)}
          onAdd={(channel, filter, value) => void addFilter(channel, filter, value)}
          onRemove={(id, channelId) => void remove(id, channelId)}
        />
      )}
    </section>
  );
}
