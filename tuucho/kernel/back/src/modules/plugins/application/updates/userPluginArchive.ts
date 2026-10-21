import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { hasTuuchoDiscriminator } from '../discoverPlugins.js';

/** Third-party tag trees must be a package root, never a nested shop tree. */
export async function assertUserPluginStaging(staging: string): Promise<void> {
  const names = await readdir(staging);
  if (!names.includes('package.json')) {
    throw new Error('Tag archive is missing package.json at the package root.');
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(await readFile(join(staging, 'package.json'), 'utf8')) as unknown;
  } catch {
    throw new Error('Tag archive package.json is not valid JSON.');
  }
  if (!hasTuuchoDiscriminator(pkg)) {
    throw new Error('Tag archive package.json is missing the tuucho discriminator.');
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
    if (
      posix === 'plugins' ||
      posix.startsWith('plugins/') ||
      posix === 'src/plugins' ||
      posix.startsWith('src/plugins/') ||
      posix === 'tuucho' ||
      posix.startsWith('tuucho/') ||
      /(^|\/)kernel(\/|$)/.test(posix)
    ) {
      throw new Error(`Kernel overwrite rejected: ${posix}`);
    }
    if (entry.isDirectory()) await walk(posix, join(abs, entry.name));
  }
}
