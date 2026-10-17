#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');

const MAP = [
  ['modules/loyalty/', 'plugins/tuucho/commerce/loyalty/tuucho-commerce-loyalty/back/src/'],
  ['modules/vouchers/', 'plugins/tuucho/commerce/vouchers/tuucho-commerce-vouchers/back/src/'],
  ['modules/gift/', 'plugins/tuucho/commerce/gift/tuucho-commerce-gift/back/src/'],
  ['modules/vintedReviews/', 'plugins/tuucho/commerce/vinted-review/tuucho-commerce-vinted-review/back/src/'],
  ['commerce/application/cartRules.js', 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRules.js'],
  ['commerce/application/cartRulesList.js', 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRulesList.js'],
  ['commerce/application/cartGiftLines.js', 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartGiftLines.js'],
  ['commerce/domain/cartRuleEvaluation.js', 'plugins/tuucho/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartRuleEvaluation.js'],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|js|mjs)$/.test(name)) files.push(full);
  }
  return files;
}

function retarget(fromFile, spec) {
  const cleaned = spec.replace(/^\.\.\//g, (all, _o, s) => all);
  for (const [from, to] of MAP) {
    const idx = spec.lastIndexOf(from);
    if (idx === -1) continue;
    const rest = spec.slice(idx + from.length);
    const abs = join(root, to + rest);
    let rel = relative(dirname(fromFile), abs).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
  }
  return null;
  void cleaned;
}

let n = 0;
for (const file of walk(join(root, 'kernel/back'))) {
  let text = readFileSync(file, 'utf8');
  const next = text.replace(/(from\s+|import\s*\(\s*)(['"])([^'"]+)\2/g, (match, prefix, quote, spec) => {
    if (!spec.includes('loyalty') && !spec.includes('vouchers') && !spec.includes('gift') && !spec.includes('vintedReviews') && !spec.includes('cartRules') && !spec.includes('cartGiftLines') && !spec.includes('cartRuleEvaluation')) {
      return match;
    }
    if (spec.includes('/plugins/')) return match;
    const rewritten = retarget(file, spec);
    if (!rewritten || rewritten === spec) return match;
    return `${prefix}${quote}${rewritten}${quote}`;
  });
  if (next !== text) {
    writeFileSync(file, next);
    n += 1;
  }
}
console.log(`rewrote ${n} kernel files`);
