#!/usr/bin/env node
/** One-shot 0.0.4 pack move. Safe to re-run if tuucho/ already exists. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpSync, renameSync } from 'node:fs';

const shop = join(dirname(fileURLToPath(import.meta.url)), '..');

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function moveIfPresent(from, to) {
  if (!existsSync(from)) return;
  ensureDir(dirname(to));
  if (existsSync(to)) {
    console.log(`skip move, dest exists: ${relative(shop, to)}`);
    return;
  }
  renameSync(from, to);
  console.log(`moved ${relative(shop, from)} -> ${relative(shop, to)}`);
}

function moveChildren(from, to) {
  if (!existsSync(from)) return;
  ensureDir(to);
  for (const name of readdirSync(from)) {
    moveIfPresent(join(from, name), join(to, name));
  }
}

if (!existsSync(join(shop, 'tuucho', 'kernel')) && existsSync(join(shop, 'kernel'))) {
  ensureDir(join(shop, 'tuucho'));
  moveIfPresent(join(shop, 'kernel'), join(shop, 'tuucho', 'kernel'));
}
if (!existsSync(join(shop, 'tuucho', 'plugin-sdk')) && existsSync(join(shop, 'plugin-sdk'))) {
  moveIfPresent(join(shop, 'plugin-sdk'), join(shop, 'tuucho', 'plugin-sdk'));
}
if (existsSync(join(shop, 'plugins', 'tuucho'))) {
  moveChildren(join(shop, 'plugins', 'tuucho'), join(shop, 'tuucho', 'plugins'));
  rmSync(join(shop, 'plugins', 'tuucho'), { recursive: true, force: true });
}
if (existsSync(join(shop, 'plugins', 'user'))) {
  moveChildren(join(shop, 'plugins', 'user'), join(shop, 'src', 'plugins'));
  rmSync(join(shop, 'plugins', 'user'), { recursive: true, force: true });
}
if (existsSync(join(shop, 'plugins'))) {
  const leftover = readdirSync(join(shop, 'plugins'));
  if (leftover.length === 0) rmSync(join(shop, 'plugins'), { recursive: true, force: true });
}

const oldConfig = join(shop, 'tuucho', 'kernel', 'back', 'config');
const newConfig = join(shop, 'tuucho-config');
if (existsSync(oldConfig)) {
  ensureDir(newConfig);
  for (const name of readdirSync(oldConfig)) {
    const dest = join(newConfig, name);
    if (!existsSync(dest)) cpSync(join(oldConfig, name), dest, { recursive: true });
  }
  rmSync(oldConfig, { recursive: true, force: true });
  console.log('relocated kernel config -> tuucho-config/');
}

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === '.git' || name.name === 'dist') continue;
    const path = join(dir, name.name);
    if (name.isDirectory()) walk(path, visit);
    else visit(path);
  }
}

function posixRel(fromDir, toFile) {
  const rel = relative(fromDir, toFile).replaceAll('\\', '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

const sdk = join(shop, 'tuucho', 'plugin-sdk');

walk(join(shop, 'tuucho', 'plugins'), (path) => {
  if (!path.endsWith('package.json')) return;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw.tuucho) return;
  if (typeof raw.tuucho.installPath === 'string' && raw.tuucho.installPath.startsWith('plugins/tuucho/')) {
    raw.tuucho.installPath = `tuucho/plugins/${raw.tuucho.installPath.slice('plugins/tuucho/'.length)}`;
  }
  if (raw.dependencies?.['@tuucho/plugin-sdk']) {
    raw.dependencies['@tuucho/plugin-sdk'] = `file:${posixRel(dirname(path), sdk)}`;
  }
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
});

walk(join(shop, 'src', 'plugins'), (path) => {
  if (!path.endsWith('package.json')) return;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw.tuucho) return;
  if (typeof raw.tuucho.installPath === 'string' && raw.tuucho.installPath.startsWith('plugins/user/')) {
    raw.tuucho.installPath = `src/plugins/${raw.tuucho.installPath.slice('plugins/user/'.length)}`;
  }
  if (raw.dependencies?.['@tuucho/plugin-sdk']) {
    raw.dependencies['@tuucho/plugin-sdk'] = `file:${posixRel(dirname(path), sdk)}`;
  }
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
});

const releasePath = join(shop, 'release.json');
if (existsSync(releasePath)) {
  const release = JSON.parse(readFileSync(releasePath, 'utf8'));
  if (Array.isArray(release.plugins)) {
    for (const plugin of release.plugins) {
      if (typeof plugin.installPath === 'string' && plugin.installPath.startsWith('plugins/tuucho/')) {
        plugin.installPath = `tuucho/plugins/${plugin.installPath.slice('plugins/tuucho/'.length)}`;
      }
    }
  }
  writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`);
}

console.log('reshape pack done');
