import { useCallback, useEffect, useState } from 'react';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { ApiError } from '../api/errors';
import { getAdminPlugins, patchAdminPlugin, type AdminPlugin } from '../api/admin/shopSetup';
import { useAdminStrings } from '../assets/i18n/admin';
import { shopConfig } from '../config/env';
import { useAuthSession } from '../state/AuthContext';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { withMinDuration } from '../utils/withMinDuration';
import { isStandaloneLocalePack } from './pluginListGroups';
import styles from './AdminPlugins.module.css';

/** Enable / disable standalone locale packs from Admin → Core (any owner, any id). */
export function AdminKernelLocales() {
  const a = useAdminStrings();
  const c = a.core;
  const w = a.whiteLabel;
  const { authedRequest } = useAuthSession();
  const refreshBootstrap = useRefreshStorefrontBootstrap();
  const [packs, setPacks] = useState<AdminPlugin[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await authedRequest((token) => getAdminPlugins(token));
    const presentIds = new Set(result.plugins.map((plugin) => plugin.id));
    setPacks(
      result.plugins
        .filter((plugin) => isStandaloneLocalePack(plugin, presentIds))
        .sort(compareByLang),
    );
  }, [authedRequest]);

  useEffect(() => {
    void reload().catch(() => setError(c.localesLoadError));
  }, [reload, c.localesLoadError]);

  async function toggle(plugin: AdminPlugin, enabled: boolean) {
    setBusyId(plugin.id);
    setError('');
    try {
      await withMinDuration(
        (async () => {
          await authedRequest((token) => patchAdminPlugin(token, plugin.id, { enabled }));
          await reload();
          refreshBootstrap();
        })(),
        shopConfig.loadingMinMs.short,
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.serverMessage ? err.serverMessage : c.localesSaveError,
      );
    } finally {
      setBusyId(null);
    }
  }

  if (packs.length === 0 && !error) return null;

  return (
    <section className={styles.kernelLocales} aria-labelledby="core-kernel-locales-title">
      <h2 id="core-kernel-locales-title" className={styles.sectionTitle}>
        {c.localesTitle}
      </h2>
      <p className={styles.intro}>{c.localesIntro}</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <ul className={styles.list}>
        {packs.map((plugin) => (
          <li key={plugin.id} className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowMain}>
                <h3 className={styles.rowName}>{plugin.manifest.name}</h3>
                {plugin.manifest.description ? (
                  <p className={styles.rowDescription}>{plugin.manifest.description}</p>
                ) : null}
                <div className={styles.rowMeta}>
                  <span className={styles.badge}>{plugin.id}</span>
                  <span className={styles.badge}>{w.kindLocale}</span>
                </div>
              </div>
              <div className={styles.rowActions}>
                <ToggleSwitch
                  checked={plugin.enabled}
                  disabled={busyId !== null}
                  aria-label={w.enabled}
                  onChange={(checked) => void toggle(plugin, checked)}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {busyId ? <LoadingModal message={w.savingPlugin} /> : null}
    </section>
  );
}

function compareByLang(a: AdminPlugin, b: AdminPlugin): number {
  return a.id.localeCompare(b.id);
}
