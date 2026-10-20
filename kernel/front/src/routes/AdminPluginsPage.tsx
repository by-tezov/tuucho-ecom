import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { SegmentedSwitch } from '../components/ui/SegmentedSwitch';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useAuthSession } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useAdminStrings } from '../assets/i18n/admin';
import { ApiError } from '../api/errors';
import { shopConfig } from '../config/env';
import { withMinDuration } from '../utils/withMinDuration';
import {
  applyAdminPluginUpdates,
  checkAdminPluginUpdates,
  getAdminPluginUpdateStatus,
  getAdminPlugins,
  patchAdminPlugin,
  scanAdminPlugins,
  uninstallAdminPlugin,
  uploadAdminPlugin,
  type AdminPlugin,
  type AdminUpdateCheck,
  type AdminUpdateJob,
  type UpdateScope,
} from '../api/admin/shopSetup';
import { useRefreshStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { adminPath } from '../utils/adminRoute';
import { pluginConfigurePath } from './pluginConfigure';
import {
  filterPluginGroups,
  groupAdminPlugins,
  groupLocaleSearchHit,
  type PluginOriginFilter,
  type PluginStatusFilter,
} from './pluginListGroups';
import { classifyUpdateCheck, coreLineCheckStatus, latestTagLabel } from './pluginUpdateCheck';
import styles from './AdminPlugins.module.css';

type CheckDialog =
  | { type: 'failed'; message: string }
  | { type: 'checked'; check: AdminUpdateCheck };

type InstallStatus = 'pending' | 'installing' | 'ok' | 'error';

type InstallItem = {
  name: string;
  status: InstallStatus;
  message?: string;
};

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AdminPluginsPage() {
  const w = useAdminStrings().whiteLabel;
  const { authedRequest } = useAuthSession();
  const toast = useToast();
  const refreshBootstrap = useRefreshStorefrontBootstrap();
  const [plugins, setPlugins] = useState<AdminPlugin[]>([]);
  const [coreVersion, setCoreVersion] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<PluginOriginFilter>('tuucho');
  const [status, setStatus] = useState<PluginStatusFilter>('all');
  const [pendingUninstall, setPendingUninstall] = useState<AdminPlugin | null>(null);
  const [installItems, setInstallItems] = useState<InstallItem[] | null>(null);
  const [updateCheck, setUpdateCheck] = useState<AdminUpdateCheck | null>(null);
  const [updateScope, setUpdateScope] = useState<UpdateScope>('all');
  const [pendingApply, setPendingApply] = useState<{ scope: UpdateScope; pluginId?: string } | null>(null);
  const [updateJob, setUpdateJob] = useState<AdminUpdateJob | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [checkDialog, setCheckDialog] = useState<CheckDialog | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const installing = Boolean(installItems) || Boolean(updateJob) || checkingUpdates;

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

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), shopConfig.noticeMs);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!updateJob || updateJob.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      void authedRequest((token) => getAdminPluginUpdateStatus(token))
        .then((result) => {
          if (!result.job) return;
          setUpdateJob(result.job);
          if (result.job.status !== 'running') {
            void reload();
            refreshBootstrap();
            setNotice(
              result.job.status === 'ok'
                ? result.job.restartRequired
                  ? `${w.applyDone} ${w.updateRestart}`
                  : w.applyDone
                : w.applyFailed,
            );
            if (result.job.status === 'error') setError(result.job.error ?? w.applyFailed);
          }
        })
        .catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is recreated each render
  }, [updateJob, authedRequest, refreshBootstrap, w.applyDone, w.applyFailed, w.updateRestart]);

  async function checkForUpdates() {
    if (checkingUpdates) return;
    setNotice('');
    setError('');
    setCheckDialog(null);
    setCheckingUpdates(true);
    try {
      const result = await withMinDuration(
        authedRequest((token) => checkAdminPluginUpdates(token)),
        shopConfig.loadingMinMs.short,
      );
      setUpdateCheck(result.check);
      setCheckDialog({ type: 'checked', check: result.check });
    } catch (err) {
      const message = err instanceof ApiError && err.serverMessage ? err.serverMessage : w.checkError;
      setCheckDialog({ type: 'failed', message });
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function startApply(scope: UpdateScope, pluginId?: string) {
    setNotice('');
    setError('');
    setPendingApply(null);
    try {
      const result = await authedRequest((token) => applyAdminPluginUpdates(token, scope, pluginId));
      setUpdateJob(result.job);
    } catch (err) {
      setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : w.applyFailed);
    }
  }

  async function uploadFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setNotice('');
    setError('');
    setInstallItems(files.map((file) => ({ name: file.name, status: 'pending' as const })));
    let ok = 0;
    const failures: string[] = [];
    try {
      await withMinDuration(
        (async () => {
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index]!;
            setInstallItems((current) =>
              current?.map((item, itemIndex) =>
                itemIndex === index ? { ...item, status: 'installing' } : item,
              ) ?? null,
            );
            try {
              await authedRequest((token) => uploadAdminPlugin(token, file));
              ok += 1;
              setInstallItems((current) =>
                current?.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, status: 'ok' } : item,
                ) ?? null,
              );
            } catch (err) {
              const message =
                err instanceof ApiError && err.serverMessage ? err.serverMessage : w.uploadError;
              failures.push(`${file.name}: ${message}`);
              setInstallItems((current) =>
                current?.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, status: 'error', message } : item,
                ) ?? null,
              );
            }
          }
          await reload();
          refreshBootstrap();
        })(),
        shopConfig.loadingMinMs.normal,
      );
      if (failures.length === 0) {
        setNotice(ok === 1 ? w.uploadSuccess : w.uploadBatchSuccess(ok));
      } else {
        setError(failures.join(' '));
        if (ok > 0) setNotice(w.uploadBatchPartial(ok, failures.length));
      }
    } catch {
      setError(w.uploadError);
    } finally {
      setInstallItems(null);
    }
  }

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

  async function uninstall(plugin: AdminPlugin) {
    if (plugin.manifest.required) {
      setPendingUninstall(null);
      setError(w.cannotUninstallRequired);
      return;
    }
    setNotice('');
    setError('');
    try {
      await authedRequest((token) => uninstallAdminPlugin(token, plugin.id));
      setPendingUninstall(null);
      await reload();
      refreshBootstrap();
      toast(w.uninstalled);
    } catch (err) {
      setPendingUninstall(null);
      setError(
        err instanceof ApiError && err.code === 'plugin_required'
          ? w.cannotUninstallRequired
          : w.uninstallError,
      );
    }
  }

  const groups = useMemo(
    () => filterPluginGroups(groupAdminPlugins(plugins), search, origin, status),
    [plugins, search, origin, status],
  );
  const [openLocales, setOpenLocales] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenLocales(
      new Set(groups.filter((group) => groupLocaleSearchHit(group, search)).map((group) => group.parent.id)),
    );
  }, [groups, search]);

  function askUninstall(plugin: AdminPlugin) {
    setPendingUninstall(plugin);
    setNotice('');
    setError('');
  }

  return (
    <div className={styles.page}>
      <Seo title={w.pluginsNavLabel} description={w.pluginsNavDescription} path={adminPath('/plugins')} />
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{w.pluginsNavLabel}</h1>
        {coreVersion ? (
          <span className={styles.coreVersion}>
            {w.coreVersion(coreVersion)}
            {updateCheck
              ? ` · ${
                  {
                    ahead: w.updateAhead,
                    upToDate: w.updateUpToDate,
                    updateAvailable: w.updateAvailable,
                  }[coreLineCheckStatus(updateCheck)]
                }`
              : ''}
          </span>
        ) : null}
      </div>
      <div className={styles.toolbar}>
        <Button type="button" disabled={installing} onClick={() => void scan()}>
          {w.scan}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={installing}
          onClick={() => uploadInputRef.current?.click()}
        >
          {w.uploadArchive}
        </Button>
        <Button type="button" variant="secondary" disabled={installing} onClick={() => void checkForUpdates()}>
          {w.checkUpdates}
        </Button>
        <input
          ref={uploadInputRef}
          className="visuallyHidden"
          type="file"
          accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = event.target.files;
            event.target.value = '';
            if (files && files.length > 0) void uploadFiles(files);
          }}
        />
      </div>
      <div className={styles.filters}>
        <SegmentedSwitch
          className={styles.originSwitch ?? ''}
          ariaLabel={w.originAria}
          activeKey={origin}
          onSelect={(key) => {
            setNotice('');
            setOrigin(key as PluginOriginFilter);
          }}
          options={[
            { key: 'tuucho', label: w.originTuucho },
            { key: 'user', label: w.originUser },
          ]}
        />
        <SegmentedSwitch
          className={styles.statusSwitch ?? ''}
          ariaLabel={w.statusFilterAria}
          activeKey={status}
          onSelect={(key) => {
            setNotice('');
            setStatus(key as PluginStatusFilter);
          }}
          options={[
            { key: 'all', label: w.statusAll },
            { key: 'enabled', label: w.statusEnabled },
            { key: 'disabled', label: w.statusDisabled },
          ]}
        />
      </div>
      <label className={styles.searchField}>
        <span>{w.searchLabel}</span>
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setNotice('');
            setSearch(event.target.value);
          }}
          placeholder={w.searchPlaceholder}
          autoComplete="off"
        />
      </label>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {updateCheck && classifyUpdateCheck(updateCheck).kind === 'plan' && !checkDialog ? (
        <div className={styles.updatePlan}>
          <UpdateCheckPlanDetails
            check={updateCheck}
            labels={w}
            showScope={updateCheck.canApplyOfficial}
            updateScope={updateScope}
            onScope={setUpdateScope}
          />
          {updateCheck.canApplyOfficial ? (
            <Button
              type="button"
              disabled={installing}
              onClick={() => setPendingApply({ scope: updateScope === 'plugin' ? 'all' : updateScope })}
            >
              {w.applyUpdates}
            </Button>
          ) : null}
        </div>
      ) : null}
      {groups.length === 0 ? <p className={styles.hint}>{w.searchEmpty}</p> : null}
      <ul className={styles.list}>
        {groups.map((group) => (
          <li key={group.parent.id} className={styles.group}>
            <PluginRow
              plugin={group.parent}
              labels={w}
              updateCheck={updateCheck}
              installing={installing}
              onToggle={toggle}
              onAskUninstall={askUninstall}
              onApplyPlugin={(plugin) =>
                setPendingApply({
                  scope: 'plugin',
                  pluginId: plugin.id,
                })
              }
            />
            {group.locales.length > 0 ? (
              <details
                className={styles.localeDetails}
                open={openLocales.has(group.parent.id)}
                onToggle={(event) => {
                  const id = group.parent.id;
                  const nextOpen = event.currentTarget.open;
                  setOpenLocales((current) => {
                    const next = new Set(current);
                    if (nextOpen) next.add(id);
                    else next.delete(id);
                    return next;
                  });
                }}
              >
                <summary className={styles.localeSummary}>
                  {w.localeComplements(group.locales.length)}
                </summary>
                <ul className={styles.localeList}>
                  {group.locales.map((plugin) => (
                    <li key={plugin.id}>
                      <hr className={styles.localeSeparator} aria-hidden="true" />
                      <PluginRow
                        plugin={plugin}
                        nested
                        labels={w}
                        updateCheck={updateCheck}
                        installing={installing}
                        onToggle={toggle}
                        onAskUninstall={askUninstall}
                        onApplyPlugin={(entry) =>
                          setPendingApply({
                            scope: 'plugin',
                            pluginId: entry.id,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      {checkingUpdates ? <LoadingModal message={w.checkingUpdates} /> : null}
      {checkDialog && !checkingUpdates ? (
        <UpdateCheckResultModal
          dialog={checkDialog}
          labels={w}
          updateScope={updateScope}
          onScope={setUpdateScope}
          onApply={() => {
            if (checkDialog.type !== 'checked') return;
            const scope = updateScope === 'plugin' ? 'all' : updateScope;
            setCheckDialog(null);
            void startApply(scope);
          }}
          onClose={() => setCheckDialog(null)}
        />
      ) : null}
      {installItems ? (
        <LoadingModal message={w.uploadInstalling}>
          <p className={styles.installProgress}>
            {w.uploadProgress(installProgress(installItems), installItems.length)}
          </p>
          <ul className={styles.installList}>
            {installItems.map((item, index) => (
              <li key={`${item.name}-${index}`} className={installItemClass(item.status)}>
                {item.name}: {installStatusLabel(item.status, w)}
                {item.message ? ` ${item.message}` : ''}
              </li>
            ))}
          </ul>
        </LoadingModal>
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
          message={
            pendingApply.pluginId
              ? w.applyConfirmPlugin(
                  plugins.find((plugin) => plugin.id === pendingApply.pluginId)?.manifest.name ?? pendingApply.pluginId,
                  updateCheck?.userPlugins.find((row) => row.id === pendingApply.pluginId)?.from ??
                    plugins.find((plugin) => plugin.id === pendingApply.pluginId)?.manifest.version ??
                    '',
                  updateCheck?.userPlugins.find((row) => row.id === pendingApply.pluginId)?.to ??
                    updateCheck?.plugins.find((row) => row.id === pendingApply.pluginId)?.to ??
                    '',
                )
              : w.applyConfirmOfficial(updateCheck?.currentTag ?? '', updateCheck?.latestTag ?? '')
          }
          confirmLabel={w.applyConfirm}
          cancelLabel={w.applyCancel}
          onConfirm={() => void startApply(pendingApply.scope, pendingApply.pluginId)}
          onCancel={() => setPendingApply(null)}
        />
      ) : null}
      {pendingUninstall ? (
        <ConfirmModal
          variant="dialog"
          title={w.uninstallTitle}
          message={w.uninstallMessage(pendingUninstall.manifest.name)}
          confirmLabel={w.uninstallConfirm}
          cancelLabel={w.uninstallCancel}
          confirmDanger
          onConfirm={() => void uninstall(pendingUninstall)}
          onCancel={() => setPendingUninstall(null)}
        />
      ) : null}
    </div>
  );
}

type WhiteLabel = ReturnType<typeof useAdminStrings>['whiteLabel'];

function UpdateCheckPlanDetails({
  check,
  labels: w,
  showScope,
  updateScope,
  onScope,
}: {
  check: AdminUpdateCheck;
  labels: WhiteLabel;
  showScope?: boolean;
  updateScope?: UpdateScope;
  onScope?: (scope: UpdateScope) => void;
}) {
  const latest = latestTagLabel(check, w.checkLatestUnknown);
  return (
    <div className={styles.checkDialogPlan}>
      <p className={styles.updatePath}>{w.checkTagsLine(check.currentTag, latest)}</p>
      {check.officialRefuse ? <p className={styles.error}>{check.officialRefuse}</p> : null}
      {check.dirtyPaths.length > 0 ? <p className={styles.error}>{w.updateDirty}</p> : null}
      {check.tagPath.length > 0 ? (
        <p className={styles.updatePath}>
          {w.updateTagPath}: {[check.currentTag, ...check.tagPath].join(' to ')}
        </p>
      ) : null}
      {check.kernel ? (
        <p className={styles.hint}>{w.updateKernelLine(check.kernel.from, check.kernel.to)}</p>
      ) : null}
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
      {showScope && updateScope && onScope ? (
        <SegmentedSwitch
          ariaLabel={w.updateScopeAria}
          activeKey={updateScope === 'plugin' ? 'all' : updateScope}
          onSelect={(key) => onScope(key as UpdateScope)}
          options={[
            { key: 'all', label: w.updateScopeAll },
            { key: 'kernel', label: w.updateScopeKernel },
            { key: 'plugins', label: w.updateScopePlugins },
          ]}
        />
      ) : null}
    </div>
  );
}

function UpdateCheckResultModal({
  dialog,
  labels: w,
  updateScope,
  onScope,
  onApply,
  onClose,
}: {
  dialog: CheckDialog;
  labels: WhiteLabel;
  updateScope: UpdateScope;
  onScope: (scope: UpdateScope) => void;
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

  if (classified.kind === 'error') {
    return (
      <ConfirmModal
        variant="dialog"
        title={w.checkError}
        message={
          <UpdateCheckPlanDetails check={dialog.check} labels={w} />
        }
        confirmLabel={w.applyDismiss}
        closeIcon={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  if (!classified.canApplyOfficial) {
    return (
      <ConfirmModal
        variant="dialog"
        title={w.checkResultTitle}
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
      message={
        <UpdateCheckPlanDetails
          check={dialog.check}
          labels={w}
          showScope
          updateScope={updateScope}
          onScope={onScope}
        />
      }
      confirmLabel={w.applyConfirm}
      cancelLabel={w.applyDismiss}
      onConfirm={onApply}
      onCancel={onClose}
    />
  );
}

function PluginRow({
  plugin,
  nested = false,
  labels: w,
  updateCheck,
  installing,
  onToggle,
  onAskUninstall,
  onApplyPlugin,
}: {
  plugin: AdminPlugin;
  nested?: boolean;
  labels: WhiteLabel;
  updateCheck: AdminUpdateCheck | null;
  installing: boolean;
  onToggle: (plugin: AdminPlugin, enabled: boolean) => void;
  onAskUninstall: (plugin: AdminPlugin) => void;
  onApplyPlugin: (plugin: AdminPlugin) => void;
}) {
  const configureTo = pluginConfigurePath(plugin);
  const compatible = plugin.compatibility?.ok !== false;
  const userUpdate = updateCheck?.userPlugins.find((row) => row.id === plugin.id);
  const bundledUpdate = updateCheck?.plugins.find((row) => row.id === plugin.id);
  const originHost = plugin.repository ? plugin.repository.replace(/^https:\/\/github\.com\//, '') : null;
  return (
    <div className={nested ? `${styles.row} ${styles.rowNested}` : styles.row}>
      <div className={styles.rowMain}>
        <h2 className={styles.rowName}>{plugin.manifest.name}</h2>
        {!nested && plugin.manifest.description ? (
          <p className={styles.rowDescription}>{plugin.manifest.description}</p>
        ) : null}
        <div className={styles.rowMeta}>
          <span className={styles.badge}>{plugin.id}</span>
          <span className={styles.badge}>{kindText(plugin.manifest.kind, w)}</span>
          {plugin.manifest.required ? <span className={styles.badge}>{w.required}</span> : null}
          {plugin.missingFromDisk ? (
            <span className={`${styles.badge} ${styles.badgeDanger}`}>{w.missingFolder}</span>
          ) : null}
          {compatible ? null : <span className={`${styles.badge} ${styles.badgeDanger}`}>{w.incompatible}</span>}
          {userUpdate && !userUpdate.error ? (
            <span className={`${styles.badge} ${styles.badgeUpdate}`}>{w.updateAvailable}</span>
          ) : null}
        </div>
        {plugin.manifest.version || plugin.manifest.engines?.core || plugin.schemaVersion ? (
          <div className={styles.rowVersions}>
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
            {plugin.schemaVersion ? (
              <span className={styles.badge}>{w.schemaVersion(plugin.schemaVersion)}</span>
            ) : null}
            {originHost ? (
              <span className={styles.badge}>
                {w.updateOrigin} {originHost}
              </span>
            ) : null}
          </div>
        ) : null}
        {plugin.missingFromDisk ? <p className={styles.rowError}>{w.missingFolderHint}</p> : null}
        {compatible ? null : (
          <p className={styles.rowError}>{plugin.compatibility?.errors.map((entry) => entry.message).join(' ')}</p>
        )}
      </div>
      <div className={styles.rowActions}>
        {configureTo && !plugin.missingFromDisk ? (
          <Link className={styles.configureLink} to={configureTo}>
            {w.configure}
          </Link>
        ) : null}
        {userUpdate && !userUpdate.error ? (
          <Button type="button" variant="secondary" disabled={installing} onClick={() => onApplyPlugin(plugin)}>
            {w.applyThisPlugin}
          </Button>
        ) : null}
        {plugin.bundled && bundledUpdate && updateCheck?.canApplyOfficial ? (
          <Button type="button" variant="ghost" disabled={installing} onClick={() => onApplyPlugin(plugin)}>
            {w.applyThisPlugin}
          </Button>
        ) : null}
        <div className={styles.rowActionControls}>
          <ToggleSwitch
            checked={plugin.enabled}
            disabled={installing || Boolean(plugin.manifest.required) || !compatible}
            aria-label={w.enabled}
            onChange={(checked) => onToggle(plugin, checked)}
          />
          {plugin.manifest.required ? null : (
            <button
              type="button"
              className={styles.uninstallButton}
              aria-label={w.uninstall}
              disabled={installing}
              onClick={() => onAskUninstall(plugin)}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function installProgress(items: InstallItem[]): number {
  const installing = items.findIndex((item) => item.status === 'installing');
  if (installing >= 0) return installing + 1;
  const finished = items.filter((item) => item.status === 'ok' || item.status === 'error').length;
  return Math.min(Math.max(finished, 1), items.length);
}

function installStatusLabel(
  status: InstallStatus,
  w: WhiteLabel,
): string {
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

function kindText(kind: string, w: WhiteLabel): string {
  if (kind === 'theme') return w.kindTheme;
  if (kind === 'page') return w.kindPage;
  if (kind === 'payment') return w.kindPayment;
  if (kind === 'shipping') return w.kindShipping;
  if (kind === 'commerce') return w.kindCommerce;
  if (kind === 'docs') return w.kindDocs;
  if (kind === 'seo') return w.kindSeo;
  if (kind === 'locale') return w.kindLocale;
  return w.kindGeneric;
}
