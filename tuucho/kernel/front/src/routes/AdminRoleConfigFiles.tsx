import { useEffect, useState } from 'react';
import {
  applyRoleConfig,
  exportRoleConfig,
  getRoleConfigStatus,
  importRoleConfig,
} from '../api/admin/diskConfig';
import { useAdminStrings } from '../assets/i18n/admin';
import { useAuthSession } from '../state/AuthContext';
import { AdminDiskConfigBar } from './AdminDiskConfigBar';

export function AdminRoleConfigFiles({ onApplied }: { onApplied: () => void }) {
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const [present, setPresent] = useState(false);
  const [differ, setDiffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function reloadStatus() {
    const status = await authedRequest((token) => getRoleConfigStatus(token));
    setPresent(status.present);
    setDiffer(status.differ);
  }

  useEffect(() => {
    void reloadStatus().catch(() => setError(a.whiteLabel.configFilesError));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedRequest]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch {
      setError(a.whiteLabel.configFilesError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDiskConfigBar
      title={a.whiteLabel.configFilesTitle}
      hint={a.roles.configHint}
      present={present}
      differ={differ}
      busy={busy}
      error={error}
      onUpdate={() =>
        void run(async () => {
          const status = await authedRequest((token) => applyRoleConfig(token));
          setPresent(status.present);
          setDiffer(status.differ);
          onApplied();
        })
      }
      onExport={() => void run(() => authedRequest((token) => exportRoleConfig(token)))}
      onImportText={(name, text) =>
        void run(async () => {
          const status = await authedRequest((token) => importRoleConfig(token, name, text));
          setPresent(status.present);
          setDiffer(status.differ);
          onApplied();
        })
      }
    />
  );
}
