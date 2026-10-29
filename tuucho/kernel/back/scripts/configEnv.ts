/** Create a new kernel environment folder from factory-backup/config (public + example only). */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isEnvName } from '../src/config/loadJsonConfig.js';
import {
  defaultFolderEnvLayer,
  ensureEnvironmentEntry,
  exampleSibling,
  resolveKernelConfigPaths,
  resolveKernelTreeRoot,
} from '../src/config/configTreePaths.js';
import { findPackRoot } from '../src/config/shopPaths.js';
import { FACTORY_REL } from '../src/config/configMigrate.js';

const command = process.argv[2];
const name = process.argv[3];

function fail(message: string): never {
  console.error(`[config:env] ${message}`);
  process.exit(1);
}

if (command !== 'create' || !name) {
  fail('usage: npm run config:env -- create <name>');
}
if (!isEnvName(name)) fail(`name must match [a-z][a-z0-9-]* (got "${name}")`);
if (name === 'dev') fail('dev already exists; copy a different name');

const pack = findPackRoot(process.cwd());
const factoryConfigRoot = join(pack, FACTORY_REL);
const factoryTree = resolveKernelTreeRoot(factoryConfigRoot);
const shopConfigRoot = join(pack, 'tuucho-config');
const shopTree = resolveKernelTreeRoot(shopConfigRoot);

const factoryDev = resolveKernelConfigPaths(factoryConfigRoot, 'dev');
const factoryPublic = existsSync(factoryDev.envPublic)
  ? factoryDev.envPublic
  : join(factoryTree, 'dev', 'config.json');
const factoryExample = existsSync(factoryDev.envPrivateExample)
  ? factoryDev.envPrivateExample
  : join(factoryTree, 'dev', 'config.private.example.json');

if (!existsSync(factoryPublic)) fail('factory-backup/config is missing public JSON for the dev env');

const layer = defaultFolderEnvLayer(name);
const destPublic = join(shopTree, layer.public!);
if (existsSync(destPublic)) fail(`${destPublic} already exists`);

mkdirSync(dirname(destPublic), { recursive: true });
cpSync(factoryPublic, destPublic);

if (existsSync(factoryExample)) {
  const exampleText = readFileSync(factoryExample, 'utf8');
  const example = JSON.parse(exampleText) as unknown;
  const empty =
    !example || typeof example !== 'object' || Array.isArray(example) || Object.keys(example).length === 0;
  if (!empty) {
    const destExample = join(shopTree, exampleSibling(layer.private!));
    mkdirSync(dirname(destExample), { recursive: true });
    cpSync(factoryExample, destExample);
  }
}

ensureEnvironmentEntry(shopTree, name, layer, { includeRole: true });

const relPublic = destPublic.replace(`${pack}/`, '');
console.log(`[config:env] created ${relPublic} from factory.`);
console.log(
  `[config:env] cp tuucho-config/kernel/${name}/config.private.example.json tuucho-config/kernel/${name}/config.private.json`,
);
console.log(
  `[config:env] edit public URLs in tuucho-config/kernel/${name}/config.json. Fill secrets in the private file (do not commit). APP_TARGET=${name}`,
);
