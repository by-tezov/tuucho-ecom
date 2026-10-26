import { useEffect, useState } from 'react';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { TextareaField } from '../components/ui/TextareaField';
import {
  applyCoreConfig,
  exportCoreConfig,
  getCoreConfig,
  importCoreConfig,
  saveCoreConfig,
} from '../api/admin/diskConfig';
import { useAdminStrings } from '../assets/i18n/admin';
import { useAuthSession } from '../state/AuthContext';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';
import { adminPath } from '../utils/adminRoute';
import { AdminDiskConfigBar } from './AdminDiskConfigBar';
import { AdminGithubAccess } from './AdminGithubAccess';
import { AdminKernelLocales } from './AdminKernelLocales';
import { AdminKernelUpdate } from './AdminKernelUpdate';
import styles from './AdminPlugins.module.css';

export function AdminCoreSettingsPage() {
  const a = useAdminStrings();
  const c = a.core;
  const access = useAdminAccess();
  const canImport = canAccess(access, 'plugin_config_import');
  const { authedRequest } = useAuthSession();
  const [text, setText] = useState('');
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void authedRequest((token) => getCoreConfig(token))
      .then((result) => {
        setText(result.text);
        setPresent(result.present);
      })
      .catch(() => setError(c.loadError));
  }, [authedRequest, c.loadError]);

  async function run(work: () => Promise<{ text: string; present: boolean } | void>) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await work();
      if (result && 'text' in result) {
        setText(result.text);
        setPresent(result.present);
      }
    } catch {
      setError(c.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <Seo title={c.title} description={c.navDescription} path={adminPath('/core')} noindex />
      <h1 className={styles.title}>{c.title}</h1>
      <p className={styles.intro}>{c.intro}</p>
      <AdminGithubAccess />
      <AdminKernelUpdate />
      <AdminKernelLocales />
      <AdminDiskConfigBar
        title={a.whiteLabel.configFilesTitle}
        hint={c.filesHint}
        present={present}
        differ={false}
        busy={busy}
        error={error}
        onUpdate={() => void run(() => authedRequest((token) => applyCoreConfig(token)))}
        onExport={() => void run(() => authedRequest((token) => exportCoreConfig(token)))}
        onImportText={(_name, body) =>
          void run(() => authedRequest((token) => importCoreConfig(token, body)))
        }
      />
      <Field label={c.jsonLabel} htmlFor="core-config-json">
        <TextareaField
          id="core-config-json"
          value={text}
          onChange={setText}
          size="long"
          spellCheck={false}
          rows={22}
        />
      </Field>
      {canImport ? (
        <div className={styles.toolbar}>
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await authedRequest((token) => saveCoreConfig(token, text));
                setSaved(true);
                return result;
              })
            }
          >
            {c.save}
          </Button>
        </div>
      ) : null}
      {saved ? <p className={styles.notice}>{c.saved}</p> : null}
    </div>
  );
}
