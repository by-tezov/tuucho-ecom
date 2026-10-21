/** Thin entry for the private nail catalogue under
 * catalog source/product/library-user.
 * Reuses the library importer; source basename maps to audience user-library
 * (DB/API value unchanged). */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const command = args[0];
if (command === 'delete-shape' || command === 'delete-color' || command === 'delete-all') {
  throw new Error(
    `library-user does not support ${command}; shared vocabulary and global catalogue deletion belong to npm run library.`,
  );
}
if (args.includes('--source'))
  throw new Error('library-user always uses catalog source/product/library-user.');
const directionIndex = args.indexOf('--direction');
if (directionIndex >= 0 && args[directionIndex + 1] === 'local') {
  throw new Error(
    'library-user has no local pull mode because account assignments are resolved only by the destination API.',
  );
}

const tsx = join(root, 'node_modules', '.bin', 'tsx');
const source = join(root, '..', 'catalog source', 'product', 'library-user');
const libraryArgs =
  command === 'stock-report'
    ? ['scripts/library.ts', ...args, '--audience', 'user-library']
    : ['scripts/library.ts', ...args, '--source', source];
const result = spawnSync(tsx, libraryArgs, {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
