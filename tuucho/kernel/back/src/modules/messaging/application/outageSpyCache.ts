import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from '../../../config/env.js';

export const OUTAGE_SPY_CHANNEL_IDS = ['website_down', 'website_restore_failed'] as const;
export type OutageSpyChannelId = (typeof OUTAGE_SPY_CHANNEL_IDS)[number];

let cacheRootForTests: string | undefined;

export function setOutageSpyCacheRootForTests(root: string | undefined): void {
  cacheRootForTests = root;
}

export function isOutageSpyChannel(channelId: string): channelId is OutageSpyChannelId {
  return (OUTAGE_SPY_CHANNEL_IDS as readonly string[]).includes(channelId);
}

export function outageSpyCacheFile(privateRoot = cacheRootForTests ?? config.privateDir): string {
  const root = privateRoot?.trim();
  if (!root) {
    throw new Error('PRIVATE_DIR is required for the outage spy recipient cache.');
  }
  return join(resolve(root), 'warm-outage', 'spy-recipients.json');
}

type CacheFile = Partial<Record<string, string>>;

async function readCacheFile(file: string): Promise<CacheFile> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CacheFile = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist last live To (including empty) so website_down can still mail if DB is down. */
export async function rememberOutageSpyTo(channelId: string, emails: readonly string[]): Promise<void> {
  if (!isOutageSpyChannel(channelId)) return;
  try {
    const file = outageSpyCacheFile();
    await mkdir(dirname(file), { recursive: true });
    const current = await readCacheFile(file);
    current[channelId] = emails.join(', ');
    await writeFile(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.error('[outage-spy] failed to cache recipients', error);
  }
}

/** Last successful resolve. Empty or missing cache means skip the send. */
export async function readCachedOutageSpyTo(channelId: string): Promise<string | undefined> {
  if (!isOutageSpyChannel(channelId)) return undefined;
  try {
    const cached = (await readCacheFile(outageSpyCacheFile()))[channelId];
    const trimmed = cached?.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
