import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runConfigMigrate } from '../../../src/config/configMigrate.js';
import { officialCopyPaths } from '../../../src/modules/plugins/application/updates/scopedPaths.js';
import type { ShopReleaseManifest } from '../../../src/modules/plugins/domain/releaseManifest.js';

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function packWithFactory(): string {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-migrate-'));
  mkdirSync(join(root, 'tuucho/kernel'), { recursive: true });
  mkdirSync(join(root, 'tuucho/plugin-sdk'), { recursive: true });
  mkdirSync(join(root, 'tuucho/plugins'), { recursive: true });
  mkdirSync(join(root, 'tuucho/factory-config'), { recursive: true });
  mkdirSync(join(root, 'tuucho/factory-config/migrations/kernel'), { recursive: true });
  mkdirSync(join(root, 'tuucho/factory-config/plugins/tuucho-signin-google'), { recursive: true });
  writeJson(join(root, 'tuucho/factory-config/config.json'), { http: { port: 3010, requestTimeoutMs: 8000 } });
  writeJson(join(root, 'tuucho/factory-config/config.private.example.json'), {
    database: { url: 'postgres://example' },
    jwt: { secret: 'x' },
    pii: { encryptionKey: 'k', lookupPepper: 'p' },
    ops: { token: 't' },
  });
  writeJson(join(root, 'tuucho/factory-config/config.dev.json'), { http: { frontendBaseUrl: 'http://localhost:5174' } });
  writeJson(join(root, 'tuucho/factory-config/config.private.dev.example.json'), { jwt: { secret: 'dev' } });
  writeJson(join(root, 'tuucho/factory-config/plugins.example.json'), { roots: ['src/plugins'], enableOnScan: [] });
  writeJson(join(root, 'tuucho/factory-config/plugins/tuucho-signin-google/config.json'), { clientId: 'from-factory' });
  writeJson(join(root, 'tuucho/factory-config/plugins/tuucho-signin-google/config.private.example.json'), {
    clientSecret: 'placeholder',
  });
  return root;
}

test('missing tuucho-config copies factory and does not copy live private from factory', async () => {
  const root = packWithFactory();
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.copied, true);
  assert.equal(result.errors.length, 0);
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/config.json'), 'utf8')) as { http: { port: number } };
  assert.equal(shop.http.port, 3010);
  const privateCopied = readFileSync(join(root, 'tuucho-config/config.private.json'), 'utf8');
  assert.ok(privateCopied.includes('postgres://example'));
  assert.equal(JSON.parse(readFileSync(join(root, 'tuucho-config/plugins.json'), 'utf8')).roots[0], 'src/plugins');
});

test('existing tuucho-config is not copied over', async () => {
  const root = packWithFactory();
  mkdirSync(join(root, 'tuucho-config'), { recursive: true });
  writeJson(join(root, 'tuucho-config/config.json'), { http: { port: 3999 } });
  writeJson(join(root, 'tuucho-config/config.private.json'), {
    database: { url: 'postgres://keep' },
    jwt: { secret: 'keep' },
    pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
    ops: { token: 'keep' },
  });
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.copied, false);
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/config.json'), 'utf8')) as { http: { port: number } };
  assert.equal(shop.http.port, 3999);
});

test('rename adds to and remove from existing public JSON', async () => {
  const root = packWithFactory();
  mkdirSync(join(root, 'tuucho-config'), { recursive: true });
  writeJson(join(root, 'tuucho-config/config.json'), { http: { smallPhotoSize: 400 } });
  writeJson(join(root, 'tuucho-config/config.private.json'), {
    database: { url: 'postgres://keep' },
    jwt: { secret: 'keep' },
    pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
    ops: { token: 'keep' },
  });
  writeJson(join(root, 'tuucho/factory-config/migrations/kernel/20261021_01_rename-photo.json'), {
    id: '20261021_01_rename-photo',
    owner: 'kernel',
    ops: [{ op: 'rename', from: 'http.smallPhotoSize', to: 'http.image.smallPx', layer: 'public', env: 'common' }],
  });
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.errors.length, 0);
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/config.json'), 'utf8')) as {
    http: { smallPhotoSize?: number; image?: { smallPx: number } };
  };
  assert.equal(shop.http.smallPhotoSize, undefined);
  assert.equal(shop.http.image?.smallPx, 400);
});

