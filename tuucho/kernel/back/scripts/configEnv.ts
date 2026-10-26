/** Create a new kernel environment file pair from factory-config (public + example only). */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
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
const factory = join(pack, 'tuucho/factory-config');
const factoryPublic = existsSync(join(factory, `config.${name}.json`))
  ? join(factory, `config.${name}.json`)
  : join(factory, 'config.dev.json');
const factoryExample = existsSync(join(factory, `config.private.${name}.example.json`))
  ? join(factory, `config.private.${name}.example.json`)
  : join(factory, 'config.private.dev.example.json');
const destDir = join(pack, 'tuucho-config');
const destPublic = join(destDir, `config.${name}.json`);
if (!existsSync(factoryPublic)) fail('factory-config is missing public JSON for this env');
if (existsSync(destPublic)) fail(`${destPublic} already exists`);

mkdirSync(destDir, { recursive: true });
cpSync(factoryPublic, destPublic);
if (existsSync(factoryExample)) {
  const exampleText = readFileSync(factoryExample, 'utf8');
  const example = JSON.parse(exampleText) as unknown;
  const empty = !example || typeof example !== 'object' || Array.isArray(example) || Object.keys(example).length === 0;
  if (!empty) {
    cpSync(factoryExample, join(destDir, `config.private.${name}.example.json`));
  }
}
console.log(`[config:env] created tuucho-config/config.${name}.json from factory.`);
console.log(
  `[config:env] cp tuucho-config/config.private.${name}.example.json tuucho-config/config.private.${name}.json`,
);
console.log(
  `[config:env] edit public URLs in tuucho-config/config.${name}.json. Fill secrets in the private file (do not commit). APP_TARGET=${name}`,
);
