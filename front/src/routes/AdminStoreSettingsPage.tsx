import { useEffect, useState } from 'react';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { useAdminStrings } from '../assets/i18n/admin';
import { getAdminStore, patchAdminStore } from '../api/admin/shopSetup';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import styles from './AdminPlugins.module.css';

export function AdminStoreSettingsPage() {
  const w = useAdminStrings().whiteLabel;
  const { t } = useLang();
  const { authedRequest } = useAuthSession();
  const refreshBootstrap = useRefreshStorefrontBootstrap();
  const [store, setStore] = useState<Awaited<ReturnType<typeof getAdminStore>> | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    try {
      const result = await authedRequest((token) => getAdminStore(token));
      setStore(result);
      setError('');
    } catch {
      setError(w.loadError);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedRequest]);

  async function save(work: (token: string) => Promise<unknown>) {
    setNotice('');
    setError('');
    try {
      await authedRequest(work);
      await reload();
      refreshBootstrap();
      setNotice(w.saved);
    } catch {
      setError(w.saveError);
    }
  }

  return (
    <div className={styles.page}>
      <Seo title={w.boutiqueNavLabel} description={w.boutiqueNavDescription} path="/admin/shop" />
      <h1 className={styles.title}>{w.boutiqueNavLabel}</h1>
      <p className={styles.intro}>{w.storeIntro}</p>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {store ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{w.tabStore}</h2>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{w.storeName}</span>
                <input
                  value={store.identity.name}
                  onChange={(event) =>
                    setStore({ ...store, identity: { ...store.identity, name: event.target.value } })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{w.storeSuffix}</span>
                <input
                  value={store.identity.suffix}
                  onChange={(event) =>
                    setStore({ ...store, identity: { ...store.identity, suffix: event.target.value } })
                  }
                />
              </label>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{w.taxMode}</span>
                <p className={styles.hint}>{w.taxNone}</p>
              </div>
            </div>
            <div className={styles.toolbar}>
              <Button
                type="button"
                onClick={() =>
                  void save((token) =>
                    patchAdminStore(token, {
                      identity: { name: store.identity.name, suffix: store.identity.suffix },
                    }),
                  )
                }
              >
                {w.saveAction}
              </Button>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{w.axesIntro}</h2>
            {store.axes.map((axis, index) => (
              <div key={axis.key} className={styles.axisCard}>
                <h3 className={styles.axisHead}>{axisTitle(axis.key, t)}</h3>
                <div className={styles.toggle}>
                  <span className={styles.toggleLabel}>{w.axisVisible}</span>
                  <ToggleSwitch
                    checked={!axis.hideInUi}
                    aria-label={w.axisVisible}
                    onChange={(checked) => {
                      const axes = store.axes.map((entry, i) =>
                        i === index ? { ...entry, hideInUi: !checked, enabled: checked || entry.enabled } : entry,
                      );
                      setStore({ ...store, axes });
                      void save((token) => patchAdminStore(token, { axes }));
                    }}
                  />
                </div>
                <div className={styles.toggle}>
                  <span className={styles.toggleLabel}>{w.axisHideSingle}</span>
                  <ToggleSwitch
                    checked={axis.autoHideSingle}
                    aria-label={w.axisHideSingle}
                    onChange={(checked) => {
                      const axes = store.axes.map((entry, i) =>
                        i === index ? { ...entry, autoHideSingle: checked } : entry,
                      );
                      setStore({ ...store, axes });
                      void save((token) => patchAdminStore(token, { axes }));
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}

function axisTitle(key: string, t: ReturnType<typeof useLang>['t']): string {
  if (key === 'shape') return t.product.shapeLabel;
  if (key === 'length') return t.product.lengthLabel;
  if (key === 'size') return t.gallery.sizeLabel;
  return key;
}
