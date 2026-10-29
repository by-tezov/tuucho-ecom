import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyTestEnvOverlays,
  flattenConfigToEnv,
  inspectConfig,
  listEnvironments,
  resolveAppTarget,
} from '../../../src/config/loadJsonConfig.js';

function writeTree(dir: string, files: Record<string, unknown>): void {
  for (const [relative, body] of Object.entries(files)) {
    const path = join(dir, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(body));
  }
}

const requiredPrivate = {
  database: { url: 'postgres://tuucho:changeme@127.0.0.1:5434/tuucho_ecom' },
  jwt: { secret: 'dummy-jwt' },
  pii: { encryptionKey: 'A', lookupPepper: 'B' },
  ops: { token: 'dummy-ops' },
};

test('APP_TARGET defaults to dev and accepts a new folder name', () => {
  assert.equal(resolveAppTarget(undefined), 'dev');
  assert.equal(resolveAppTarget(''), 'dev');
  assert.equal(resolveAppTarget('staging'), 'staging');
  assert.throws(() => resolveAppTarget('Staging'), /APP_TARGET must match/);
});

test('listEnvironments ignores config.private.json and config.role.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': {},
    'config.dev.json': {},
    'config.preprod.json': {},
    'config.private.json': requiredPrivate,
    'config.role.json': {},
  });
  assert.deepEqual(listEnvironments(dir), ['dev', 'preprod']);
});

test('missing env file errors naming it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': { http: { port: 3010 } },
    'config.private.example.json': {},
    'config.dev.json': { http: { apiBaseUrl: 'http://localhost:3010' } },
    'config.private.dev.example.json': requiredPrivate,
  });
  const status = inspectConfig(dir, 'staging');
  assert.equal(status.ok, false);
  assert.ok(status.errors.some((line) => line.includes('staging')));
  assert.ok(status.errors.some((line) => line.includes('known: dev')));
});

test('missing private + example present warns and launches', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': { http: { port: 3010 } },
    'config.private.example.json': {},
    'config.dev.json': { http: { apiBaseUrl: 'http://localhost:3010' } },
    'config.private.dev.example.json': requiredPrivate,
  });
  const status = inspectConfig(dir, 'dev');
  assert.equal(status.ok, true);
  assert.equal(status.privateSource, 'example');
  assert.ok(status.warnings.some((line) => line.includes('placeholders')));
});

test('present private with missing keys errors naming each key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': {},
    'config.private.example.json': {},
    'config.dev.json': {},
    'config.private.dev.example.json': requiredPrivate,
    'config.private.dev.json': { database: { url: '' }, jwt: {} },
  });
  const status = inspectConfig(dir, 'dev');
  assert.equal(status.ok, false);
  assert.ok(status.errors.some((line) => line.includes('database.url')));
  assert.ok(status.errors.some((line) => line.includes('jwt.secret')));
});

test('merge is top to bottom; bottom overrides top', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': { http: { port: 1, apiBaseUrl: 'common' }, logs: { api: true } },
    'config.private.example.json': {},
    'config.private.json': { jwt: { secret: 'common-jwt' }, ops: { token: 'common-ops' } },
    'config.dev.json': { http: { port: 2 } },
    'config.private.dev.example.json': requiredPrivate,
    'config.private.dev.json': {
      ...requiredPrivate,
      jwt: { secret: 'env-jwt' },
    },
  });
  const status = inspectConfig(dir, 'dev');
  assert.equal(status.ok, true);
  assert.equal(status.merged?.http && (status.merged.http as { port: number }).port, 2);
  assert.equal(status.merged?.http && (status.merged.http as { apiBaseUrl: string }).apiBaseUrl, 'common');
  assert.equal(status.merged?.jwt && (status.merged.jwt as { secret: string }).secret, 'env-jwt');
  assert.equal(status.merged?.logs && (status.merged.logs as { api: boolean }).api, true);
});

test('flatten maps nested kernel JSON onto leftover env names', () => {
  const env = flattenConfigToEnv({
    http: { port: 3010, corsOrigins: ['https://shop.example'] },
    jwt: { secret: 'dummy' },
    database: { url: 'postgres://tuucho:changeme@127.0.0.1:5434/tuucho_ecom' },
  });
  assert.equal(env.APP_PORT, '3010');
  assert.equal(env.CORS_ORIGIN, 'https://shop.example');
  assert.equal(env.JWT_SECRET, 'dummy');
  assert.equal(env.DATABASE_URL, 'postgres://tuucho:changeme@127.0.0.1:5434/tuucho_ecom');
});

test('TUUCHO_TEST overlays win over leftover URL env without touching APP_PORT', () => {
  const env: NodeJS.ProcessEnv = {
    URL_API_BASE: 'http://localhost:3010',
    URL_FRONTEND_BASE: 'http://localhost:5174',
    APP_PORT: '3010',
    TUUCHO_TEST_API_BASE: 'http://127.0.0.1:3999/',
    TUUCHO_TEST_SITE_URL: 'http://127.0.0.1:4173/',
    TUUCHO_TEST_PUBLIC_MEDIA: 'http://127.0.0.1:3999/media',
  };
  applyTestEnvOverlays(env);
  assert.equal(env.URL_API_BASE, 'http://127.0.0.1:3999');
  assert.equal(env.URL_FRONTEND_BASE, 'http://127.0.0.1:4173');
  assert.equal(env.URL_PUBLIC_MEDIA, 'http://127.0.0.1:3999/media');
  assert.equal(env.APP_PORT, '3010');
});

test('flatten maps the i18n and identity test-token sections onto env names', () => {
  const env = flattenConfigToEnv({
    i18n: { default: 'fr', enabled: ['fr', 'en'] },
    identity: { testTokenPrefix: 'shop-test-' },
  });
  assert.equal(env.I18N_DEFAULT_LANG, 'fr');
  assert.equal(env.I18N_ENABLED_LANGS, 'fr,en');
  assert.equal(env.IDENTITY_TEST_TOKEN_PREFIX, 'shop-test-');
});

test('TUUCHO_TEST_LOADING_MIN fills the three loading floors only when unset', () => {
  const env: NodeJS.ProcessEnv = {
    VITE_LOADING_MIN: '900',
    TUUCHO_TEST_LOADING_MIN: '50',
    TUUCHO_TEST_BOOT_SPLASH_SPEED: '4',
  };
  applyTestEnvOverlays(env);
  assert.equal(env.VITE_LOADING_MIN, '900');
  assert.equal(env.VITE_LOADING_MIN_SHORT, '50');
  assert.equal(env.VITE_LOADING_MIN_LONG, '50');
  assert.equal(env.VITE_BOOT_SPLASH_SPEED, '4');
});

test('config.role.json is not an environment name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': {},
    'config.dev.json': {},
    'config.role.json': { roles: [] },
    'config.role.dev.json': { roles: [] },
  });
  assert.deepEqual(listEnvironments(dir), ['dev']);
});

test('TUUCHO_TEST value overlays leave untouched targets alone when blank', () => {
  const env: NodeJS.ProcessEnv = { TUUCHO_TEST_LOADING_MIN: '  ' };
  applyTestEnvOverlays(env);
  assert.equal(env.VITE_LOADING_MIN, undefined);
  assert.equal(env.VITE_BOOT_SPLASH_SPEED, undefined);
});
