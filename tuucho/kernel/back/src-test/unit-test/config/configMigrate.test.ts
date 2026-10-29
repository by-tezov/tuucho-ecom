import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  mkdirSync(join(root, 'tuucho/factory-backup/config/kernel/dev'), { recursive: true });
  mkdirSync(join(root, 'tuucho/factory-backup/migrations/kernel'), { recursive: true });
  mkdirSync(join(root, 'tuucho/factory-backup/config/plugins/tuucho-signin-google'), { recursive: true });
  mkdirSync(join(root, 'tuucho/factory-backup/plugins/demo/guides/page-guides'), { recursive: true });
  writeJson(join(root, 'tuucho/factory-backup/config/kernel/config.json'), {
    environments: {
      dev: {
        public: 'dev/config.json',
        private: 'dev/config.private.json',
      },
    },
    http: { port: 3010, requestTimeoutMs: 8000 },
  });
  writeJson(join(root, 'tuucho/factory-backup/config/kernel/config.private.example.json'), {
    database: { url: 'postgres://example' },
    jwt: { secret: 'x' },
    pii: { encryptionKey: 'k', lookupPepper: 'p' },
    ops: { token: 't' },
  });
  writeJson(join(root, 'tuucho/factory-backup/config/kernel/dev/config.json'), {
    http: { frontendBaseUrl: 'http://localhost:5174' },
  });
  writeJson(join(root, 'tuucho/factory-backup/config/kernel/dev/config.private.example.json'), {
    jwt: { secret: 'dev' },
  });
  writeJson(join(root, 'tuucho/factory-backup/config/plugins.example.json'), {
    roots: ['src/plugins'],
    enableOnScan: [],
  });
  writeJson(join(root, 'tuucho/factory-backup/config/plugins/tuucho-signin-google/config.json'), {
    clientId: 'from-factory',
  });
  writeJson(join(root, 'tuucho/factory-backup/config/plugins/tuucho-signin-google/config.private.example.json'), {
    clientSecret: 'placeholder',
  });
  writeJson(join(root, 'tuucho/factory-backup/plugins/demo/guides/page-guides/package.json'), {
    name: '@tuucho/plugin-page-guides',
    tuucho: { id: 'page-guides', installPath: 'src/plugins/demo/guides/page-guides' },
  });
  return root;
}

test('missing tuucho-config copies factory and does not copy live private from factory', async () => {
  const root = packWithFactory();
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.copied, true);
  assert.equal(result.copiedPlugins, true);
  assert.equal(result.errors.length, 0);
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/kernel/config.json'), 'utf8')) as {
    http: { port: number };
  };
  assert.equal(shop.http.port, 3010);
  const privateCopied = readFileSync(join(root, 'tuucho-config/kernel/config.private.json'), 'utf8');
  assert.ok(privateCopied.includes('postgres://example'));
  assert.ok(existsSync(join(root, 'tuucho-config/kernel/dev/config.json')));
  assert.equal(JSON.parse(readFileSync(join(root, 'tuucho-config/plugins.json'), 'utf8')).roots[0], 'src/plugins');
  assert.ok(existsSync(join(root, 'src/plugins/demo/guides/page-guides/package.json')));
});

function writeExistingShop(root: string, publicCfg: unknown, privateCfg: unknown): void {
  mkdirSync(join(root, 'tuucho-config/kernel'), { recursive: true });
  writeJson(join(root, 'tuucho-config/kernel/config.json'), publicCfg);
  writeJson(join(root, 'tuucho-config/kernel/config.private.json'), privateCfg);
}

test('existing tuucho-config is not copied over', async () => {
  const root = packWithFactory();
  writeExistingShop(
    root,
    { http: { port: 3999 } },
    {
      database: { url: 'postgres://keep' },
      jwt: { secret: 'keep' },
      pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
      ops: { token: 'keep' },
    },
  );
  mkdirSync(join(root, 'src/plugins/custom'), { recursive: true });
  writeJson(join(root, 'src/plugins/custom/marker.json'), { keep: true });
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.copied, false);
  assert.equal(result.copiedPlugins, false);
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/kernel/config.json'), 'utf8')) as {
    http: { port: number };
  };
  assert.equal(shop.http.port, 3999);
  assert.equal(JSON.parse(readFileSync(join(root, 'src/plugins/custom/marker.json'), 'utf8')).keep, true);
  assert.equal(existsSync(join(root, 'src/plugins/demo/guides/page-guides/package.json')), false);
});

