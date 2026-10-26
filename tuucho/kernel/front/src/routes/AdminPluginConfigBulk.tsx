import { useState } from 'react';
import {
  applyAllAdminPluginConfigFiles,
  exportAllAdminPluginConfigFiles,
  importAllAdminPluginConfigFiles,
  type PluginConfigBulkReport,
} from '../api/admin/shopSetup';
import { shopConfig } from '../config/env';
import { withMinDuration } from '../utils/withMinDuration';
import { useAuthSession } from '../state/AuthContext';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';
import type { AdminAccess } from '../api/admin/roles';
import { useAdminStrings } from '../assets/i18n/admin';
import { useLang } from '../state/LanguageContext';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { FileField } from '../components/ui/FileField';
import { FormSection } from '../components/ui/FormSection';
import { LoadingModal } from '../components/ui/LoadingModal';
import styles from './AdminPlugins.module.css';

export function pluginConfigBulkActions(access: AdminAccess): {
  showChrome: boolean;
  showUpdate: boolean;
  showImport: boolean;
  showExport: boolean;
} {
  const showUpdate = canAccess(access, 'plugin_config_import');
  const showImport = canAccess(access, 'plugin_config_import');
  const showExport = canAccess(access, 'plugin_config_export');
  return {
    showChrome: showUpdate || showImport || showExport,
    showUpdate,
    showImport,
    showExport,
  };
}

export function AdminPluginConfigBulk({
  busy: parentBusy,
  onNotice,
  onError,
}: {
  busy?: boolean | undefined;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const access = useAdminAccess();
  const { authedRequest } = useAuthSession();
  const { t } = useLang();
  const w = useAdminStrings().whiteLabel;
  const actions = pluginConfigBulkActions(access);
  const [pending, setPending] = useState<'update' | 'export' | 'import' | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (!actions.showChrome) return null;

  function summarize(report: PluginConfigBulkReport): string {
    return w.configFilesBulkReport(report.applied.length, report.skipped.length, report.blocked.length);
  }

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    onError('');
    try {
      return await withMinDuration(work(), shopConfig.loadingMinMs.short);
    } catch {
      onError(w.configFilesError);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || parentBusy === true;

  return (
    <FormSection title={w.configFilesBulkTitle} description={w.configFilesBulkHint}>
      <div className={styles.toolbar}>
        {actions.showUpdate ? (
          <Button type="button" variant="secondary" disabled={locked} onClick={() => setPending('update')}>
            {w.configFilesUpdateAll}
          </Button>
        ) : null}
        {actions.showExport ? (
          <Button type="button" variant="secondary" disabled={locked} onClick={() => setPending('export')}>
            {w.configFilesExportAll}
          </Button>
        ) : null}
      </div>
      {actions.showImport ? (
        <FileField
          label={w.configFilesImportAll}
          description={w.configFilesImportAllHint}
          accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
          disabled={locked}
          onFiles={(list) => {
            const file = list[0];
            if (file) {
              setImportFile(file);
              setPending('import');
            }
          }}
        />
      ) : null}
      {pending === 'update' ? (
        <ConfirmModal
          title={w.configFilesUpdateAll}
          message={w.configFilesUpdateAllConfirm}
          confirmLabel={w.configFilesUpdateAll}
          closeLabel={w.uninstallCancel}
          onConfirm={() => {
            setPending(null);
            void run(() => authedRequest((token) => applyAllAdminPluginConfigFiles(token))).then((report) => {
              if (report) onNotice(summarize(report));
            });
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {pending === 'export' ? (
        <ConfirmModal
          title={w.configFilesExportAll}
          message={w.configFilesExportAllConfirm}
          confirmLabel={w.configFilesExportAll}
          closeLabel={w.uninstallCancel}
          confirmDanger
          onConfirm={() => {
            setPending(null);
            void run(() => authedRequest((token) => exportAllAdminPluginConfigFiles(token)));
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {pending === 'import' && importFile ? (
        <ConfirmModal
          title={w.configFilesImportAll}
          message={w.configFilesImportAllHint}
          confirmLabel={w.configFilesImportAll}
          closeLabel={w.uninstallCancel}
          confirmDanger
          onConfirm={() => {
            const file = importFile;
            setPending(null);
            setImportFile(null);
            void run(() => authedRequest((token) => importAllAdminPluginConfigFiles(token, file))).then(
              (report) => {
                if (report) onNotice(summarize(report));
              },
            );
          }}
          onCancel={() => {
            setPending(null);
            setImportFile(null);
          }}
        />
      ) : null}
      {busy ? <LoadingModal message={t.admin.contentLoading} /> : null}
    </FormSection>
  );
}
