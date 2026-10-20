#!/usr/bin/env node
/**
 * One-shot tree reshape: kernel/{back,front} + plugins/<id>/{package.json,back,front,docs}.
 * Run from the repo root on the current branch.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, cwd = root) {
  console.log(`[reshape] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
}

function gitMv(from, to) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  run('git', ['mv', from, to]);
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function rewriteRelativeImports(filePath, oldFilePath, movedRootOld, movedRootNew, kernelSrc) {
  const text = readFileSync(filePath, 'utf8');
  const next = text.replace(
    /(from\s+|import\s*\(\s*|export\s+\*\s+from\s+)(['"])(\.[^'"]+)\2/g,
    (match, prefix, quote, spec) => {
      const resolvedOld = resolve(dirname(oldFilePath), spec);
      const withoutExt = resolvedOld.replace(/\.(js|ts)$/, '');
      const candidates = [
        resolvedOld,
        `${withoutExt}.ts`,
        `${withoutExt}.js`,
        join(withoutExt, 'index.ts'),
        join(withoutExt, 'index.js'),
      ];
      const targetOld = candidates.find((candidate) => existsSync(candidate) || candidate === resolvedOld) ?? resolvedOld;
      const inMoved = targetOld === movedRootOld || targetOld.startsWith(movedRootOld + '/');
      if (inMoved) {
        const relInside = relative(movedRootOld, targetOld);
        const newTarget = join(movedRootNew, relInside);
        let rel = relative(dirname(filePath), newTarget).replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = `./${rel}`;
        const specExt = spec.endsWith('.js') ? '.js' : spec.endsWith('.ts') ? '.ts' : '';
        if (specExt && !rel.endsWith(specExt) && !rel.endsWith('.js')) {
          rel = rel.replace(/\.ts$/, '.js');
          if (!rel.endsWith('.js') && !rel.endsWith('/')) rel += spec.endsWith('.js') ? '' : '';
        }
        if (spec.endsWith('.js') && !rel.endsWith('.js')) {
          rel = rel.replace(/\.ts$/, '.js');
          if (!rel.endsWith('.js')) rel += '.js';
        }
        return `${prefix}${quote}${rel}${quote}`;
      }
      let kernelRel = relative(kernelSrc, targetOld).replace(/\\/g, '/');
      if (kernelRel.startsWith('..')) {
        kernelRel = relative(kernelSrc, resolvedOld).replace(/\\/g, '/');
      }
      if (kernelRel.startsWith('..')) return match;
      if (!kernelRel.endsWith('.js') && spec.endsWith('.js')) {
        kernelRel = kernelRel.replace(/\.ts$/, '.js');
        if (!kernelRel.endsWith('.js')) kernelRel += '.js';
      }
      return `${prefix}${quote}#kernel/${kernelRel}${quote}`;
    },
  );
  if (next !== text) writeFileSync(filePath, next);
}

const MODULE_MOVES = [
  { from: 'src/modules/loyalty', plugin: 'tuucho-commerce-loyalty' },
  { from: 'src/modules/vouchers', plugin: 'tuucho-commerce-vouchers' },
  { from: 'src/modules/gift', plugin: 'tuucho-commerce-gift' },
  { from: 'src/modules/vintedReviews', plugin: 'tuucho-commerce-vinted-review' },
];

const FILE_MOVES = [
  {
    plugin: 'tuucho-commerce-cart-rules',
    files: [
      'src/modules/commerce/application/cartRules.ts',
      'src/modules/commerce/application/cartRulesList.ts',
      'src/modules/commerce/application/cartGiftLines.ts',
      'src/modules/commerce/domain/cartRuleEvaluation.ts',
    ],
  },
];

if (!existsSync(join(root, 'back')) && existsSync(join(root, 'kernel/back'))) {
  console.log('[reshape] already moved to kernel/; continuing file moves if needed');
} else {
  if (!existsSync(join(root, 'kernel/back'))) {
    run('git', ['mv', 'back', 'kernel/back']);
  }
  if (!existsSync(join(root, 'kernel/front'))) {
    run('git', ['mv', 'front', 'kernel/front']);
  }
}

const bundled = join(root, 'kernel/back/plugins');
if (existsSync(bundled)) {
  mkdirSync(join(root, 'plugins'), { recursive: true });
  for (const name of readdirSync(bundled)) {
    if (name.startsWith('.')) continue;
    const dest = join('plugins', name);
    if (!existsSync(join(root, dest))) {
      gitMv(join('kernel/back/plugins', name), dest);
    }
  }
}

const kernelSrc = join(root, 'kernel/back/src');

for (const move of MODULE_MOVES) {
  const from = join(root, 'kernel/back', move.from);
  const toDir = join(root, 'plugins', move.plugin, 'back/src');
  if (!existsSync(from)) {
    console.log(`[reshape] skip missing ${move.from}`);
    continue;
  }
  mkdirSync(dirname(toDir), { recursive: true });
  if (existsSync(toDir) && readdirSync(toDir).length > 0) {
    console.log(`[reshape] already moved ${move.plugin}`);
    continue;
  }
  const oldFiles = walk(from);
  const oldMap = new Map(oldFiles.map((file) => [file, file]));
  run('git', ['mv', join('kernel/back', move.from), join('plugins', move.plugin, 'back/src')]);
  const newFiles = walk(toDir);
  for (const newFile of newFiles) {
    if (!/\.(ts|js|mjs)$/.test(newFile)) continue;
    const rel = relative(toDir, newFile);
    const oldFile = join(from, rel);
    rewriteRelativeImports(newFile, oldFile, from, toDir, kernelSrc);
  }
  void oldMap;
}

for (const group of FILE_MOVES) {
  const destRoot = join(root, 'plugins', group.plugin, 'back/src');
  mkdirSync(destRoot, { recursive: true });
  for (const file of group.files) {
    const from = join(root, 'kernel/back', file);
    if (!existsSync(from)) continue;
    const base = file.split('/').pop();
    const dest = join(destRoot, base);
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) continue;
    run('git', ['mv', join('kernel/back', file), join('plugins', group.plugin, 'back', base)]);
    // git mv into back/ not back/src — fix
  }
}

console.log('[reshape] tree move complete');
