import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  formatLocalDateTime,
  parseFrenchDateTime,
} from './maintenanceWindow.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
const rootPackageJsonPath = join(repoRoot, 'package.json');
const dist = join(root, 'dist');

const BUMP_KINDS = ['bump-patch', 'bump-minor', 'bump-major'];

const program = new Command();
program
  .name('build')
  .description('Build and deploy dist/, or manage the maintenance lockdown page.')
  .argument('[command]', 'maintenance-prepare or maintenance')
  .option('--preprod', 'target preprod')
  .option('--prod', 'target production')
  .option('--version <version>', 'X.Y.Z, or bump-patch/bump-minor/bump-major')
  .option('--patch-version <version>', 'X.Y.Z — build under this version without touching package.json')
  .option('--local', 'build locally without deploying')
  .option('--verbose', 'print each prerendered route')
  .option('--from <datetime>', 'maintenance-prepare/maintenance: window start, DD/MM/YY-HH:mm')
  .option('--to <datetime>', 'maintenance-prepare/maintenance: window end, DD/MM/YY-HH:mm')
  .option('--message <message>', 'maintenance-prepare/maintenance: extra message')
  .option(
    '--admin-route-token <token>',
    'deploy-only admin route segment, 1-64 letters/digits/hyphens/underscores (never set by plain builds)',
  );

function usageError(message) {
  program.error(`[build] ${message}`);
}

/** Ambient leftovers must never bake an admin route into a plain build.
 * Only an explicit deploy flag may set it. */
function clearAmbientAccessTokenEnv() {
  delete process.env.ADMIN_ROUTE_TOKEN;
  delete process.env.VITE_ADMIN_ROUTE_TOKEN;
}

function parseRouteToken(raw, flag) {
  if (raw === undefined || raw === null || raw === '') return null;
  const token = String(raw).trim();
  // Becomes both a URL path segment (/<token>/, see vite.config.ts's `base`)
  // and a literal inside an Apache RewriteRule regex (see version-dist.mjs)
  // — kept to characters with no meaning in either context, rather than
  // escaping.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) {
    usageError(`${flag} must be 1-64 letters/digits/hyphens/underscores (got "${raw}")`);
  }
  return token;
}

function parseArgs(argv) {
  // Always drop shell leftovers first so a prior deploy's export cannot
  // leak into `npm run build` / prod.
  clearAmbientAccessTokenEnv();

  program.parse(argv, { from: 'user' });
  const [command] = program.args;
  const opts = program.opts();
  if (command !== undefined && command !== 'maintenance-prepare' && command !== 'maintenance') {
    usageError(`unknown argument "${command}"`);
  }
  const args = {
    command: command ?? null,
    version: opts.version ?? null,
    patchVersion: opts.patchVersion ?? null,
    from: opts.from ?? null,
    to: opts.to ?? null,
    message: opts.message ?? null,
    local: Boolean(opts.local),
    verbose: Boolean(opts.verbose),
    mode: null,
    adminRouteToken: parseRouteToken(opts.adminRouteToken, '--admin-route-token'),
  };
  const selected = [];
  if (opts.preprod) selected.push('preprod');
  if (opts.prod) selected.push('prod');
  // Mandatory, deliberately no default — a silently-defaulted mode is
  // exactly what caused a preprod build to load prod's env file (and hit
  // prod's API) without anyone noticing until the build failed confusingly
  // partway through prerendering. 'maintenance' doesn't build the app at
  // all (see buildMaintenanceLockdown), so it's exempt.
  if (args.command !== 'maintenance') {
    if (selected.length === 0) usageError('exactly one of --preprod or --prod is required');
    if (selected.length > 1) usageError('only one of --preprod or --prod is allowed');
    args.mode = selected[0];
  } else if (selected.length > 1) {
    usageError('only one of --preprod or --prod is allowed');
  } else if (selected.length === 1) {
    args.mode = selected[0];
  }
  if (args.patchVersion !== null && !/^\d+\.\d+\.\d+$/.test(args.patchVersion)) {
    usageError(`--patch-version must be X.Y.Z (got "${args.patchVersion}")`);
  }
  if (args.patchVersion !== null && args.version !== null) {
    usageError(
      '--patch-version and --version cannot be combined — --version permanently bumps root package.json, --patch-version deliberately does not',
    );
  }
  return args;
}

