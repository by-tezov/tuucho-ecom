import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'kernel/back/src');
const bridgeAbs = join(srcRoot, 'modules/plugins/application/pluginBridges.ts');

const PATTERNS = [
  /from '(\.\.\/)+vouchers\/application\/vouchers\.js'/g,
  /from '(\.\.\/)+vouchers\/application\/voucherHoldExtension\.js'/g,
  /from '(\.\.\/)+loyalty\/application\/loyalty\.js'/g,
  /from '(\.\.\/)+loyalty\/application\/loyaltyPlugin\.js'/g,
  /from '(\.\.\/)+loyalty\/application\/loyaltyHoldExtension\.js'/g,
  /from '(\.\.\/)+loyalty\/application\/loyaltyReminders\.js'/g,
  /from '(\.\.\/)+loyalty\/application\/merchandiseLoyaltyPreview\.js'/g,
  /from '(\.\.\/)+gift\/application\/giftCheckout\.js'/g,
  /from '(\.\.\/)+gift\/domain\/errors\.js'/g,
  /from '(\.\.\/)+gift\/application\/giftSettings\.js'/g,
  /from '(\.\.\/)+gift\/application\/giverCartMeta\.js'/g,
  /from '(\.\.\/)+plugins\/commerce-[^']+'/g,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function toBridgeImport(fromFile) {
  let rel = relative(dirname(fromFile), bridgeAbs).replaceAll('\\', '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.ts$/, '.js');
}

let changed = 0;
for (const file of walk(srcRoot)) {
  if (file === bridgeAbs) continue;
  let text = readFileSync(file, 'utf8');
  const original = text;
  let hit = false;
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) hit = true;
  }
  if (!hit) continue;
  const spec = toBridgeImport(file);
  for (const pattern of PATTERNS) {
    text = text.replace(pattern, `from '${spec}'`);
  }
  if (text !== original) {
    writeFileSync(file, text);
    changed += 1;
    console.log('rewrote', relative(root, file));
  }
}
console.log(`updated ${changed} files`);
