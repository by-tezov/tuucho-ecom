import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyTestEnvOverlays,
  flattenConfigToEnv,
  inspectConfig,
  resolveAppTarget,
} from '../../../src/config/loadJsonConfig.js';

function writeTree(
  dir: string,
  files: Record<string, unknown>,
): void {
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
  assert.throws(() => resolveAppTarget('Staging'), /folder name/);
});

test('missing env folder errors naming it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuucho-config-'));
  writeTree(dir, {
    'config.json': { http: { port: 3010 } },
    'config.private.example.json': {},
    'dev/config.json': { http: { apiBaseUrl: 'http://localhost:3010' } },
    'dev/config.private.example.json': requiredPrivate,
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
    'dev/config.json': { http: { apiBaseUrl: 'http://localhost:3010' } },
    'dev/config.private.example.json': requiredPrivate,
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
    'dev/config.json': {},
    'dev/config.private.example.json': requiredPrivate,
    'dev/config.private.json': { database: { url: '' }, jwt: {} },
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
    'dev/config.json': { http: { port: 2 } },
    'dev/config.private.example.json': requiredPrivate,
    'dev/config.private.json': {
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
