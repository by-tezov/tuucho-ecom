/** Create a new kernel environment folder from config/dev (public + example only). */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEnvName } from '../src/config/loadJsonConfig.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const source = join(root, 'config', 'dev');
const dest = join(root, 'config', name);
if (!existsSync(join(source, 'config.json')) || !existsSync(join(source, 'config.private.example.json'))) {
  fail('config/dev/ is missing public JSON or private example');
}
if (existsSync(dest)) fail(`${dest} already exists`);

mkdirSync(dest, { recursive: true });
cpSync(join(source, 'config.json'), join(dest, 'config.json'));
cpSync(join(source, 'config.private.example.json'), join(dest, 'config.private.example.json'));
console.log(`[config:env] created config/${name}/ (public + private example).`);
console.log(`[config:env] cp config/${name}/config.private.example.json config/${name}/config.private.json`);
console.log(`[config:env] edit public URLs in config/${name}/config.json (commit). Fill new secrets in the private file (do not commit). APP_TARGET=${name}`);