function readRootPackageVersion() {
  const pkg = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'));
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    usageError('Root package.json must contain a MAJOR.MINOR.PATCH version');
  }
  return pkg.version;
}

/** Resolves --version's argument against the current root package.json version:
 * either an explicit X.Y.Z, or one of bump-patch/bump-minor/bump-major to
 * increment it automatically (minor/major reset the parts below them, per semver). */
function resolveVersion(versionArg, currentVersion) {
  if (!BUMP_KINDS.includes(versionArg)) {
    if (!/^\d+\.\d+\.\d+$/.test(versionArg)) {
      usageError(`--version must be X.Y.Z or one of ${BUMP_KINDS.join('/')} (got "${versionArg}")`);
    }
    return versionArg;
  }

  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion);
  if (!match) {
    usageError(
      `--version ${versionArg} needs the current root package.json version to be X.Y.Z (got "${currentVersion}")`,
    );
  }
  let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (versionArg === 'bump-patch') patch += 1;
  else if (versionArg === 'bump-minor') [minor, patch] = [minor + 1, 0];
  else [major, minor, patch] = [major + 1, 0, 0];
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(versionArg) {
  const pkg = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'));
  const version = resolveVersion(versionArg, readRootPackageVersion());
  pkg.version = version;
  writeFileSync(rootPackageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`[build] root package.json version set to ${version}`);
}

function run(command, args, extraEnv) {
  execFileSync(command, args, { stdio: 'inherit', cwd: root, env: { ...process.env, ...extraEnv } });
}

function fullBuild(extraEnv, local, mode, verbose) {
  // Vite's own --mode loads .env.[mode]; keep that for vite, not our CLI flags.
  const viteModeArgs = ['--mode', mode];
  run('tsc', ['-b'], extraEnv);
  run('vite', ['build', ...viteModeArgs], extraEnv);
  run(
    'vite',
    ['build', '--ssr', 'src/entry-server.tsx', '--outDir', 'dist/server', ...viteModeArgs],
    extraEnv,
  );
  run('node', ['scripts/prerender.mjs', ...(verbose ? ['--verbose'] : [])], extraEnv);
  run('node', ['scripts/version-dist.mjs', `--${mode}`, ...(local ? ['--local'] : [])], extraEnv);
}

/** Lightweight, standalone: a full site lockdown page + the .htaccess that
 * routes every request to it. Doesn't touch the app build — you FileZilla-copy
 * dist/maintenance.html and dist/maintenance.htaccess (renamed to .htaccess)
 * over the live site to take it down, and restore the previous .htaccess to
 * bring it back.
 *
 * from/to/message are all optional (unlike maintenance-prepare, which
 * requires from+to) — a real lockdown may need to go out before anyone
 * knows when it'll lift. Whichever of from/to are given get rendered as a
 * fixed string baked in at build time: this page has no JS at all, so
 * there's no way to show it in each visitor's own time zone the way
 * MaintenanceBanner does — same local-time assumption as the CLI parsing
 * itself already makes. */
