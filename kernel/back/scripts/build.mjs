import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

/** Packages left out of the server bundle, loaded from node_modules at run
 * time as before: native bindings (argon2, sharp, canvas, pg-native) cannot
 * be bundled, and pdfkit reads its font data from files beside its own code.
 * Anything else that resolves files relative to itself must be added here,
 * or it breaks only in the deployed build. */
const SERVER_BUNDLE_EXTERNALS = ['argon2', 'sharp', 'canvas', 'pg-native', 'pdfkit'];

/** Bundles the compiled `serverEntry.js` and its whole dependency graph into
 * `bundle/serverEntry.js`, which boot.ts loads when it exists.
 *
 * Why: Passenger on the LWS host stops an idle app after a few seconds, so
 * most visitors meet a cold start, and a cold start there was dominated by
 * reading ~1,200 small JS files (one per module, ~750 from node_modules) off
 * the shared filesystem: ~4s before the first response. One file brings that
 * to ~90 opened files. The unbundled tree stays in the release: opsServer.js,
 * the crons and the pipes still run from it. */
async function bundleServerEntry(outDir) {
  await esbuild({
    entryPoints: [join(outDir, 'serverEntry.js')],
    outfile: join(outDir, 'bundle', 'serverEntry.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: SERVER_BUNDLE_EXTERNALS,
    // CommonJS dependencies call require(); an ESM bundle has none of its own.
    banner: { js: "import { createRequire as __bundleRequire } from 'node:module'; const require = __bundleRequire(import.meta.url);" },
    logLevel: 'warning',
  });
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = join(root, 'package.json');

const BUMP_KINDS = ['bump-patch', 'bump-minor', 'bump-major'];

function usageError(message) {
  console.error(`[build] ${message}`);
  console.error(
    '[build] usage: npm run build -- --prod|--preprod [--version X.Y.Z|bump-patch|bump-minor|bump-major] [--patch-version X.Y.Z]',
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { mode: null, version: null, patchVersion: null };
  let targetCount = 0;
  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift();
    if (token === '--mode') {
      usageError('`--mode` is no longer accepted; use --preprod or --prod');
    } else if (token === '--preprod' || token === '--prod') {
      targetCount += 1;
      args.mode = token.slice(2);
    } else if (token === '--dev') {
      usageError('--dev is not valid for build; use --preprod or --prod');
    } else if (token === '--version') args.version = rest.shift();
    else if (token === '--patch-version') args.patchVersion = rest.shift();
    else if (token === '--preprod-access-token') {
      usageError(
        '--preprod-access-token was removed. Preprod has no access token and no IP allowlist.',
      );
    } else usageError(`unknown argument "${token}"`);
  }
  // Mandatory, deliberately no default — same reasoning as the front: a
  // silently-defaulted mode risks copying the wrong env-file pair into the
  // dist folder without anyone noticing.
  if (targetCount === 0 || args.mode === null) {
    usageError('exactly one of --preprod or --prod is required');
  }
  if (targetCount > 1) usageError('only one of --preprod or --prod is allowed');
  if (args.mode !== 'preprod' && args.mode !== 'prod') {
    usageError(`target must be preprod or prod (got "${args.mode}")`);
  }
  if (args.patchVersion !== null && !/^\d+\.\d+\.\d+$/.test(args.patchVersion)) {
    usageError(`--patch-version must be X.Y.Z (got "${args.patchVersion}")`);
  }
  if (args.patchVersion !== null && args.version !== null) {
    usageError('--patch-version and --version cannot be combined — --version permanently bumps package.json, --patch-version deliberately does not');
  }
  return args;
}

/** Resolves --version's argument against the current package.json version:
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
    usageError(`--version ${versionArg} needs the current package.json version to be X.Y.Z (got "${currentVersion}")`);
  }
  let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (versionArg === 'bump-patch') patch += 1;
  else if (versionArg === 'bump-minor') [minor, patch] = [minor + 1, 0];
  else [major, minor, patch] = [major + 1, 0, 0];
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(versionArg) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = resolveVersion(versionArg, pkg.version);
  pkg.version = version;
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`[build] package.json version set to ${version}`);
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit', cwd: root });
}

async function fullBuild(mode, patchVersion) {
  const { version: pkgVersion } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  // --patch-version overrides only the output folder name — the dist copy of
  // package.json below still carries pkgVersion untouched, and the source
  // package.json is never written to (see the --version/bumpVersion path for
  // the deliberate, permanent alternative).
  const version = patchVersion ?? pkgVersion;
  const versionDir = `v${version}`;
  const outDir = join(root, 'dist', versionDir);

  // Wipe the version folder first. `tsc --outDir` and `cpSync(..., {recursive})`
  // both merge into an existing tree — after the pre-production migration
  // squash that left deleted files (e.g. `1738000001000_gallery_search_and_feed`)
  // in `dist/vX/db/migrations/`, and a deploy of that polluted tree made
  // `database-migrate` try to ADD `products.search_text` on top of the
  // squashed init that already created it.
  rmSync(outDir, { recursive: true, force: true });

  run('tsc', ['--outDir', outDir]);

  mkdirSync(join(outDir, 'db', 'migrations'), { recursive: true });
  mkdirSync(join(outDir, '.env', mode), { recursive: true });
  cpSync(join(root, 'src', 'db', 'migrations'), join(outDir, 'db', 'migrations'), { recursive: true });
  // tsc only emits .ts -> .js; the .hbs email templates need copying by hand
  // or every order confirmation/shipped email would fail to render outside
  // dev (see services/emailTemplates.ts).
  cpSync(join(root, 'src', 'templates'), join(outDir, 'templates'), { recursive: true });

  await bundleServerEntry(outDir);
  mkdirSync(join(outDir, 'pipe'), { recursive: true });
  // The release handler is versioned with the backend. The stable dispatcher
  // is also shipped in the artifact so deploy can refresh ~/bin safely.
  cpSync(join(root, 'src', 'pipe', 'pipe-program-chat-handler.sh'), join(outDir, 'pipe', 'pipe-program-chat-handler.sh'));
  cpSync(
    join(root, 'src', 'pipe', 'pipe-program-product-request-handler.sh'),
    join(outDir, 'pipe', 'pipe-program-product-request-handler.sh'),
  );
  cpSync(join(root, 'src', 'pipe', 'pipe-contact-dispatcher.sh'), join(outDir, 'pipe', 'pipe-contact-dispatcher.sh'));
  cpSync(join(root, 'operation', 'pipe', 'main-pipe-contact-dispatcher.sh'), join(outDir, 'pipe', 'main-pipe-contact-dispatcher.sh'));

  // devDependencies (tsx, typescript, oxlint, ...) are dev/test-only
  // and never imported by the compiled runtime. Shipping them would make
  // the remote `npm install` (deploy.ts) try to install tooling that the
  // LWS app never runs.
  // `scripts` is dropped too: the `scripts/` dir isn't copied into dist, so
  // every entry (dev/build/deploy/lint/seed/...) points at a file that
  // doesn't exist there. Nothing remote ever runs them — cPanel starts the
  // app straight off `server.js`, and `npm install` doesn't need a scripts
  // block to do its job.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  writeFileSync(join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  cpSync(join(root, 'package-lock.json'), join(outDir, 'package-lock.json'));
  // Only the common pair + this target's own pair — no point shipping the
  // other targets' env files (dev's, or the other of preprod/prod) into a
  // dist folder that only ever runs as one target.
  for (const file of ['.env/.public.env', '.env/.private.env', `.env/${mode}/.public.env`, `.env/${mode}/.private.env`]) {
    cpSync(join(root, file), join(outDir, file));
  }

  // Sign in with Apple AuthKey_<KEY_ID>.p8 sits next to the target private env
  // (gitignored). Copy every matching key file into dist so deploy has what
  // runtime loads via APPLE_KEY_ID — env KEY=value alone is not enough.
  for (const dir of [join(root, '.env', mode), join(root, '.env')]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!/^AuthKey_[A-Z0-9]{10}\.p8$/.test(name)) continue;
      cpSync(join(dir, name), join(outDir, '.env', mode, name));
      console.log(`[build] copied ${name} into dist .env/${mode}/`);
    }
  }

  console.log(`[build] dist/${versionDir}/ ready (${mode}), fully self-contained — upload as-is.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) bumpVersion(args.version);
  if (args.patchVersion) {
    console.log(`[build] --patch-version ${args.patchVersion}: package.json stays untouched, only dist/v${args.patchVersion}/ is produced`);
  }
  await fullBuild(args.mode, args.patchVersion);
}

await main();
