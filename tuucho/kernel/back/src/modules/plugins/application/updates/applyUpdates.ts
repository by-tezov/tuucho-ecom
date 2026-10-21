import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { runner } from 'node-pg-migrate';
import { migrateStampBehind } from '../../../../config/configMigrate.js';
import { config } from '../../../../config/env.js';
import { CORE_VERSION } from '../../../../config/appVersion.js';
import { OFFICIAL_ORIGIN, parseGithubHttpsRepo } from '../../domain/githubRepository.js';
import { readReleaseCatalogJson } from '../../domain/releaseFiles.js';
import { parsePluginReleaseManifest, parseShopReleaseManifest } from '../../domain/releaseManifest.js';
import { isTuuchoPluginId, isUserPluginId, readPluginPackageFields, repoRoot } from '../discoverPlugins.js';
import { assessPluginCompatibility } from '../pluginCompatibility.js';
import { listPlugins, scanPlugins } from '../pluginStore.js';
import { copyScopedPaths, pathExists } from './copyScoped.js';
import { extractTagTarGz } from './extractTagArchive.js';
import { createGithubClient, type GithubClient } from './githubClient.js';
import { logItem, type UpdateLogItem } from './log.js';
import { officialCopyPaths, type ApplyRequest, type UpdateScope } from './scopedPaths.js';
import {
  createUpdateSnapshot,
  OFFICIAL_SNAPSHOT_PATHS,
  removeSnapshot,
  restoreUpdateSnapshot,
  type UpdateSnapshot,
} from './snapshot.js';
import { hashTuuchoTree, inferredShopRelease, readShopRelease, writeShopRelease } from './shopRelease.js';
import { checkUpdates } from './checkUpdates.js';
import { updatesVarDir } from './snapshot.js';
import { assertUserPluginStaging } from './userPluginArchive.js';

const execFileAsync = promisify(execFile);

export type ApplyResult = {
  ok: boolean;
  log: UpdateLogItem[];
  restartRequired: boolean;
  error?: string;
};

function setLog(log: UpdateLogItem[], name: string, status: UpdateLogItem['status'], message?: string): void {
  const existing = log.find((item) => item.name === name);
  if (existing) {
    existing.status = status;
    existing.message = message;
    return;
  }
  log.push(logItem(name, status, message));
}

export async function applyUpdates(
  request: ApplyRequest,
  client: GithubClient = createGithubClient(),
  onLog?: (log: UpdateLogItem[]) => void,
): Promise<ApplyResult> {
  const log: UpdateLogItem[] = [];
  const emit = () => onLog?.(log.map((item) => ({ ...item })));
  const pluginId = request.pluginId;
  if (request.scope === 'plugin' && pluginId && isUserPluginId(pluginId)) {
    return applyUserPlugin(pluginId, client, log, emit);
  }
  return applyOfficial(request.scope, pluginId, client, log, emit);
}