function buildMaintenanceLockdown(from, to, message) {
  if (!existsSync(dist)) mkdirSync(dist);

  const shopName = 'the site';
  const contactEmail = '';

  let windowLine = null;
  if (from !== null && to !== null) {
    windowLine = `Maintenance : ${formatLocalDateTime(from)} → ${formatLocalDateTime(to)}`;
  } else if (to !== null) {
    windowLine = `Retour prévu / Expected back : ${formatLocalDateTime(to)}`;
  } else if (from !== null) {
    windowLine = `En maintenance depuis / Since : ${formatLocalDateTime(from)}`;
  }

  writeFileSync(
    join(dist, 'maintenance.html'),
    [
      '<!doctype html>',
      '<html lang="fr">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '    <meta name="robots" content="noindex" />',
      `    <title>Maintenance · ${shopName}</title>`,
      '    <style>',
      '      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #ffffff; color: #1a1a1a; font-family: Georgia, serif; text-align: center; padding: 24px; box-sizing: border-box; }',
      '      .card { max-width: 480px; }',
      '      h1 { font-size: 1.5rem; margin-bottom: 12px; }',
      '      p { font-family: system-ui, sans-serif; color: #5c5c5c; line-height: 1.5; }',
      '      p.window { font-weight: 600; color: #1a1a1a; }',
      '      a { color: #121212; }',
      '    </style>',
      '  </head>',
      '  <body>',
      '    <div class="card">',
      `      <h1>${shopName}: en maintenance</h1>`,
      '      <p>Le site est momentanément indisponible pour une opération de maintenance. Merci de revenir un peu plus tard.</p>',
      '      <p>Site temporarily unavailable for maintenance. Please check back shortly.</p>',
      windowLine ? `      <p class="window">${windowLine}</p>` : '',
      message ? `      <p>${message}</p>` : '',
      contactEmail ? `      <p><a href="mailto:${contactEmail}">${contactEmail}</a></p>` : '',
      '    </div>',
      '  </body>',
      '</html>',
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );

  writeFileSync(
    join(dist, 'maintenance.htaccess'),
    [
      '<IfModule mod_rewrite.c>',
      '  RewriteEngine On',
      '  RewriteCond %{REQUEST_URI} !^/maintenance\\.html$',
      '  RewriteRule ^ /maintenance.html [L]',
      '</IfModule>',
      '',
    ].join('\n'),
  );

  console.log('[build] dist/maintenance.html and dist/maintenance.htaccess ready.');
  console.log(
    '[build] FileZilla: upload maintenance.html, then upload maintenance.htaccess as ".htaccess" to lock the site down.',
  );
  console.log(
    '[build] To restore: re-upload the previous version .htaccess (the one from dist/vX.X.X/.htaccess).',
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) bumpVersion(args.version);

  if (args.command === 'maintenance') {
    const from = args.from ? parseFrenchDateTime(args.from, 'from', usageError) : null;
    const to = args.to ? parseFrenchDateTime(args.to, 'to', usageError) : null;
    if (from !== null && to !== null && to <= from) usageError('--to must be after --from');
    buildMaintenanceLockdown(from, to, args.message);
    return;
  }

  const extraEnv = {};
  if (args.command === 'maintenance-prepare') {
    if (!args.from || !args.to) usageError('maintenance-prepare requires --from and --to');
    const from = parseFrenchDateTime(args.from, 'from', usageError);
    const to = parseFrenchDateTime(args.to, 'to', usageError);
    if (to <= from) usageError('--to must be after --from');
    extraEnv.VITE_MAINTENANCE_FROM = String(from);
    extraEnv.VITE_MAINTENANCE_TO = String(to);
    extraEnv.VITE_MAINTENANCE_MESSAGE = args.message ?? DEFAULT_MAINTENANCE_MESSAGE;
    console.log(`[build] maintenance banner window: ${args.from} -> ${args.to}`);
  }
  if (args.adminRouteToken) {
    extraEnv.VITE_ADMIN_ROUTE_TOKEN = args.adminRouteToken;
    console.log(`[build] admin path: /${args.adminRouteToken}/admin`);
  }
  if (args.patchVersion) {
    // Read by version-dist.mjs in place of the root package.json version.
    // Source package.json files are never written to.
    extraEnv.PATCH_VERSION = args.patchVersion;
    console.log(
      `[build] --patch-version ${args.patchVersion}: package.json stays untouched, only dist/v${args.patchVersion}/ is produced`,
    );
  }

  fullBuild(extraEnv, args.local, args.mode, args.verbose);
}

main();
