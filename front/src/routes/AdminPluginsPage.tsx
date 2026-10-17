import { useEffect, useState } from 'react';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useAuthSession } from '../state/AuthContext';
import { useAdminStrings } from '../assets/i18n/admin';
import { ApiError } from '../api/errors';
import { getAdminPlugins, patchAdminPlugin, scanAdminPlugins, type AdminPlugin } from '../api/admin/shopSetup';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { pluginConfigurePath } from './pluginConfigure';
import styles from './AdminPlugins.module.css';

export function AdminPluginsPage() {
  const w = useAdminStrings().whiteLabel;
  const { authedRequest } = useAuthSession();
  const refreshBootstrap = useRefreshStorefrontBootstrap();
  const [plugins, setPlugins] = useState<AdminPlugin[]>([]);
  const [coreVersion, setCoreVersion] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    try {
      const result = await authedRequest((token) => getAdminPlugins(token));
      setPlugins(result.plugins);
      setCoreVersion(result.coreVersion);
      setError('');
    } catch {
      setError(w.loadError);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedRequest]);

  async function scan() {
    setNotice('');
    setError('');
    try {
      const result = await authedRequest((token) => scanAdminPlugins(token));
      setPlugins(result.plugins);
      setCoreVersion(result.coreVersion);
      refreshBootstrap();
      const addedNote = result.added.length === 0 ? w.scanEmpty : w.scanAdded(result.added.length);
      setNotice(
        result.incompatible.length > 0
          ? `${addedNote} ${w.scanIncompatible(result.incompatible.length)}`
          : addedNote,
      );
    } catch {
      setError(w.scanError);
    }
  }

  async function toggle(plugin: AdminPlugin, enabled: boolean) {
    if (plugin.manifest.required) {
      setError(w.cannotDisableHome);
      return;
    }
    setNotice('');
    setError('');
    try {
      await authedRequest((token) => patchAdminPlugin(token, plugin.id, { enabled }));
      await reload();
      refreshBootstrap();
      setNotice(w.saved);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'plugin_incompatible'
          ? err.serverMessage || w.incompatibleCannotEnable
          : w.saveError,
      );
    }
  }

  return (
    <div className={styles.page}>
      <Seo title={w.pluginsNavLabel} description={w.pluginsNavDescription} path="/admin/plugins" />
      <h1 className={styles.title}>{w.pluginsNavLabel}</h1>
      <p className={styles.intro}>{w.pluginsIntro}</p>
      {coreVersion ? <p className={styles.hint}>{w.coreVersion(coreVersion)}</p> : null}
      <p className={styles.hint}>{w.dropInHint}</p>
      <p className={styles.hint}>{w.pageEnabledMenu}</p>
      <div className={styles.toolbar}>
        <Button type="button" onClick={() => void scan()}>
          {w.scan}
        </Button>
      </div>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <ul className={styles.list}>
        {plugins.map((plugin) => {
          const configureTo = pluginConfigurePath(plugin);
          const compatible = plugin.compatibility?.ok !== false;
          return (
          <li key={plugin.id} className={styles.row}>
            <div className={styles.rowMain}>
              <h2 className={styles.rowName}>{plugin.manifest.name}</h2>
              <div className={styles.rowMeta}>
                <span className={styles.badge}>{plugin.id}</span>
                <span className={styles.badge}>{kindText(plugin.manifest.kind, w)}</span>
                {plugin.manifest.version ? (
                  <span className={styles.badge}>
                    {w.version} {plugin.manifest.version}
                  </span>
                ) : null}
                {plugin.manifest.engines?.core ? (
                  <span className={styles.badge}>
                    {w.enginesCore} {plugin.manifest.engines.core}
                  </span>
                ) : null}
                <span className={styles.badge}>{plugin.enabled ? w.statusOn : w.statusOff}</span>
                {plugin.manifest.required ? <span className={styles.badge}>{w.required}</span> : null}
                {compatible ? null : <span className={`${styles.badge} ${styles.badgeDanger}`}>{w.incompatible}</span>}
              </div>
              {compatible ? null : (
                <p className={styles.rowError}>{plugin.compatibility?.errors.map((entry) => entry.message).join(' ')}</p>
              )}
            </div>
            <div className={styles.rowActions}>
              <ToggleSwitch
                checked={plugin.enabled}
                disabled={Boolean(plugin.manifest.required) || !compatible}
                aria-label={w.enabled}
                onChange={(checked) => void toggle(plugin, checked)}
              />
              {configureTo ? (
                <Button variant="ghost" to={configureTo}>
                  {w.configure}
                </Button>
              ) : null}
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function kindText(kind: string, w: ReturnType<typeof useAdminStrings>['whiteLabel']): string {
  if (kind === 'theme') return w.kindTheme;
  if (kind === 'page') return w.kindPage;
  if (kind === 'payment') return w.kindPayment;
  if (kind === 'shipping') return w.kindShipping;
  if (kind === 'commerce') return w.kindCommerce;
  if (kind === 'docs') return w.kindDocs;
  return w.kindGeneric;
}
