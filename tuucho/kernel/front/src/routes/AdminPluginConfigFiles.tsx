import { useState } from 'react';
import {
  applyAdminPluginConfigFiles,
  exportAdminPluginConfigFiles,
  importAdminPluginConfigArchive,
  importAdminPluginConfigFiles,
  type AdminPlugin,
} from '../api/admin/shopSetup';
import { useAuthSession } from '../state/AuthContext';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';
import type { AdminAccess } from '../api/admin/roles';
import { useAdminStrings } from '../assets/i18n/admin';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DocsCallout } from '../components/ui/docs/DocsCallout';
import { FileField } from '../components/ui/FileField';
import { FormSection } from '../components/ui/FormSection';
import styles from './AdminPlugins.module.css';

function isConfigArchive(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || name.endsWith('.tgz') || name.endsWith('.tar.gz');
}

export function pluginConfigFilesActions(
  schema: Record<string, unknown> | undefined,
  access: AdminAccess,
  filesPresent: boolean,
): { showChrome: boolean; showUpdate: boolean; showImport: boolean; showExport: boolean } {
  if (Object.keys(schema ?? {}).length === 0) {
    return { showChrome: false, showUpdate: false, showImport: false, showExport: false };
  }
  const canImport = canAccess(access, 'plugin_config_import');
  const canExport = canAccess(access, 'plugin_config_export');
  return {
    showChrome: true,
    showUpdate: canImport && filesPresent,
    showImport: canImport,
    showExport: canExport,
  };
}

export function AdminPluginConfigFiles({
  plugin,
  onReloaded,
}: {
  plugin: AdminPlugin;
  onReloaded: (next: AdminPlugin) => void;
}) {
  const access = useAdminAccess();
  const { authedRequest } = useAuthSession();
  const w = useAdminStrings().whiteLabel;
  const files = plugin.configFiles;
  const actions = pluginConfigFilesActions(
    plugin.manifest.settingsSchema,
    access,
    files?.present === true,
  );
  const [pendingApply, setPendingApply] = useState(false);
  const [pendingExport, setPendingExport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!actions.showChrome) return null;

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError('');
    try {
      return await work();
    } catch {
      setError(w.configFilesError);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function applyFromDisk() {
    const result = await run(() => authedRequest((token) => applyAdminPluginConfigFiles(token, plugin.id)));
    if (result?.plugin) onReloaded(result.plugin);
  }

  async function exportFiles() {
    await run(() => authedRequest((token) => exportAdminPluginConfigFiles(token, plugin.id)));
  }

  async function importPicked(list: File[]) {
    if (list.length === 0) return;
    const archive = list.find(isConfigArchive);
    const result = archive
      ? await run(() => authedRequest((token) => importAdminPluginConfigArchive(token, plugin.id, archive)))
      : await run(async () => {
          const filesPayload = await Promise.all(
            list.map(async (file) => ({ name: file.name, text: await file.text() })),
          );
          return authedRequest((token) => importAdminPluginConfigFiles(token, plugin.id, filesPayload));
        });
    if (result?.plugin) onReloaded(result.plugin);
  }

  return (
    <FormSection title={w.configFilesTitle} description={w.configFilesHint}>
      {files?.present && files.differ ? (
        <DocsCallout tone="warning">{w.configFilesDiffer}</DocsCallout>
      ) : null}
      {!files?.present ? <DocsCallout tone="info">{w.configFilesMissing}</DocsCallout> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        {actions.showUpdate ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setPendingApply(true)}>
            {w.configFilesUpdate}
          </Button>
        ) : null}
        {actions.showExport ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setPendingExport(true)}>
            {w.configFilesExport}
          </Button>
        ) : null}
      </div>
      {actions.showImport ? (
        <FileField
          label={w.configFilesImport}
          description={w.configFilesImportHint}
          accept="application/json,.json,.zip,.tgz,.tar.gz,application/zip,application/gzip"
          multiple
          disabled={busy}
          onFiles={(list) => void importPicked(list)}
        />
      ) : null}
      {pendingApply ? (
        <ConfirmModal
          title={w.configFilesUpdate}
          message={w.configFilesUpdateConfirm}
          confirmLabel={w.configFilesUpdate}
          closeLabel={w.uninstallCancel}
          onConfirm={() => {
            setPendingApply(false);
            void applyFromDisk();
          }}
          onCancel={() => setPendingApply(false)}
        />
      ) : null}
      {pendingExport ? (
        <ConfirmModal
          title={w.configFilesExport}
          message={w.configFilesExportConfirm}
          confirmLabel={w.configFilesExport}
          closeLabel={w.uninstallCancel}
          confirmDanger
          onConfirm={() => {
            setPendingExport(false);
            void exportFiles();
          }}
          onCancel={() => setPendingExport(false)}
        />
      ) : null}
    </FormSection>
  );
}
