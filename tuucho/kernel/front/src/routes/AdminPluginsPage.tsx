import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { StatusModal } from '../components/ui/StatusModal';
import { SegmentedSwitch } from '../components/ui/SegmentedSwitch';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { useAuthSession } from '../state/AuthContext';
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
import { AdminPluginConfigBulk } from './AdminPluginConfigBulk';
import { pluginConfigurePath } from './pluginConfigure';
import {
  filterPluginGroups,
  groupAdminPlugins,
  groupLocaleSearchHit,
  type PluginOriginFilter,
  type PluginStatusFilter,
} from './pluginListGroups';
import { UpdateCheckPlanDetails, UpdateCheckResultModal, type CheckDialog } from './AdminUpdateCheckDialogs';
import { classifyUpdateCheck, focusUpdateCheck } from './pluginUpdateCheck';
import styles from './AdminPlugins.module.css';

type ActionResult = { tone: 'success' | 'error'; message: string };

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
  const refreshBootstrap = useRefreshStorefrontBootstrap();
  const [plugins, setPlugins] = useState<AdminPlugin[]>([]);
  const [coreVersion, setCoreVersion] = useState('');
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<PluginOriginFilter>('tuucho');
  const [status, setStatus] = useState<PluginStatusFilter>('all');
  const [pendingUninstall, setPendingUninstall] = useState<AdminPlugin | null>(null);
  const [installItems, setInstallItems] = useState<InstallItem[] | null>(null);
  const [updateCheck, setUpdateCheck] = useState<AdminUpdateCheck | null>(null);
  const [pendingApply, setPendingApply] = useState<{ scope: UpdateScope; pluginId?: string } | null>(null);
  const [updateJob, setUpdateJob] = useState<AdminUpdateJob | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [checkDialog, setCheckDialog] = useState<CheckDialog | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const installing = Boolean(installItems) || Boolean(updateJob) || checkingUpdates || actionLoading !== null;

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
    if (!updateJob || updateJob.status !== 'running') return undefined;
    const timer = window.setInterval(() => {
      void authedRequest((token) => getAdminPluginUpdateStatus(token))
        .then((result) => {
          if (!result.job) return;
          setUpdateJob(result.job);
          if (result.job.status !== 'running') {
            void reload();
            refreshBootstrap();
          }
        })
        .catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is recreated each render
  }, [updateJob, authedRequest, refreshBootstrap]);

  async function checkForUpdates() {
    if (checkingUpdates) return;
    setActionResult(null);
    setCheckDialog(null);
    setCheckingUpdates(true);
    try {
      await withMinDuration(
        (async () => {
          const scanned = await authedRequest((token) => scanAdminPlugins(token));
          setPlugins(scanned.plugins);
          setCoreVersion(scanned.coreVersion);
          refreshBootstrap();
          const result = await authedRequest((token) => checkAdminPluginUpdates(token));
          const pluginsOnly = focusUpdateCheck(result.check, 'plugins');
          setUpdateCheck(pluginsOnly);
          setCheckDialog({ type: 'checked', check: pluginsOnly });
        })(),
        shopConfig.loadingMinMs.short,
      );
    } catch (err) {
      const message = err instanceof ApiError && err.serverMessage ? err.serverMessage : w.checkError;
      setCheckDialog({ type: 'failed', message });
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function startApply(scope: UpdateScope, pluginId?: string) {
    setActionResult(null);
    setPendingApply(null);
    try {
      const result = await authedRequest((token) => applyAdminPluginUpdates(token, scope, pluginId));
      setUpdateJob(result.job);
    } catch (err) {
      setActionResult({
        tone: 'error',
        message: err instanceof ApiError && err.serverMessage ? err.serverMessage : w.applyFailed,
      });
    }
  }

  async function uploadFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setActionResult(null);
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
        setActionResult({
          tone: 'success',
          message: ok === 1 ? w.uploadSuccess : w.uploadBatchSuccess(ok),
        });
      } else {
        const partial = ok > 0 ? `${w.uploadBatchPartial(ok, failures.length)} ` : '';
        setActionResult({ tone: 'error', message: `${partial}${failures.join(' ')}` });
      }
    } catch {
      setActionResult({ tone: 'error', message: w.uploadError });
    } finally {
      setInstallItems(null);
    }
  }

  async function toggle(plugin: AdminPlugin, enabled: boolean) {
    if (plugin.manifest.required) {
      setActionResult({ tone: 'error', message: w.cannotDisableHome });
      return;
    }
    setActionResult(null);
    setActionLoading(w.savingPlugin);
    try {
      await withMinDuration(
        authedRequest((token) => patchAdminPlugin(token, plugin.id, { enabled })),
        shopConfig.loadingMinMs.short,
      );
      await reload();
      refreshBootstrap();
      setActionResult({ tone: 'success', message: w.saved });
    } catch (err) {
      setActionResult({
        tone: 'error',
        message:
          err instanceof ApiError && err.code === 'plugin_incompatible'
            ? err.serverMessage || w.incompatibleCannotEnable
            : w.saveError,
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function uninstall(plugin: AdminPlugin) {
    setPendingUninstall(null);
    if (plugin.manifest.required) {
      setActionResult({ tone: 'error', message: w.cannotUninstallRequired });
      return;
    }
    setActionResult(null);
    setActionLoading(w.uninstallingPlugin);
    try {
      await withMinDuration(
        authedRequest((token) => uninstallAdminPlugin(token, plugin.id)),
        shopConfig.loadingMinMs.short,
      );
      await reload();
      refreshBootstrap();
      setActionResult({ tone: 'success', message: w.uninstalled });
    } catch (err) {
      setActionResult({
        tone: 'error',
        message:
          err instanceof ApiError && err.code === 'plugin_required'
            ? w.cannotUninstallRequired
            : w.uninstallError,
      });
    } finally {
      setActionLoading(null);
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
    setActionResult(null);
  }

  return (
    <div className={styles.page}>
      <Seo title={w.pluginsNavLabel} description={w.pluginsNavDescription} path={adminPath('/plugins')} />
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{w.pluginsNavLabel}</h1>
        {coreVersion ? (
          <span className={styles.coreVersion}>
            {w.coreVersion(coreVersion)}
          </span>
        ) : null}
      </div>
      <div className={styles.toolbar}>
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
      <AdminPluginConfigBulk
        busy={installing}
        onNotice={(message) => {
          setActionResult({ tone: 'success', message });
          void reload();
        }}
        onError={(message) => {
          if (message) setActionResult({ tone: 'error', message });
        }}
      />
      <div className={styles.filters}>
        <SegmentedSwitch
          className={styles.originSwitch ?? ''}
          ariaLabel={w.originAria}
          activeKey={origin}
          onSelect={(key) => {
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
            setSearch(event.target.value);
          }}
          placeholder={w.searchPlaceholder}
          autoComplete="off"
        />
      </label>
      {error ? <p className={styles.error}>{error}</p> : null}
      {updateCheck && classifyUpdateCheck(updateCheck).kind === 'plan' && !checkDialog ? (
        <div className={styles.updatePlan}>
          <UpdateCheckPlanDetails check={updateCheck} labels={w} />
          {updateCheck.canApplyOfficial ? (
            <Button
              type="button"
              disabled={installing}
              onClick={() => setPendingApply({ scope: 'plugins' })}
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
      {actionLoading ? <LoadingModal message={actionLoading} /> : null}
      {actionResult && !actionLoading ? (
        actionResult.tone === 'success' ? (
          <StatusModal message={actionResult.message} onClose={() => setActionResult(null)} />
        ) : (
          <ConfirmModal
            variant="dialog"
            title={actionResult.message}
            message={null}
            confirmLabel={w.applyDismiss}
            closeIcon={false}
            onConfirm={() => setActionResult(null)}
            onCancel={() => setActionResult(null)}
          />
        )
      ) : null}
      {checkingUpdates ? <LoadingModal message={w.checkingUpdates} /> : null}
      {checkDialog && !checkingUpdates ? (
        <UpdateCheckResultModal
          dialog={checkDialog}
          labels={w}
          onApply={() => {
            if (checkDialog.type !== 'checked') return;
            setCheckDialog(null);
            void startApply('plugins');
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
