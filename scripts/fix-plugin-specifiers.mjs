import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kernelSrc = join(root, 'kernel/back/src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rewriteFile(file) {
  let text = readFileSync(file, 'utf8');
  const original = text;
  text = text.replaceAll("from '#sdk'", "from '@tuucho/plugin-sdk'");
  text = text.replaceAll("from \"#sdk\"", "from '@tuucho/plugin-sdk'");
  text = text.replace(/from '#kernel\/([^']+)'/g, (_m, spec) => {
    const target = join(kernelSrc, spec);
    let rel = relative(dirname(file), target).replaceAll('\\', '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `from '${rel}'`;
  });
  if (text !== original) {
    writeFileSync(file, text);
    return true;
  }
  return false;
}

let n = 0;
for (const dir of [join(root, 'plugins')]) {
  const files = walk(dir);
  for (const file of files) {
    if (/\.(ts|tsx|js|mjs)$/.test(file) && rewriteFile(file)) n += 1;
  }
  for (const file of files) {
    if (!file.endsWith('package.json')) continue;
    try {
      const json = JSON.parse(readFileSync(file, 'utf8'));
      delete json.imports;
      const rel = relative(dirname(file), join(root, 'plugin-sdk')).replaceAll('\\', '/');
      json.dependencies = {
        ...(json.dependencies ?? {}),
        '@tuucho/plugin-sdk': `file:${rel.startsWith('.') ? rel : `./${rel}`}`,
      };
      writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    } catch {
      // not a package
    }
  }
}
console.log('rewrote', n, 'files');
