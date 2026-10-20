import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory that contains `config/config.json` and `package.json`.
 *
 * Cron, the FTP ops gateway, and cPanel can start Node with cwd=$HOME while
 * still pointing at this release's `opsServer.js` / `server.js` by absolute
 * path. Config files always live next to the compiled (or source) tree, not
 * wherever the process happened to start. */
function resolveApplicationRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '..'), resolve(here, '../..')];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'config', 'config.json'))) return candidate;
  }
  return process.cwd();
}

export const applicationRoot = resolveApplicationRoot();
