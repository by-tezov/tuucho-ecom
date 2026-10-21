/** Create a new kernel environment folder from factory-config (public + example only). */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isEnvName } from '../src/config/loadJsonConfig.js';
import { findPackRoot } from '../src/config/shopPaths.js';

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
const factoryEnv = existsSync(join(pack, 'tuucho/factory-config', name, 'config.json'))
  ? join(pack, 'tuucho/factory-config', name)
  : join(pack, 'tuucho/factory-config', 'dev');
const dest = join(pack, 'tuucho-config', name);
if (!existsSync(join(factoryEnv, 'config.json')) || !existsSync(join(factoryEnv, 'config.private.example.json'))) {
  fail('factory-config is missing public JSON or private example for this env');
}
if (existsSync(dest)) fail(`${dest} already exists`);

mkdirSync(dest, { recursive: true });
cpSync(join(factoryEnv, 'config.json'), join(dest, 'config.json'));
cpSync(join(factoryEnv, 'config.private.example.json'), join(dest, 'config.private.example.json'));
console.log(`[config:env] created tuucho-config/${name}/ (public + private example) from factory.`);
console.log(
  `[config:env] cp tuucho-config/${name}/config.private.example.json tuucho-config/${name}/config.private.json`,
);
console.log(
  `[config:env] edit public URLs in tuucho-config/${name}/config.json. Fill secrets in the private file (do not commit). APP_TARGET=${name}`,
);
