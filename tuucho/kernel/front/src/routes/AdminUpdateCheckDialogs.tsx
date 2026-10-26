import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useAdminStrings } from '../assets/i18n/admin';
import type { AdminUpdateCheck } from '../api/admin/shopSetup';
import { classifyUpdateCheck, latestTagLabel } from './pluginUpdateCheck';
import styles from './AdminPlugins.module.css';

type WhiteLabel = ReturnType<typeof useAdminStrings>['whiteLabel'];

export type CheckDialog =
  | { type: 'failed'; message: string }
  | { type: 'checked'; check: AdminUpdateCheck };

export function UpdateCheckPlanDetails({ check, labels: w }: { check: AdminUpdateCheck; labels: WhiteLabel }) {
  const latest = latestTagLabel(check, w.checkLatestUnknown);
  return (
    <div className={styles.checkDialogPlan}>
      <p className={styles.updatePath}>{w.checkTagsLine(check.currentTag, latest)}</p>
      {check.officialRefuse ? <p className={styles.error}>{check.officialRefuse}</p> : null}
      {check.dirtyPaths.length > 0 && (check.kernel || check.plugins.length > 0) ? (
        <p className={styles.error}>{w.updateDirty}</p>
      ) : null}
      {check.tagPath.length > 0 ? (
        <p className={styles.updatePath}>
          {w.updateTagPath}: {[check.currentTag, ...check.tagPath].join(' to ')}
        </p>
      ) : null}
      {check.kernel ? <p className={styles.hint}>{w.updateKernelLine(check.kernel.from, check.kernel.to)}</p> : null}
      {check.plugins.map((plugin) => (
        <p key={plugin.id} className={styles.hint}>
          {w.updatePluginLine(plugin.id, plugin.from, plugin.to)}
        </p>
      ))}
      {check.userPlugins.map((row) => (
        <p key={row.id} className={row.error ? styles.error : styles.hint}>
          {row.error
            ? `${row.id}: ${row.error}`
            : `${w.updatePluginLine(row.id, row.from, row.to)}${row.changelog ? ` ${row.changelog}` : ''}`}
        </p>
      ))}
    </div>
  );
}

export function UpdateCheckResultModal({
  dialog,
  labels: w,
  onApply,
  onClose,
}: {
  dialog: CheckDialog;
  labels: WhiteLabel;
  onApply: () => void;
  onClose: () => void;
}) {
  if (dialog.type === 'failed') {
    return (
      <ConfirmModal
        variant="dialog"
        title={w.checkError}
        message={dialog.message}
        confirmLabel={w.applyDismiss}
        closeIcon={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  const classified = classifyUpdateCheck(dialog.check);
  const tagsLine = w.checkTagsLine(dialog.check.currentTag, latestTagLabel(dialog.check, w.checkLatestUnknown));
  if (classified.kind === 'ahead') {
    return (
      <ConfirmModal
        variant="dialog"
        title={w.checkAheadTitle}
        message={`${tagsLine} ${w.checkAheadHint}`}
        confirmLabel={w.applyDismiss}
        closeIcon={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }
  if (classified.kind === 'nothing') {
    return (
      <ConfirmModal
        variant="dialog"
        title={w.checkNothingTitle}
        message={tagsLine}
        confirmLabel={w.applyDismiss}
        closeIcon={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  if (classified.kind === 'error' || !classified.canApplyOfficial) {
    return (
      <ConfirmModal
        variant="dialog"
        title={classified.kind === 'error' ? w.checkError : w.checkResultTitle}
        message={<UpdateCheckPlanDetails check={dialog.check} labels={w} />}
        confirmLabel={w.applyDismiss}
        closeIcon={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  return (
    <ConfirmModal
      variant="dialog"
      title={w.applyConfirmTitle}
      message={<UpdateCheckPlanDetails check={dialog.check} labels={w} />}
      confirmLabel={w.applyConfirm}
      cancelLabel={w.applyDismiss}
      onConfirm={onApply}
      onCancel={onClose}
    />
  );
}
