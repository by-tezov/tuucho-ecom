import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ApiError } from '../api/errors';
import {
  applyAdminPluginUpdates,
  checkAdminPluginUpdates,
  getAdminPluginUpdateStatus,
  getAdminPlugins,
  type AdminUpdateCheck,
  type AdminUpdateJob,
} from '../api/admin/shopSetup';
import { useAdminStrings } from '../assets/i18n/admin';
import { shopConfig } from '../config/env';
import { useAuthSession } from '../state/AuthContext';
import { withMinDuration } from '../utils/withMinDuration';
import { UpdateCheckPlanDetails, UpdateCheckResultModal, type CheckDialog } from './AdminUpdateCheckDialogs';
import { classifyUpdateCheck, coreLineCheckStatus, focusUpdateCheck } from './pluginUpdateCheck';
import styles from './AdminPlugins.module.css';

type InstallStatus = 'pending' | 'installing' | 'ok' | 'error';

function installProgress(items: Array<{ status: InstallStatus }>): number {
  const installing = items.findIndex((item) => item.status === 'installing');
  if (installing >= 0) return installing + 1;
  const finished = items.filter((item) => item.status === 'ok' || item.status === 'error').length;
  return Math.min(Math.max(finished, 1), items.length);
}

function installStatusLabel(status: InstallStatus, w: ReturnType<typeof useAdminStrings>['whiteLabel']): string {
  if (status === 'pending') return w.uploadItemWaiting;
  if (status === 'installing') return w.uploadItemInstalling;
  if (status === 'ok') return w.uploadItemDone;
  return w.uploadItemFailed;
}

function installItemClass(status: InstallStatus): string {
  if (status === 'installing') return `${styles.installItem} ${styles.installActive}`;
  if (status === 'ok') return `${styles.installItem} ${styles.installOk}`;
  if (status === 'error') return `${styles.installItem} ${styles.installError}`;
  return `${styles.installItem} ${styles.installPending}`;
}

/** Kernel Check for updates. Plugin diffs stay on the Plugins screen. */
export function AdminKernelUpdate() {
  const w = useAdminStrings().whiteLabel;
  const { authedRequest } = useAuthSession();
  const [coreVersion, setCoreVersion] = useState('');
  const [updateCheck, setUpdateCheck] = useState<AdminUpdateCheck | null>(null);
  const [updateJob, setUpdateJob] = useState<AdminUpdateJob | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkDialog, setCheckDialog] = useState<CheckDialog | null>(null);
  const [pendingApply, setPendingApply] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    void authedRequest((token) => getAdminPlugins(token))
      .then((result) => setCoreVersion(result.coreVersion))
      .catch(() => undefined);
  }, [authedRequest]);

  useEffect(() => {
    if (!updateJob || updateJob.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      void authedRequest((token) => getAdminPluginUpdateStatus(token))
        .then((result) => {
          if (!result.job) return;
          setUpdateJob(result.job);
          if (result.job.status === 'ok') {
            void authedRequest((token) => getAdminPlugins(token))
              .then((plugins) => setCoreVersion(plugins.coreVersion))
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
  }, [updateJob, authedRequest]);

  async function checkForUpdates() {
    if (checking) return;
    setApplyError('');
    setCheckDialog(null);
    setChecking(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => checkAdminPluginUpdates(token)),
        shopConfig.loadingMinMs.short,
      );
      const kernelOnly = focusUpdateCheck(result.check, 'kernel');
      setUpdateCheck(kernelOnly);
      setCoreVersion(kernelOnly.currentKernel || coreVersion);
      setCheckDialog({ type: 'checked', check: kernelOnly });
    } catch (err) {
      const message = err instanceof ApiError && err.serverMessage ? err.serverMessage : w.checkError;
      setCheckDialog({ type: 'failed', message });
    } finally {
      setChecking(false);
    }
  }

  async function startApply() {
    setApplyError('');
    setPendingApply(false);
    try {
      const result = await authedRequest((token) => applyAdminPluginUpdates(token, 'kernel'));
      setUpdateJob(result.job);
    } catch (err) {
      setApplyError(err instanceof ApiError && err.serverMessage ? err.serverMessage : w.applyFailed);
    }
  }

  const busy = checking || updateJob?.status === 'running';
  const status = updateCheck ? coreLineCheckStatus(updateCheck) : null;

  return (
    <div>
      <div className={styles.toolbar}>
        {coreVersion ? (
          <span className={styles.coreVersion}>
            {w.coreVersion(coreVersion)}
            {status
              ? ` · ${
                  {
                    ahead: w.updateAhead,
                    upToDate: w.updateUpToDate,
                    updateAvailable: w.updateAvailable,
                  }[status]
                }`
              : ''}
          </span>
        ) : null}
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void checkForUpdates()}>
          {w.checkUpdates}
        </Button>
      </div>
      {applyError ? <p className={styles.error}>{applyError}</p> : null}
      {updateCheck && classifyUpdateCheck(updateCheck).kind === 'plan' && !checkDialog ? (
        <div className={styles.updatePlan}>
          <UpdateCheckPlanDetails check={updateCheck} labels={w} />
          {updateCheck.canApplyOfficial ? (
            <Button type="button" disabled={busy} onClick={() => setPendingApply(true)}>
              {w.applyUpdates}
            </Button>
          ) : null}
        </div>
      ) : null}
      {checking ? <LoadingModal message={w.checkingUpdates} /> : null}
      {checkDialog && !checking ? (
        <UpdateCheckResultModal
          dialog={checkDialog}
          labels={w}
          onApply={() => {
            setCheckDialog(null);
            void startApply();
          }}
          onClose={() => setCheckDialog(null)}
        />
      ) : null}
      {updateJob && updateJob.status === 'running' ? (
        <LoadingModal message={w.applyingUpdates}>
          <p className={styles.installProgress}>
            {w.uploadProgress(installProgress(updateJob.log), Math.max(updateJob.log.length, 1))}
          </p>
          <ul className={styles.installList}>
            {updateJob.log.map((item, index) => (
              <li key={`${item.name}-${index}`} className={installItemClass(item.status)}>
                {item.name}: {installStatusLabel(item.status, w)}
                {item.message ? ` ${item.message}` : ''}
              </li>
            ))}
          </ul>
        </LoadingModal>
      ) : null}
      {updateJob && updateJob.status !== 'running' ? (
        <ConfirmModal
          variant="dialog"
          title={updateJob.status === 'ok' ? w.applyDone : w.applyFailed}
          message={
            <div>
              {updateJob.restartRequired ? <p className={styles.hint}>{w.updateRestart}</p> : null}
              <ul className={styles.installList}>
                {updateJob.log.map((item, index) => (
                  <li key={`${item.name}-${index}`} className={installItemClass(item.status)}>
                    {item.name}: {installStatusLabel(item.status, w)}
                    {item.message ? ` ${item.message}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          }
          confirmLabel={w.applyDismiss}
          closeIcon={false}
          onConfirm={() => setUpdateJob(null)}
          onCancel={() => setUpdateJob(null)}
        />
      ) : null}
      {pendingApply ? (
        <ConfirmModal
          variant="dialog"
          title={w.applyConfirmTitle}
          message={w.applyConfirmOfficial(updateCheck?.currentTag ?? '', updateCheck?.latestTag ?? '')}
          confirmLabel={w.applyConfirm}
          cancelLabel={w.applyCancel}
          onConfirm={() => void startApply()}
          onCancel={() => setPendingApply(false)}
        />
      ) : null}
    </div>
  );
}
