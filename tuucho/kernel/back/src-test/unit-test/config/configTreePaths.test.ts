import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  exampleSibling,
  listTreeEnvironments,
  resolveConfigPaths,
  resolveKernelConfigPaths,
  resolveKernelTreeRoot,
  resolveTreeRelative,
} from '../../../src/config/configTreePaths.js';
import { flattenConfigToEnv, inspectConfig, listEnvironments } from '../../../src/config/loadJsonConfig.js';

function writeTree(dir: string, files: Record<string, unknown>): void {
  for (const [relative, body] of Object.entries(files)) {
    const path = join(dir, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  }
}

const requiredPrivate = {
  database: { url: 'postgres://tuucho:changeme@127.0.0.1:5434/tuucho_ecom' },
  jwt: { secret: 'dummy-jwt' },
  pii: { encryptionKey: 'A', lookupPepper: 'B' },
  ops: { token: 'dummy-ops' },
};

test('resolveKernelTreeRoot prefers kernel/ when present', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, { 'kernel/config.json': { http: { port: 1 } } });
  assert.equal(resolveKernelTreeRoot(root), join(root, 'kernel'));
});

test('resolveKernelTreeRoot falls back to flat root', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, { 'config.json': { http: { port: 1 } } });
  assert.equal(resolveKernelTreeRoot(root), root);
});

test('declared folder-style paths are used exclusively', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': {
      environments: {
        dev: {
          public: 'dev/config.json',
          private: 'dev/config.private.json',
        },
      },
    },
    'kernel/dev/config.json': { http: { apiBaseUrl: 'http://folder' } },
    'kernel/config.dev.json': { http: { apiBaseUrl: 'http://named' } },
    'kernel/dev/config.private.example.json': requiredPrivate,
  });
  const paths = resolveKernelConfigPaths(root, 'dev');
  assert.equal(paths.declared, true);
  assert.equal(paths.envPublic, join(root, 'kernel/dev/config.json'));
  const status = inspectConfig(root, 'dev');
  assert.equal(status.ok, true);
  assert.equal(
    status.merged?.http && (status.merged.http as { apiBaseUrl: string }).apiBaseUrl,
    'http://folder',
  );
});

test('declared name-style paths are used', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': {
      environments: {
        preprod: {
          public: 'config.preprod.json',
          private: 'config.private.preprod.json',
        },
      },
    },
    'kernel/config.preprod.json': { http: { apiBaseUrl: 'http://named' } },
    'kernel/config.private.preprod.example.json': requiredPrivate,
  });
  const paths = resolveKernelConfigPaths(root, 'preprod');
  assert.equal(paths.envPublic, join(root, 'kernel/config.preprod.json'));
  assert.deepEqual(listEnvironments(root), ['preprod']);
});

test('declared mix of folder and name paths works', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': {
      environments: {
        dev: { public: 'dev/config.json', private: 'dev/config.private.json' },
        staging: {
          public: 'config.staging.json',
          private: 'config.private.staging.json',
        },
      },
    },
    'kernel/dev/config.json': {},
    'kernel/dev/config.private.example.json': requiredPrivate,
    'kernel/config.staging.json': {},
    'kernel/config.private.staging.example.json': requiredPrivate,
  });
  assert.deepEqual(listEnvironments(root), ['dev', 'staging']);
  assert.equal(resolveKernelConfigPaths(root, 'dev').envPublic, join(root, 'kernel/dev/config.json'));
  assert.equal(resolveKernelConfigPaths(root, 'staging').envPublic, join(root, 'kernel/config.staging.json'));
});

test('missing environments map falls back to folder then name discovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': { http: { port: 1 } },
    'kernel/dev/config.json': { http: { apiBaseUrl: 'http://folder' } },
    'kernel/dev/config.private.example.json': requiredPrivate,
  });
  const paths = resolveKernelConfigPaths(root, 'dev');
  assert.equal(paths.declared, false);
  assert.ok(paths.warnings.some((line) => line.includes('No environments map')));
  assert.equal(paths.envPublic, join(root, 'kernel/dev/config.json'));
  assert.deepEqual(listEnvironments(root), ['dev']);
});

test('plugin tree uses its own environments map', () => {
  const plugin = mkdtempSync(join(tmpdir(), 'tuucho-plugin-'));
  writeTree(plugin, {
    'config.json': {
      environments: {
        dev: { public: 'dev/config.json' },
      },
      clientId: 'common',
    },
    'dev/config.json': { clientId: 'env' },
  });
  const paths = resolveConfigPaths(plugin, 'dev', { includeRole: false });
  assert.equal(paths.declared, true);
  assert.equal(paths.envPublic, join(plugin, 'dev/config.json'));
});

test('path traversal in environments map is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': {
      environments: { dev: { public: '../outside.json' } },
    },
  });
  assert.throws(() => resolveKernelConfigPaths(root, 'dev'), /must not contain "\.\."/);
  assert.throws(() => resolveTreeRelative(root, '/etc/passwd', 'label'), /must be relative/);
});

test('listTreeEnvironments uses map keys when present', () => {
  const tree = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(tree, {
    'config.json': {
      environments: { alpha: { public: 'alpha/config.json' }, beta: { public: 'config.beta.json' } },
    },
  });
  assert.deepEqual(listTreeEnvironments(tree), ['alpha', 'beta']);
});

test('flattenConfigToEnv drops the environments map', () => {
  const env = flattenConfigToEnv({
    environments: { dev: { public: 'dev/config.json' } },
    http: { port: 3010 },
  });
  assert.equal(env.APP_PORT, '3010');
  assert.equal(Object.keys(env).some((key) => key.toLowerCase().includes('environment')), false);
});

test('exampleSibling inserts .example before .json', () => {
  assert.equal(exampleSibling('dev/config.private.json'), 'dev/config.private.example.json');
  assert.equal(exampleSibling('config.private.preprod.json'), 'config.private.preprod.example.json');
  assert.equal(exampleSibling('config.json'), 'config.example.json');
});

test('declared privateExample key is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': {
      environments: {
        dev: {
          public: 'dev/config.json',
          private: 'dev/config.private.json',
          privateExample: 'dev/config.private.example.json',
        },
      },
    },
  });
  const paths = resolveKernelConfigPaths(root, 'dev');
  assert.ok(paths.warnings.some((line) => line.includes('privateExample must not be set')));
});

test('env private example is derived from declared private path', () => {
  const root = mkdtempSync(join(tmpdir(), 'tuucho-tree-'));
  writeTree(root, {
    'kernel/config.json': {
      environments: {
        preprod: {
          public: 'config.preprod.json',
          private: 'config.private.preprod.json',
        },
      },
    },
    'kernel/config.preprod.json': {},
    'kernel/config.private.preprod.example.json': requiredPrivate,
  });
  const paths = resolveKernelConfigPaths(root, 'preprod');
  assert.equal(paths.envPrivate, join(root, 'kernel/config.private.preprod.json'));
  assert.equal(paths.envPrivateExample, join(root, 'kernel/config.private.preprod.example.json'));
  assert.equal(inspectConfig(root, 'preprod').ok, true);
});
