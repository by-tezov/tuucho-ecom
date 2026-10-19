import { CORE_VERSION } from '../../domain/coreVersion.js';
import {
  OFFICIAL_ORIGIN,
  parseGithubHttpsRepo,
  type GithubRepoRef,
} from '../../domain/githubRepository.js';
import {
  parsePluginReleaseManifest,
  parseShopReleaseManifest,
  type ShopReleaseManifest,
} from '../../domain/releaseManifest.js';
import { assertReleaseIdSequence, parseReleaseTag, walkTagsBetween, type ReleaseTag } from '../../domain/semverTags.js';
import { isTuuchoPluginId, isUserPluginId } from '../discoverPlugins.js';
import { listPlugins } from '../pluginStore.js';
import { createGithubClient, type GithubClient } from './githubClient.js';
import { diffTreeHashes, hashTree } from './treeHash.js';
import { inferredShopRelease, readShopRelease, type ShopReleaseRecord } from './shopRelease.js';
import { join } from 'node:path';
import { repoRoot } from '../discoverPlugins.js';

export type PluginVersionChange = {
  id: string;
  from: string;
  to: string;
  installPath?: string;
};

export type UserPluginUpdate = {
  id: string;
  name: string;
  repository: string;
  from: string;
  to: string;
  toTag: string;
  tags: string[];
  changelog?: string;
  error?: string;
};

export type UpdateCheck = {
  currentTag: string;
  currentKernel: string;
  inferred: boolean;
  latestTag: string | null;
  officialUpToDate: boolean;
  canApplyOfficial: boolean;
  officialRefuse?: string;
  dirtyPaths: string[];
  tagPath: string[];
  kernel?: PluginVersionChange;
  plugins: PluginVersionChange[];
  userPlugins: UserPluginUpdate[];
  restartRequired: boolean;
};

function officialRef(): GithubRepoRef {
  const parsed = parseGithubHttpsRepo(OFFICIAL_ORIGIN);
  if (!parsed) throw new Error('Official origin is invalid.');
  return parsed;
}

export async function checkUpdates(client: GithubClient = createGithubClient()): Promise<UpdateCheck> {
  const recorded = await readShopRelease();
  const shop = recorded ?? (await inferredShopRelease());
  const inferred = !recorded;
  const dirtyPaths = await detectDirtyTuucho(shop);
  let official: UpdateCheck = {
    currentTag: shop.tag,
    currentKernel: shop.kernel,
    inferred,
    latestTag: null,
    officialUpToDate: true,
    canApplyOfficial: false,
    dirtyPaths,
    tagPath: [],
    plugins: [],
    userPlugins: [],
    restartRequired: false,
  };

  try {
    official = { ...official, ...(await checkOfficial(client, shop, dirtyPaths)) };
  } catch (error) {
    official.officialRefuse = error instanceof Error ? error.message : 'GitHub check failed.';
    official.canApplyOfficial = false;
  }

  official.userPlugins = await checkUserPlugins(client);
  return official;
}

async function detectDirtyTuucho(shop: ShopReleaseRecord): Promise<string[]> {
  if (shop.tuuchoFiles.length > 0) {
    const live = await hashTree(join(repoRoot(), 'plugins/tuucho'));
    return diffTreeHashes(shop.tuuchoFiles, live);
  }
  return [];
}

async function checkOfficial(
  client: GithubClient,
  shop: ShopReleaseRecord,
  dirtyPaths: string[],
): Promise<Partial<UpdateCheck>> {
  const ref = officialRef();
  const tags = await client.listReleaseTags(ref);
  const current = parseReleaseTag(shop.tag);
  if (!current) throw new Error(`Shop tag ${shop.tag} is not a release tag.`);
  const currentOnOrigin = tags.find((entry) => entry.tag === current.tag);
  if (!currentOnOrigin) {
    throw new Error(
      `Shop tag ${shop.tag} is not on ${OFFICIAL_ORIGIN}. Apply is refused until that tag exists (inferred shops must match a published tag).`,
    );
  }
  const latest = tags[tags.length - 1];
  if (!latest) throw new Error(`No release tags on ${OFFICIAL_ORIGIN}.`);
  const latestManifest = parseShopReleaseManifest(await client.readJson(ref, latest.tag, 'release.json'));
  const walked = walkTagsBetween(current, latest, tags);
  if (walked.length === 0) {
    return {
      latestTag: latest.tag,
      officialUpToDate: true,
      canApplyOfficial: false,
      tagPath: [],
      plugins: [],
    };
  }
  const nextIds: number[] = [];
  for (const tag of walked) {
    const manifest = parseShopReleaseManifest(await client.readJson(ref, tag.tag, 'release.json'));
    nextIds.push(manifest.releaseId);
  }
  if (shop.releaseId !== null) assertReleaseIdSequence(shop.releaseId, nextIds);
  const pluginChanges: PluginVersionChange[] = [];
  const byId = new Map(latestManifest.plugins.map((entry) => [entry.id, entry]));
  const installed = await listPlugins();
  for (const plugin of installed) {
    if (!isTuuchoPluginId(plugin.id)) continue;
    const next = byId.get(plugin.id);
    if (!next) continue;
    if (next.version !== plugin.manifest.version) {
      pluginChanges.push({
        id: plugin.id,
        from: plugin.manifest.version,
        to: next.version,
        installPath: next.installPath,
      });
    }
  }
  for (const entry of latestManifest.plugins) {
    if (installed.some((plugin) => plugin.id === entry.id)) continue;
    pluginChanges.push({ id: entry.id, from: '(missing)', to: entry.version, installPath: entry.installPath });
  }
  const kernelChange =
    latestManifest.kernel !== shop.kernel
      ? { id: 'kernel', from: shop.kernel, to: latestManifest.kernel }
      : undefined;
  let officialRefuse: string | undefined;
  if (shop.tuuchoFiles.length === 0) {
    officialRefuse =
      'This shop has no recorded plugins/tuucho hashes. Apply is refused until setup writes shop-release.json, so local edits are not overwritten.';
  } else if (dirtyPaths.length > 0) {
    officialRefuse = `Local edits under plugins/tuucho/ (${dirtyPaths.slice(0, 8).join(', ')}). Copy them out before Apply.`;
  }
  return {
    latestTag: latest.tag,
    officialUpToDate: false,
    canApplyOfficial: !officialRefuse,
    officialRefuse,
    tagPath: walked.map((entry) => entry.tag),
    kernel: kernelChange,
    plugins: pluginChanges,
    restartRequired: Boolean(kernelChange),
  };
}

