/** Thin entry for single-nail catalogue under catalog source/product/library-nail.
 * Reuses the library importer; source basename selects product_type nail_single
 * and boolean availability. */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const command = args[0];
if (command === 'delete-shape' || command === 'delete-color' || command === 'delete-all') {
  throw new Error(
    `library-nail does not support ${command}; shared vocabulary and global catalogue deletion belong to npm run library.`,
  );
}
if (args.includes('--source'))
  throw new Error('library-nail always uses catalog source/product/library-nail.');
const directionIndex = args.indexOf('--direction');
if (directionIndex >= 0 && args[directionIndex + 1] === 'local') {
  throw new Error(
    'library-nail has no local pull mode yet; push with --direction remote (default).',
  );
}

const tsx = join(root, 'node_modules', '.bin', 'tsx');
const source = join(root, '..', 'catalog source', 'product/library-nail');
const libraryArgs = ['scripts/library.ts', ...args, '--source', source];
const result = spawnSync(tsx, libraryArgs, {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