async function applyOfficial(
  scope: UpdateScope,
  pluginId: string | undefined,
  client: GithubClient,
  log: UpdateLogItem[],
  emit: () => void,
): Promise<ApplyResult> {
  const root = repoRoot();
  let snapshot: UpdateSnapshot | undefined;
  try {
    const checked = await checkUpdates(client);
    if (!checked.canApplyOfficial || checked.tagPath.length === 0) {
      const message = checked.officialRefuse ?? 'Nothing to apply for the official origin.';
      setLog(log, 'check', 'error', message);
      emit();
      return { ok: false, log, restartRequired: false, error: message };
    }
    if (scope === 'plugin') {
      if (!pluginId || !isTuuchoPluginId(pluginId)) {
        throw new Error('Official one-plugin Apply needs a bundled tuucho-* id.');
      }
      const plugins = await listPlugins();
      const live = plugins.find((plugin) => plugin.id === pluginId);
      const latest = checked.plugins.find((entry) => entry.id === pluginId);
      if (live && latest) {
        const probe = assessPluginCompatibility(
          { id: pluginId, manifest: { ...live.manifest, version: latest.to, engines: live.manifest.engines } },
          plugins,
        );
        if (!probe.ok) {
          throw new Error(
            `${pluginId} needs a kernel that matches engines.core. Use Kernel or All instead. ${probe.errors.map((entry) => entry.message).join(' ')}`,
          );
        }
      }
    }
    setLog(log, 'snapshot', 'installing');
    emit();
    const record = (await readShopRelease()) ?? (await inferredShopRelease());
    snapshot = await createUpdateSnapshot(OFFICIAL_SNAPSHOT_PATHS, root);
    record.updateInProgress = {
      snapshotDir: snapshot.dir,
      databaseDump: snapshot.databaseDump,
      startedAt: new Date().toISOString(),
    };
    await writeShopRelease(record, root);
    setLog(log, 'snapshot', 'ok');
    emit();

    const ref = parseGithubHttpsRepo(OFFICIAL_ORIGIN)!;
    let lastManifest = parseShopReleaseManifest(
      await readReleaseCatalogJson({
        readOptionalJson: (path) => client.readOptionalJson(ref, checked.currentTag, path),
        readJson: (path) => client.readJson(ref, checked.currentTag, path),
      }).catch(() => ({
        tag: checked.currentTag,
        kernel: checked.currentKernel,
        releaseId: record.releaseId ?? 1,
        kernelMigrations: [],
        plugins: [],
      })),
    );
    for (const tag of checked.tagPath) {
      const step = `tag ${tag}`;
      setLog(log, step, 'installing');
      emit();
      await mkdir(updatesVarDir(root), { recursive: true });
      const staging = await mkdtemp(join(updatesVarDir(root), 'tag-'));
      try {
        const archive = await client.downloadTagArchive(ref, tag);
        await extractTagTarGz(archive, staging);
        const manifest = parseShopReleaseManifest(
          await readReleaseCatalogJson({
            readOptionalJson: (path) => client.readOptionalJson(ref, tag, path),
            readJson: (path) => client.readJson(ref, tag, path),
          }),
        );
        if (lastManifest.releaseId !== null && lastManifest.releaseId !== undefined) {
          if (manifest.releaseId !== lastManifest.releaseId + 1 && record.releaseId !== null) {
            // Sequence already checked; still refuse a decrease.
            if (manifest.releaseId <= lastManifest.releaseId) {
              throw new Error(`releaseId decreased at ${tag}.`);
            }
          }
        }
        const paths = officialCopyPaths(scope, manifest, pluginId);
        const copied = await copyScopedPaths(staging, root, paths);
        if (scope === 'all' || scope === 'kernel') {
          for (const dir of ['tuucho/kernel/back', 'tuucho/kernel/front'] as const) {
            if (!(await pathExists(join(root, dir, 'package-lock.json')))) continue;
            setLog(log, `${step} npm ci ${dir}`, 'installing');
            emit();
            await execFileAsync('npm', ['ci'], { cwd: join(root, dir), maxBuffer: 32 * 1024 * 1024 });
            setLog(log, `${step} npm ci ${dir}`, 'ok');
          }
        }
        if (scope === 'all' || scope === 'kernel') {
          setLog(log, `${step} kernel migrate`, 'installing');
          emit();
          await runner({
            databaseUrl: config.databaseUrl,
            dir: join(root, 'tuucho/kernel/back/src/db/migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            checkOrder: false,
          });
          setLog(log, `${step} kernel migrate`, 'ok');
        }
        setLog(log, `${step} plugin migrate`, 'installing');
        emit();
        await scanPlugins();
        setLog(log, `${step} plugin migrate`, 'ok');
        const hashed = await hashTuuchoTree(root);
        const bumpRelease = scope === 'all' || scope === 'kernel';
        await writeShopRelease(
          {
            origin: OFFICIAL_ORIGIN,
            tag: bumpRelease ? manifest.tag : record.tag,
            kernel: bumpRelease ? manifest.kernel : record.kernel,
            releaseId: bumpRelease ? manifest.releaseId : record.releaseId,
            installedAt: new Date().toISOString(),
            tuuchoTreeHash: hashed.fingerprint,
            tuuchoFiles: hashed.files,
            updateInProgress: record.updateInProgress,
          },
          root,
        );
        lastManifest = manifest;
        setLog(log, step, 'ok', copied.join(', ') || 'no files for this scope');
        emit();
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    const hashed = await hashTuuchoTree(root);
    const finalRelease = (await readShopRelease()) ?? (await inferredShopRelease());
    delete finalRelease.updateInProgress;
    finalRelease.tuuchoTreeHash = hashed.fingerprint;
    finalRelease.tuuchoFiles = hashed.files;
    await writeShopRelease(finalRelease, root);
    if (snapshot) await removeSnapshot(snapshot);
    const behind = await migrateStampBehind(root, join(root, 'tuucho-config'));
    if (behind.length > 0) {
      setLog(log, 'config:migrate', 'ok', `Factory config has pending steps (${behind.join(', ')}). Run npm run config:migrate. Apply never writes tuucho-config/.`);
    }
    setLog(log, 'done', 'ok', scope === 'all' || scope === 'kernel' ? 'Restart the API process to load the new kernel.' : undefined);
    emit();
    return { ok: true, log, restartRequired: scope === 'all' || scope === 'kernel' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apply failed.';
    setLog(log, 'error', 'error', message);
    emit();
    if (snapshot) {
      setLog(log, 'restore', 'installing');
      emit();
      try {
        await restoreUpdateSnapshot(snapshot, root);
        const restored = await readShopRelease();
        if (restored) {
          delete restored.updateInProgress;
          await writeShopRelease(restored, root);
        }
        setLog(log, 'restore', 'ok');
      } catch (restoreError) {
        setLog(
          log,
          'restore',
          'error',
          restoreError instanceof Error ? restoreError.message : 'Restore failed.',
        );
      }
      emit();
    }
    return { ok: false, log, restartRequired: false, error: message };
  }
}

async function applyUserPlugin(
  pluginId: string,
  client: GithubClient,
  log: UpdateLogItem[],
  emit: () => void,
): Promise<ApplyResult> {
  const root = repoRoot();
  let snapshot: UpdateSnapshot | undefined;
  try {
    const checked = await checkUpdates(client);
    const row = checked.userPlugins.find((entry) => entry.id === pluginId);
    if (!row || row.tags.length === 0) {
      const message = row?.error ?? `No update for ${pluginId}.`;
      setLog(log, 'check', 'error', message);
      emit();
      return { ok: false, log, restartRequired: false, error: message };
    }
    if (row.error) throw new Error(row.error);
    const plugins = await listPlugins();
    const live = plugins.find((plugin) => plugin.id === pluginId);
    if (!live?.manifest.installPath) throw new Error(`Plugin ${pluginId} has no installPath.`);
    const installPath = live.manifest.installPath;
    if (!installPath.startsWith('src/plugins/') || installPath.split('/').pop() !== pluginId) {
      throw new Error(`User plugin Apply only replaces ${pluginId} under src/plugins/.`);
    }
    const ref = parseGithubHttpsRepo(row.repository);
    if (!ref) throw new Error('repository must be an HTTPS GitHub repo root.');
    setLog(log, 'snapshot', 'installing');
    emit();
    snapshot = await createUpdateSnapshot([installPath], root, { allowUserTree: true });
    setLog(log, 'snapshot', 'ok');
    emit();
    await mkdir(updatesVarDir(root), { recursive: true });
    for (const tag of row.tags) {
      const step = `tag ${tag}`;
      setLog(log, step, 'installing');
      emit();
      const staging = await mkdtemp(join(updatesVarDir(root), 'user-tag-'));
      try {
        const archive = await client.downloadTagArchive(ref, tag);
        await extractTagTarGz(archive, staging);
        const folder = live.manifest.folder?.replace(/^\/+|\/+$/g, '');
        const source = folder ? join(staging, ...folder.split('/')) : staging;
        await assertUserPluginStaging(source);
        const pluginPkgRaw = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as unknown;
        const pluginPkg = readPluginPackageFields(pluginPkgRaw);
        if (!pluginPkg) throw new Error(`Tag ${tag} package.json is missing the tuucho discriminator.`);
        const id = pluginPkg.id;
        const version = pluginPkg.version;
        if (id !== pluginId) throw new Error(`Tag ${tag} id ${id} does not match ${pluginId}.`);
        const releaseRaw = await client.readOptionalJson(ref, tag, 'plugin-release.json');
        const release = parsePluginReleaseManifest(releaseRaw, { id, version, tag });
        if (release.id !== pluginId) throw new Error(`plugin-release.json id ${release.id} does not match ${pluginId}.`);
        const enginesRaw = pluginPkg.tuucho.engines;
        const compatibility = assessPluginCompatibility(
          {
            id,
            manifest: {
              version,
              engines: enginesRaw && typeof enginesRaw === 'object'
                ? (enginesRaw as { core?: string })
                : live.manifest.engines,
              dependsOn: live.manifest.dependsOn,
            },
          },
          plugins.map((plugin) => ({ id: plugin.id, manifest: plugin.manifest })),
          CORE_VERSION,
        );
        if (!compatibility.ok) {
          throw new Error(compatibility.errors.map((entry) => entry.message).join(' '));
        }
        const dest = join(root, ...installPath.split('/'));
        await mkdir(dirname(dest), { recursive: true });
        await rm(dest, { recursive: true, force: true });
        await cp(source, dest, {
          recursive: true,
          filter: (source) => {
            const name = source.split(/[\\/]/).pop() ?? '';
            return name !== 'node_modules' && name !== '.git';
          },
        });
        await scanPlugins();
        setLog(log, step, 'ok', `version ${release.version}`);
        emit();
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
    if (snapshot) await removeSnapshot(snapshot);
    setLog(log, 'done', 'ok');
    emit();
    return { ok: true, log, restartRequired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apply failed.';
    setLog(log, 'error', 'error', message);
    emit();
    if (snapshot) {
      setLog(log, 'restore', 'installing');
      emit();
      try {
        await restoreUpdateSnapshot(snapshot, root);
        setLog(log, 'restore', 'ok');
      } catch (restoreError) {
        setLog(
          log,
          'restore',
          'error',
          restoreError instanceof Error ? restoreError.message : 'Restore failed.',
        );
      }
      emit();
    }
    return { ok: false, log, restartRequired: false, error: message };
  }
}

export async function recoverInterruptedUpdate(): Promise<void> {
  const record = await readShopRelease();
  const inProgress = record?.updateInProgress;
  if (!inProgress) return;
  const snapshot: UpdateSnapshot = {
    dir: inProgress.snapshotDir,
    filesDir: join(inProgress.snapshotDir, 'files'),
    databaseDump: inProgress.databaseDump,
    paths: OFFICIAL_SNAPSHOT_PATHS,
  };
  try {
    await restoreUpdateSnapshot(snapshot);
    delete record.updateInProgress;
    await writeShopRelease(record);
    await removeSnapshot(snapshot).catch(() => undefined);
    console.error('[updates] restored tuucho-versioning.lock snapshot after an interrupted Apply');
  } catch (error) {
    console.error('[updates] failed to restore interrupted Apply', error);
  }
}
