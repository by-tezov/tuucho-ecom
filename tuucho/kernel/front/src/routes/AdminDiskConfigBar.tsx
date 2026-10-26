import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { DocsCallout } from '../components/ui/docs/DocsCallout';
import { FileField } from '../components/ui/FileField';
import { FormSection } from '../components/ui/FormSection';
import { useAdminStrings } from '../assets/i18n/admin';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';
import styles from './AdminPlugins.module.css';

export function AdminDiskConfigBar({
  title,
  hint,
  present,
  differ,
  busy,
  error,
  onUpdate,
  onExport,
  onImportText,
}: {
  title: string;
  hint: string;
  present: boolean;
  differ: boolean;
  busy: boolean;
  error: string;
  onUpdate: () => void;
  onExport: () => void;
  onImportText: (name: string, text: string) => void;
}) {
  const access = useAdminAccess();
  const w = useAdminStrings().whiteLabel;
  const canImport = canAccess(access, 'plugin_config_import');
  const canExport = canAccess(access, 'plugin_config_export');
  const [pendingApply, setPendingApply] = useState(false);
  const [pendingExport, setPendingExport] = useState(false);

  return (
    <FormSection title={title} description={hint}>
      {present && differ ? <DocsCallout tone="warning">{w.configFilesDiffer}</DocsCallout> : null}
      {!present ? <DocsCallout tone="info">{w.configFilesMissing}</DocsCallout> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.toolbar}>
        {canImport && present ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setPendingApply(true)}>
            {w.configFilesUpdate}
          </Button>
        ) : null}
        {canExport ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setPendingExport(true)}>
            {w.configFilesExport}
          </Button>
        ) : null}
      </div>
      {canImport ? (
        <FileField
          label={w.configFilesImport}
          description={w.configFilesImportHint}
          accept="application/json,.json"
          disabled={busy}
          onFiles={(list) => {
            const file = list[0];
            if (!file) return;
            void file.text().then((text) => onImportText(file.name, text));
          }}
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
            onUpdate();
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
            onExport();
          }}
          onCancel={() => setPendingExport(false)}
        />
      ) : null}
    </FormSection>
  );
}
