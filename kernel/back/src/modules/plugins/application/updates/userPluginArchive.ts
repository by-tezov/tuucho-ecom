import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Third-party tag trees must be a package root, never a nested shop tree. */
export async function assertUserPluginStaging(staging: string): Promise<void> {
  const names = await readdir(staging);
  if (!names.includes('plugin.json')) {
    throw new Error('Tag archive is missing plugin.json at the package root.');
  }
  const registerTs = await pathExists(join(staging, 'back/register.ts'));
  const registerJs = await pathExists(join(staging, 'back/register.js'));
  if (!registerTs && !registerJs) {
    throw new Error('Tag archive is missing back/register.ts at the package root.');
  }
  await walk('', staging);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(rel: string, abs: string): Promise<void> {
  const entries = await readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const posix = rel ? `${rel}/${entry.name}` : entry.name;
    if (posix === 'plugins' || posix.startsWith('plugins/') || /(^|\/)kernel(\/|$)/.test(posix)) {
      throw new Error(`Kernel overwrite rejected: ${posix}`);
    }
    if (entry.isDirectory()) await walk(posix, join(abs, entry.name));
  }
}