async function checkUserPlugins(client: GithubClient): Promise<UserPluginUpdate[]> {
  const installed = await listPlugins();
  const out: UserPluginUpdate[] = [];
  for (const plugin of installed) {
    if (!isUserPluginId(plugin.id) || plugin.missingFromDisk) continue;
    const repository = plugin.manifest.repository?.trim();
    if (!repository) continue;
    const ref = parseGithubHttpsRepo(repository);
    if (!ref) {
      out.push({
        id: plugin.id,
        name: plugin.manifest.name,
        repository,
        from: plugin.manifest.version,
        to: plugin.manifest.version,
        toTag: '',
        tags: [],
        error: 'repository must be an HTTPS GitHub repo root.',
      });
      continue;
    }
    try {
      const tags = await client.listReleaseTags(ref);
      const current = parseReleaseTag(plugin.manifest.version);
      if (!current) {
        out.push({
          id: plugin.id,
          name: plugin.manifest.name,
          repository: ref.href,
          from: plugin.manifest.version,
          to: plugin.manifest.version,
          toTag: '',
          tags: [],
          error: `Installed version ${plugin.manifest.version} is not a release tag.`,
        });
        continue;
      }
      const latest = tags[tags.length - 1];
      if (!latest) {
        out.push({
          id: plugin.id,
          name: plugin.manifest.name,
          repository: ref.href,
          from: plugin.manifest.version,
          to: plugin.manifest.version,
          toTag: '',
          tags: [],
          error: 'No release tags on that repository.',
        });
        continue;
      }
      const walked = walkTagsBetween(current, latest, tags);
      if (walked.length === 0) continue;
      let changelog: string | undefined;
      try {
        const remoteJson = await client.readOptionalJson(ref, latest.tag, 'plugin-release.json');
        const pluginJson = (await client.readJson(ref, latest.tag, 'plugin.json')) as { id?: unknown; version?: unknown };
        const parsed = parsePluginReleaseManifest(remoteJson, {
          id: typeof pluginJson.id === 'string' ? pluginJson.id : plugin.id,
          version: typeof pluginJson.version === 'string' ? pluginJson.version : latest.version,
          tag: latest.tag,
        });
        if (parsed.id !== plugin.id) throw new Error(`Origin id ${parsed.id} does not match ${plugin.id}.`);
        changelog = parsed.changelog;
        if (!changelog) {
          const notes = await client.readOptionalText(ref, latest.tag, 'CHANGELOG.md');
          if (notes) changelog = notes.trim().slice(0, 500);
        }
      } catch (error) {
        out.push({
          id: plugin.id,
          name: plugin.manifest.name,
          repository: ref.href,
          from: plugin.manifest.version,
          to: latest.version,
          toTag: latest.tag,
          tags: walked.map((entry) => entry.tag),
          error: error instanceof Error ? error.message : 'Could not read plugin-release.json.',
        });
        continue;
      }
      out.push({
        id: plugin.id,
        name: plugin.manifest.name,
        repository: ref.href,
        from: plugin.manifest.version,
        to: latest.version,
        toTag: latest.tag,
        tags: walked.map((entry) => entry.tag),
        changelog,
      });
    } catch (error) {
      out.push({
        id: plugin.id,
        name: plugin.manifest.name,
        repository: ref.href,
        from: plugin.manifest.version,
        to: plugin.manifest.version,
        toTag: '',
        tags: [],
        error: error instanceof Error ? error.message : 'GitHub check failed.',
      });
    }
  }
  return out;
}

export type { ShopReleaseManifest, ReleaseTag };
export { CORE_VERSION };
