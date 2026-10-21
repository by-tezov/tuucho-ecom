#!/usr/bin/env node
/**
 * WordPress-style first-run installer for tuucho-ecom.
 *
 *   npm run setup            # web wizard on :8787
 *   npm run setup:cli -- --yes --store-name Shop --admin-email admin@shop.example --admin-password 'ShopAdmin1!'
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'installed.lock');
const back = join(root, 'tuucho/kernel/back');
const configRoot = join(root, 'tuucho-config');

function parseArgs(argv) {
  const out = {
    yes: false,
    cli: false,
    wizard: !argv.includes('--yes') && !argv.includes('--cli'),
    storeName: 'Shop',
    storeSuffix: '',
    adminEmail: 'admin@shop.example',
    adminPassword: 'ShopAdmin1!',
    lang: 'fr',
    postgresUser: 'tuucho',
    postgresPassword: randomBytes(12).toString('base64url'),
    postgresDb: 'tuucho_ecom',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--yes' || token === '--cli') {
      out.yes = true;
      out.wizard = false;
    } else if (token === '--wizard') out.wizard = true;
    else if (token.startsWith('--store-name=')) out.storeName = token.slice(13);
    else if (token === '--store-name') out.storeName = argv[++i];
    else if (token.startsWith('--admin-email=')) out.adminEmail = token.slice(14);
    else if (token === '--admin-email') out.adminEmail = argv[++i];
    else if (token.startsWith('--admin-password=')) out.adminPassword = token.slice(17);
    else if (token === '--admin-password') out.adminPassword = argv[++i];
    else if (token.startsWith('--lang=')) out.lang = token.slice(7);
    else if (token === '--lang') out.lang = argv[++i];
  }
  return out;
}

function run(command, args, cwd) {
  console.log(`[setup] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, APP_TARGET: 'dev' } });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
  }
}

function doctorPack() {
  const required = [
    join(root, 'tuucho/kernel'),
    join(root, 'tuucho/plugin-sdk'),
    join(root, 'tuucho/plugins'),
    configRoot,
  ];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`broken pack, missing: ${missing.join(', ')}`);
  }
}

function copyPrivateFromExample(privatePath, examplePath) {
  if (existsSync(privatePath)) return;
  if (!existsSync(examplePath)) {
    throw new Error(`missing ${privatePath} and ${examplePath}. Cannot launch.`);
  }
  writeFileSync(privatePath, readFileSync(examplePath));
  console.warn(`[setup] copied ${examplePath} -> ${privatePath} (edit before production)`);
}

function materialiseConfig() {
  mkdirSync(join(configRoot, 'dev'), { recursive: true });
  copyPrivateFromExample(join(configRoot, 'config.private.json'), join(configRoot, 'config.private.example.json'));
  copyPrivateFromExample(
    join(configRoot, 'dev', 'config.private.json'),
    join(configRoot, 'dev', 'config.private.example.json'),
  );
  if (!existsSync(join(configRoot, 'plugins.json'))) {
    copyPrivateFromExample(join(configRoot, 'plugins.json'), join(configRoot, 'plugins.example.json'));
  }
}

function writeConfig(options) {
  const jwt = randomBytes(48).toString('base64url');
  const ops = randomBytes(48).toString('base64url');
  const piiKey = randomBytes(32).toString('base64');
  const piiPepper = randomBytes(32).toString('base64');
  const databaseUrl = `postgres://${options.postgresUser}:${encodeURIComponent(options.postgresPassword)}@127.0.0.1:5434/${options.postgresDb}`;

  mkdirSync(join(configRoot, 'dev'), { recursive: true });
  if (!existsSync(join(configRoot, 'config.private.json'))) writeFileSync(join(configRoot, 'config.private.json'), '{}\n');
  writeFileSync(
    join(configRoot, 'dev', 'config.private.json'),
    JSON.stringify(
      {
        database: {
          url: databaseUrl,
          user: options.postgresUser,
          password: options.postgresPassword,
          name: options.postgresDb,
        },
        jwt: { secret: jwt },
        ops: { token: ops },
        pii: { encryptionKey: piiKey, lookupPepper: piiPepper },
        smtp: { host: '', user: '', password: '', fromEmail: '' },
      },
      null,
      2,
    ) + '\n',
  );
}

async function waitForPostgres(postgresUser) {
  for (let i = 0; i < 40; i += 1) {
    const result = spawnSync(
      'docker',
      ['compose', '--env-file', '.compose.env', 'exec', '-T', 'postgres', 'pg_isready', '-U', postgresUser],
      { cwd: back, encoding: 'utf8' },
    );
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Postgres did not become ready on port 5434');
}

async function install(options) {
  if (existsSync(lockPath)) {
    console.log('[setup] already installed (installed.lock). Delete it to re-run.');
    return;
  }
  doctorPack();
  materialiseConfig();
  writeConfig(options);
  run('node', ['scripts/composeEnv.mjs'], back);
  run('docker', ['compose', '--env-file', '.compose.env', 'up', '-d'], back);
  await waitForPostgres(options.postgresUser);
  run('npm', ['install'], root);
  run('npm', ['run', 'operation', '--', 'database-migrate', '--dev'], back);
  run('npm', ['run', 'library', '--', 'seed', '--dev', '--source', join(root, 'sample/product/library')], back);
  run('npm', ['run', 'courier', '--', 'seed', '--dev', '--source', join(root, 'sample/courier')], back);
  run('npm', ['run', 'payment-method', '--', 'seed', '--dev'], back);
  run('npm', ['run', 'payment-method-countries', '--', 'seed', '--dev'], back);
  run(
    'npx',
    [
      'tsx',
      'scripts/installBootstrap.ts',
      `--email=${options.adminEmail}`,
      `--password=${options.adminPassword}`,
      `--language=${options.lang}`,
      `--store-name=${options.storeName}`,
      `--store-suffix=${options.storeSuffix}`,
    ],
    back,
  );
  writeFileSync(
    lockPath,
    JSON.stringify(
      {
        installedAt: new Date().toISOString(),
        storeName: options.storeName,
        adminEmail: options.adminEmail,
      },
      null,
      2,
    ) + '\n',
  );
  run('npx', ['tsx', 'scripts/writeShopRelease.ts'], back);
  console.log('');
  console.log('tuucho-ecom is installed.');
  console.log('  Shop:  http://localhost:5174');
  console.log('  API:   http://localhost:3010');
  console.log('  Admin: http://localhost:5174/admin');
  console.log(`  Sign in as ${options.adminEmail}`);
  console.log('Start with: npm run dev   (from this folder)');
}

function wizardHtml() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>tuucho-ecom installer</title>
<style>
body{font-family:Manrope,system-ui,sans-serif;background:#ffffff;color:#1a1a1a;margin:0;padding:24px}
main{max-width:32rem;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.06);border:1px solid #e1e1e1}
h1{font-family:Georgia,serif;font-weight:600}
label{display:block;margin:12px 0 4px;font-size:.9rem}
input{width:100%;padding:10px 12px;border:1px solid #6b6b6b;border-radius:8px;box-sizing:border-box}
button{margin-top:20px;background:#121212;color:#fff;border:0;padding:12px 18px;border-radius:999px;font:inherit;cursor:pointer}
.out{white-space:pre-wrap;background:#121212;color:#f2f2f2;padding:12px;border-radius:8px;margin-top:16px;min-height:4rem}
</style></head>
<body><main>
<h1>tuucho-ecom</h1>
<p>First-run installer. Postgres on port 5434, API on 3010, shop on 5174.</p>
<form id="f">
<label>Store name</label><input name="storeName" value="Shop" required/>
<label>Admin e-mail</label><input name="adminEmail" type="email" value="admin@shop.example" required/>
<label>Admin password</label><input name="adminPassword" type="password" value="ShopAdmin1!" required/>
<label>Language</label><input name="lang" value="fr"/>
<button type="submit">Install</button>
</form>
<div class="out" id="out">Waiting.</div>
</main>
<script>
document.getElementById('f').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  document.getElementById('out').textContent = 'Installing. This takes a minute...';
  const response = await fetch('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await response.json();
  document.getElementById('out').textContent = body.log || body.error || JSON.stringify(body);
});
</script>
</body></html>`;
}

const options = parseArgs(process.argv.slice(2));

if (options.wizard && !options.yes) {
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(wizardHtml());
      return;
    }
    if (req.method === 'POST' && req.url === '/run') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      try {
        await install({ ...options, ...body, yes: true, wizard: false });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            log: 'Installed. Shop http://localhost:5174  Admin http://localhost:5174/admin',
          }),
        );
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(8787, '127.0.0.1', () => {
    console.log('Installer wizard: http://127.0.0.1:8787');
  });
} else {
  install(options).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
