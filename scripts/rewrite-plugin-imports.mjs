#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kernelSrc = join(root, 'kernel/back/src');

const MOVES = [
  {
    plugin: 'tuucho-commerce-loyalty',
    oldRoot: join(kernelSrc, 'modules/loyalty'),
    newRoot: join(root, 'plugins/tuucho/commerce/loyalty/tuucho-commerce-loyalty/back/src'),
  },
  {
    plugin: 'tuucho-commerce-vouchers',
    oldRoot: join(kernelSrc, 'modules/vouchers'),
    newRoot: join(root, 'plugins/tuucho/commerce/vouchers/tuucho-commerce-vouchers/back/src'),
  },
  {
    plugin: 'tuucho-commerce-gift',
    oldRoot: join(kernelSrc, 'modules/gift'),
    newRoot: join(root, 'plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src'),
  },
  {
    plugin: 'tuucho-commerce-vinted-review',
    oldRoot: join(kernelSrc, 'modules/vintedReviews'),
    newRoot: join(root, 'plugins/tuucho/commerce/vinted-review/tuucho-commerce-vinted-review/back/src'),
  },
];

const FILE_MOVES = {
  [join(root, 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRules.ts')]: join(
    kernelSrc,
    'modules/commerce/application/cartRules.ts',
  ),
  [join(root, 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRulesList.ts')]: join(
    kernelSrc,
    'modules/commerce/application/cartRulesList.ts',
  ),
  [join(root, 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartGiftLines.ts')]: join(
    kernelSrc,
    'modules/commerce/application/cartGiftLines.ts',
  ),
  [join(root, 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRuleEvaluation.ts')]: join(
    kernelSrc,
    'modules/commerce/domain/cartRuleEvaluation.ts',
  ),
};

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|js)$/.test(name)) files.push(full);
  }
  return files;
}

function tryResolve(fromDir, spec) {
  const resolved = resolve(fromDir, spec);
  const noExt = resolved.replace(/\.(js|ts)$/, '');
  const candidates = [
    resolved,
    `${noExt}.ts`,
    `${noExt}.js`,
    join(noExt, 'index.ts'),
    join(noExt, 'index.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function oldPathFor(newFile) {
  if (FILE_MOVES[newFile]) return FILE_MOVES[newFile];
  for (const move of MOVES) {
    if (newFile.startsWith(move.newRoot + '/') || newFile === move.newRoot) {
      return join(move.oldRoot, relative(move.newRoot, newFile));
    }
  }
  return null;
}

function pluginRootForResolvedOld(abs) {
  for (const move of MOVES) {
    const oldTs = abs.replace(/\.js$/, '.ts');
    if (oldTs.startsWith(move.oldRoot + '/') || abs.startsWith(move.oldRoot + '/')) {
      const rel = relative(move.oldRoot, oldTs.endsWith('.ts') ? oldTs : `${oldTs}.ts`);
      return { plugin: move.plugin, newFile: join(move.newRoot, rel.replace(/\.js$/, '.ts')) };
    }
  }
  for (const [newFile, oldFile] of Object.entries(FILE_MOVES)) {
    const oldNoExt = oldFile.replace(/\.ts$/, '');
    const absNoExt = abs.replace(/\.(js|ts)$/, '');
    if (absNoExt === oldNoExt || abs === oldFile) return { plugin: 'tuucho-commerce-cart-rules', newFile };
  }
  return null;
}

function toJsSpec(pathSpec, originalSpec) {
  let spec = pathSpec.replace(/\\/g, '/');
  if (originalSpec.endsWith('.js')) {
    spec = spec.replace(/\.ts$/, '.js');
    if (!spec.endsWith('.js')) spec += '.js';
  }
  return spec;
}

function rewriteFile(newFile) {
  const oldFile = oldPathFor(newFile);
  if (!oldFile) return 0;
  const text = readFileSync(newFile, 'utf8');
  let count = 0;
  const next = text.replace(
    /(from\s+|import\s*\(\s*)(['"])(\.[^'"]+)\2/g,
    (match, prefix, quote, spec) => {
      const existsNow = tryResolve(dirname(newFile), spec);
      if (existsNow) return match;
      const resolvedOld = resolve(dirname(oldFile), spec);
      const moved = pluginRootForResolvedOld(resolvedOld);
      if (moved) {
        let rel = relative(dirname(newFile), moved.newFile).replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = `./${rel}`;
        rel = toJsSpec(rel.replace(/\.ts$/, ''), spec);
        if (rel === spec) return match;
        count += 1;
        return `${prefix}${quote}${rel}${quote}`;
      }
      let kernelRel = relative(kernelSrc, resolvedOld).replace(/\\/g, '/');
      if (kernelRel.startsWith('..')) {
        kernelRel = relative(kernelSrc, resolve(dirname(oldFile), spec)).replace(/\\/g, '/');
      }
      if (kernelRel.startsWith('..')) return match;
      kernelRel = toJsSpec(kernelRel.replace(/\.ts$/, ''), spec);
      count += 1;
      return `${prefix}${quote}#kernel/${kernelRel}${quote}`;
    },
  );
  if (next !== text) writeFileSync(newFile, next);
  return count;
}

let total = 0;
for (const move of MOVES) {
  for (const file of walk(move.newRoot)) {
    total += rewriteFile(file);
  }
}
for (const file of Object.keys(FILE_MOVES)) {
  if (existsSync(file)) total += rewriteFile(file);
}

console.log(`[rewrite] updated ${total} import specifiers`);