test('add skips when the path is already set', async () => {
  const root = packWithFactory();
  mkdirSync(join(root, 'tuucho-config'), { recursive: true });
  writeJson(join(root, 'tuucho-config/config.json'), { http: { requestTimeoutMs: 1 } });
  writeJson(join(root, 'tuucho-config/config.private.json'), {
    database: { url: 'postgres://keep' },
    jwt: { secret: 'keep' },
    pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
    ops: { token: 'keep' },
  });
  writeJson(join(root, 'tuucho/factory-config/migrations/kernel/20261021_01_add-timeout.json'), {
    id: '20261021_01_add-timeout',
    owner: 'kernel',
    ops: [
      { op: 'add', path: 'http.requestTimeoutMs', layer: 'public', env: 'common', fromFactory: true },
    ],
  });
  await runConfigMigrate({ packRoot: root });
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/config.json'), 'utf8')) as {
    http: { requestTimeoutMs: number };
  };
  assert.equal(shop.http.requestTimeoutMs, 1);
});

test('required private is not filled from factory on an existing shop', async () => {
  const root = packWithFactory();
  mkdirSync(join(root, 'tuucho-config'), { recursive: true });
  writeJson(join(root, 'tuucho-config/config.json'), { http: { port: 3010 } });
  writeJson(join(root, 'tuucho-config/config.private.json'), { jwt: { secret: 'only-this' } });
  writeJson(join(root, 'tuucho/factory-config/migrations/kernel/20261021_01_add-db.json'), {
    id: '20261021_01_add-db',
    owner: 'kernel',
    ops: [{ op: 'add', path: 'database.url', layer: 'private', env: 'common', fromFactory: true }],
  });
  const result = await runConfigMigrate({ packRoot: root });
  const priv = JSON.parse(readFileSync(join(root, 'tuucho-config/config.private.json'), 'utf8')) as {
    database?: { url?: string };
  };
  assert.equal(priv.database?.url, undefined);
  assert.ok(result.warnings.some((line) => line.includes('required private')));
});

test('plugin files still migrate when the plugin is not enabled (no DB)', async () => {
  const root = packWithFactory();
  mkdirSync(join(root, 'tuucho-config/plugins/tuucho-signin-google'), { recursive: true });
  writeJson(join(root, 'tuucho-config/config.json'), { http: { port: 3010 } });
  writeJson(join(root, 'tuucho-config/config.private.json'), {
    database: { url: 'postgres://keep' },
    jwt: { secret: 'keep' },
    pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
    ops: { token: 'keep' },
  });
  writeJson(join(root, 'tuucho-config/plugins/tuucho-signin-google/config.json'), { ttl: 1 });
  mkdirSync(join(root, 'tuucho/plugins/identity/google/tuucho-signin-google/config/migrations'), { recursive: true });
  writeJson(join(root, 'tuucho/plugins/identity/google/tuucho-signin-google/package.json'), {
    tuucho: { id: 'tuucho-signin-google' },
  });
  writeJson(
    join(root, 'tuucho/plugins/identity/google/tuucho-signin-google/config/migrations/20261021_01_rename-ttl.json'),
    {
      id: '20261021_01_rename-ttl',
      owner: 'tuucho-signin-google',
      ops: [{ op: 'rename', from: 'ttl', to: 'tokenTtl', layer: 'public' }],
    },
  );
  await runConfigMigrate({ packRoot: root });
  const plugin = JSON.parse(
    readFileSync(join(root, 'tuucho-config/plugins/tuucho-signin-google/config.json'), 'utf8'),
  ) as { ttl?: number; tokenTtl?: number };
  assert.equal(plugin.ttl, undefined);
  assert.equal(plugin.tokenTtl, 1);
});

test('Apply kernel paths include factory-config and never tuucho-config', () => {
  const manifest: ShopReleaseManifest = {
    tag: '0.0.4',
    kernel: '0.0.4',
    releaseId: 4,
    kernelMigrations: [],
    plugins: [],
  };
  const paths = officialCopyPaths('kernel', manifest);
  assert.ok(paths.includes('tuucho/factory-config'));
  assert.equal(
    paths.some((path) => path === 'tuucho-config' || path.startsWith('tuucho-config/')),
    false,
  );
});