test('missing src/plugins copies factory plugins even when tuucho-config exists', async () => {
  const root = packWithFactory();
  writeExistingShop(
    root,
    { http: { port: 3999 } },
    {
      database: { url: 'postgres://keep' },
      jwt: { secret: 'keep' },
      pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
      ops: { token: 'keep' },
    },
  );
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.copied, false);
  assert.equal(result.copiedPlugins, true);
  assert.ok(existsSync(join(root, 'src/plugins/demo/guides/page-guides/package.json')));
});

test('rename adds to and remove from existing public JSON', async () => {
  const root = packWithFactory();
  writeExistingShop(
    root,
    { http: { smallPhotoSize: 400 } },
    {
      database: { url: 'postgres://keep' },
      jwt: { secret: 'keep' },
      pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
      ops: { token: 'keep' },
    },
  );
  mkdirSync(join(root, 'src/plugins'), { recursive: true });
  writeJson(join(root, 'tuucho/factory-backup/migrations/kernel/20261021_01_rename-photo.json'), {
    id: '20261021_01_rename-photo',
    owner: 'kernel',
    ops: [{ op: 'rename', from: 'http.smallPhotoSize', to: 'http.image.smallPx', layer: 'public', env: 'common' }],
  });
  const result = await runConfigMigrate({ packRoot: root });
  assert.equal(result.errors.length, 0);
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/kernel/config.json'), 'utf8')) as {
    http: { smallPhotoSize?: number; image?: { smallPx: number } };
  };
  assert.equal(shop.http.smallPhotoSize, undefined);
  assert.equal(shop.http.image?.smallPx, 400);
});

test('add skips when the path is already set', async () => {
  const root = packWithFactory();
  writeExistingShop(
    root,
    { http: { requestTimeoutMs: 1 } },
    {
      database: { url: 'postgres://keep' },
      jwt: { secret: 'keep' },
      pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
      ops: { token: 'keep' },
    },
  );
  mkdirSync(join(root, 'src/plugins'), { recursive: true });
  writeJson(join(root, 'tuucho/factory-backup/migrations/kernel/20261021_01_add-timeout.json'), {
    id: '20261021_01_add-timeout',
    owner: 'kernel',
    ops: [
      { op: 'add', path: 'http.requestTimeoutMs', layer: 'public', env: 'common', fromFactory: true },
    ],
  });
  await runConfigMigrate({ packRoot: root });
  const shop = JSON.parse(readFileSync(join(root, 'tuucho-config/kernel/config.json'), 'utf8')) as {
    http: { requestTimeoutMs: number };
  };
  assert.equal(shop.http.requestTimeoutMs, 1);
});

test('required private is not filled from factory on an existing shop', async () => {
  const root = packWithFactory();
  writeExistingShop(root, { http: { port: 3010 } }, { jwt: { secret: 'only-this' } });
  mkdirSync(join(root, 'src/plugins'), { recursive: true });
  writeJson(join(root, 'tuucho/factory-backup/migrations/kernel/20261021_01_add-db.json'), {
    id: '20261021_01_add-db',
    owner: 'kernel',
    ops: [{ op: 'add', path: 'database.url', layer: 'private', env: 'common', fromFactory: true }],
  });
  const result = await runConfigMigrate({ packRoot: root });
  const priv = JSON.parse(readFileSync(join(root, 'tuucho-config/kernel/config.private.json'), 'utf8')) as {
    database?: { url?: string };
  };
  assert.equal(priv.database?.url, undefined);
  assert.ok(result.warnings.some((line) => line.includes('required private')));
});

test('plugin files still migrate when the plugin is not enabled (no DB)', async () => {
  const root = packWithFactory();
  mkdirSync(join(root, 'tuucho-config/plugins/tuucho-signin-google'), { recursive: true });
  writeExistingShop(
    root,
    { http: { port: 3010 } },
    {
      database: { url: 'postgres://keep' },
      jwt: { secret: 'keep' },
      pii: { encryptionKey: 'keep', lookupPepper: 'keep' },
      ops: { token: 'keep' },
    },
  );
  mkdirSync(join(root, 'src/plugins'), { recursive: true });
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

test('Apply kernel paths include factory-backup and never tuucho-config or src/plugins', () => {
  const manifest: ShopReleaseManifest = {
    tag: '0.0.4',
    kernel: '0.0.4',
    releaseId: 4,
    kernelMigrations: [],
    plugins: [],
  };
  const paths = officialCopyPaths('kernel', manifest);
  assert.ok(paths.includes('tuucho/factory-backup'));
  assert.equal(
    paths.some((path) => path === 'tuucho-config' || path.startsWith('tuucho-config/')),
    false,
  );
  assert.equal(
    paths.some((path) => path === 'src/plugins' || path.startsWith('src/plugins/')),
    false,
  );
});
