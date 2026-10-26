/** Builds and deploys kernel/front and/or kernel/back to the LWS host,
 * then optionally runs the database-migrate (or a full database-reset ->
 * migrate -> seed) operation against the deployed API.
 *
 * Every remote target must name its transport, --ssh or --ftp. --ssh is the
 * original path: rsync over ssh, commands over ssh. --ftp exists because SSH
 * to this host is regularly blocked at the network level; it uploads over FTP
 * and runs the *same* commands through the standalone PHP gateway described
 * below. --dev is local and takes neither.
 *
 * Usage:
 *   npm run deploy -- --ssh|--ftp --preprod|--prod [--target 'front back']
 *     [--dry-run] [--confirm] [--no-database-migrate] [--no-npm-install] [--reset] [--faker]
 *     [--no-route-admin-token] [--route-admin-token <token>] [--patch X.Y.Z]
 *   npm run deploy -- --ssh|--ftp --preprod|--prod --rollback X.Y.Z [--dry-run] [--confirm]
 *   npm run deploy -- --dev [--reset] [--faker] [--dry-run] [--no-database-migrate]
 *   npm run deploy -- --ssh|--ftp --preprod|--prod --maintenance-prepare --from DD/MM/YY-HH:mm
 *     --to DD/MM/YY-HH:mm [--message "..."] [--dry-run] [--confirm]
 *   npm run deploy -- --ssh|--ftp --preprod|--prod --maintenance [--from ...] [--to ...] [--message "..."] [--dry-run] [--confirm]
 *   npm run deploy -- --preprod|--prod --ftp-ops
 *   npm run deploy -- --preprod|--prod --ftp-ops-remove
 *
 * --ftp-ops / --ftp-ops-remove are the *manual* install and removal of the PHP
 * gateway (shell over HTTPS, and the reverse-proxy of loopback `/operation/*`
 * for `--ftp` ops CLIs). They install or remove only that gateway and its
 * OPS_TOKEN file: no build, no release upload, no restart. Ops CLIs never
 * auto-install this gateway; without it, `--ftp` library/operation/… fail.
 * Both flags imply --ftp.
 *
 * A --prod deploy runs --ftp-ops-remove at the end by default, so production
 * never keeps a standing shell-or-ops endpoint between deploys; pass --ftp-ops
 * on a prod deploy to leave it installed instead. Preprod keeps it unless
 * --ftp-ops-remove is passed. After a default prod deploy, `--ftp` ops CLIs
 * fail until the gateway is reinstalled (or use --ssh).
 *
 * --dev is local only: no build, no upload, and no transport flag. It runs migrate, or with
 * --reset wipe → migrate → seed, against the local API. If that API is
 * down, deploy starts Postgres (`docker compose up -d`) and `tsx src/server.ts`,
 * waits for /healthz, then stops the process it started. An already-running
 * `npm run dev` is left alone.
 *
 * Always builds fresh for --preprod/--prod (clearing each targeted repo's
 * dist/ first) — no skip-build flag, deliberately: uploading a stale dist/
 * built for a different target risks shipping the wrong env's config/CSP/API
 * origin without anyone noticing.
 *
 * Every front deploy (preprod or prod) independently generates an admin
 * route token and passes it only to the front build as --admin-route-token.
 * The resulting route is /<token>/admin. --route-admin-token supplies a
 * chosen token; --no-route-admin-token retains the ordinary /admin route.
 *
 * --patch X.Y.Z overrides the release folder both builds target,
 * in place of the root package.json version — neither package.json is
 * touched. Use it to re-push current source into an already-live version
 * (a hotfix that doesn't warrant a real version bump): e.g. root package.json
 * is at 0.9.6 but preprod is still serving 0.9.5 — `--patch 0.9.5` builds
 * current HEAD as dist/v0.9.5/ and switches `current` to that release
 * (env-vars synced, npm install, restart, healthz). Not valid with --dev
 * (nothing to build/target) or
 * --maintenance (skips the build entirely).
 *
 * --confirm is mandatory whenever --prod actually executes (not
 * required for --dry-run previews). --reset with --prod additionally
 * requires --i-understand-this-wipes-production-data (on top of --confirm) —
 * a separate, deliberately verbose flag so a routine `--reset --confirm`
 * habit from --dev/--preprod can never slip through against --prod by
 * accident. --reset cannot be combined with --no-database-migrate.
 *
 * --faker runs `npm run faker -- seed --<mode>` after the database ops above
 * (migrate, or reset -> migrate -> seed) to layer demo accounts/carts/orders
 * on top — additive, not destructive (see scripts/faker.ts). Same as
 * --reset, only --dev or
 * --preprod (not --prod) — fake demo data has no place in production.
 *
 * Front goes to public_html/<mode>/v<version>/ (+ .htaccess, and prod's
 * root.htaccess at public_html/.htaccess). Back goes to
 * private_html/<mode>/v<version>/. Both are incremental rsync syncs
 * (checksum-compared): only changed files are uploaded, only files that
 * disappeared locally are removed remotely, and back's node_modules/public/
 * tmp are excluded from both directions. Each successful upload atomically
 * switches `public_html/<mode>/current` and `private_html/<mode>/current` to
 * that release. There is one stable cPanel Node.js App rooted at the latter.
 * If it does not exist, deploy creates it through LWS's `cloudlinux-selector`
 * CLI; an older version-rooted app is migrated once to that stable root.
 * Leftover process env (`APP_TARGET`, optional `PORT`) is pushed onto the
 * app as the exact env-var set via `cloudlinux-selector set`. Keys that
 * are live in cPanel but absent from that leftover set are removed.
 * That `set` runs
 * against a real `current` directory (the release symlink is detached for
 * the call and restored afterwards): CloudLinux realpath()s a stopped app's
 * App Root, and a `current → vX.Y.Z` symlink would make it look up a
 * version folder that is not the registered app. Then (unless
 * --no-npm-install) runs
 * `npm install` through cPanel's own nodevenv for that version folder, then
 * `cloudlinux-selector restart` to cycle the Passenger process — followed by
 * polling https://<domain>/healthz until it reports 200 (or failing after
 * 30s) before moving on to migrate/reset/seed, since a restart is
 * asynchronous and proceeding immediately risks hitting the app mid-cycle.
 * --maintenance-prepare bakes the maintenance-window banner into a real
 * front build+deploy (see kernel/front's scripts/build.mjs maintenance-prepare
 * form) — --from/--to/--message pass straight through, front only (back's
 * build is untouched); combinable with the normal --target selection.
 *
 * --maintenance instead skips the whole build/upload/database-ops pipeline:
 * it builds only kernel/front's standalone dist/maintenance.html +
 * dist/maintenance.htaccess (via `npm run build -- maintenance`, front-only —
 * --target is ignored), uploads maintenance.html alongside the live version,
 * then overwrites the live public_html/<mode>/.htaccess with the maintenance
 * one — this takes the site down immediately, no separate activation step.
 * --from/--to/--message are all optional here (unlike --maintenance-prepare,
 * which requires --from and --to) and get baked as plain text into the
 * static lockdown page itself — a visitor hitting a live lockdown has no
 * other way to know when the site is expected back. There is no --restore:
 * getting back out of maintenance is just a normal deploy (`npm run deploy
 * -- --<mode>`, no --maintenance) — it already rebuilds and uploads the real
 * dist/.htaccess as part of what it always does, overwriting whatever's
 * live regardless of what that was.
 *
 * The --ftp transport in detail. FTP alone cannot deploy this layout: it has
 * no way to create the `current` symlinks, run `cloudlinux-selector`, or run
 * `npm install`. What makes it work is scripts/ops-gateway.php — a single PHP
 * file published over FTP to public_html/ops[-preprod]/, authenticated with
 * the same OPS_TOKEN, that executes one shell command per request. It runs
 * under Apache rather than inside the Node app precisely so it still answers
 * while that app is stopped mid-deploy.
 *
 * The gateway reproduces SSH's execution context (bash, $HOME as the working
 * directory, HOME exported), which is what lets run() below dispatch the very
 * same command string down either transport. bootstrapFtpGateway asserts that
 * context on every run before anything else happens: a gateway executing from
 * its own document root silently resolves every relative deploy path inside
 * public_html and reports success, which is a failure mode worth failing loud
 * and early over.
 *
 * Uploads differ, because FTP has no rsync. A directory is tarred locally,
 * transferred as one file, and unpacked on the host into a sibling directory
 * that is then renamed over the target — one round trip instead of one STOR
 * per file (measured at ~0.21s each against this host, i.e. minutes for the
 * front's asset directory). See ftpSyncDirectory for how that reproduces
 * rsync's --delete and its excluded-path behaviour.
 *
 * See both repos' README "Deploying" sections and ~/.ssh/config's
 * lws_shop_example host alias.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadApiBaseUrl, loadPublicEnv } from './envFile.js';
import {
  GATEWAY_EXEC_ATTEMPTS,
  isRetryableGatewayBody,
  loadGatewayTarget,
  startRemoteOpsServer,
  stopRemoteOpsServer,
} from './opsGatewayClient.js';
import { parseTransportFlags, requireTransport, transportFlags, type Transport } from './transport.js';

const backRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(backRoot, '..', '..');
const frontRoot = join(backRoot, '..', 'kernel/front');
const SSH_HOST = 'lws_shop_example';
// cPanel account username — needed to read `cloudlinux-selector get`'s
// per-user application list (see ~/.claude memory project_lws_ssh_access).
const REMOTE_USER = 'c2838551c';

type Mode = 'dev' | 'preprod' | 'prod';
type RemoteMode = 'preprod' | 'prod';
type Target = 'front' | 'back';

function isRemoteMode(mode: Mode): mode is RemoteMode {
  return mode === 'preprod' || mode === 'prod';
}

interface Args {
  /** undefined only for --dev, which never leaves this machine. */
  transport: Transport | undefined;
  mode: Mode;
  targets: Target[];
  dryRun: boolean;
  confirm: boolean;
  databaseMigrate: boolean;
  npmInstall: boolean;
  reset: boolean;
  wipeProdConfirm: boolean;
  faker: boolean;
  noRouteAdminToken: boolean;
  routeAdminToken: string | null;
  patch: string | null;
  rollback: string | null;
  maintenance: boolean;
  maintenancePrepare: boolean;
  maintenanceFrom: string | null;
  maintenanceTo: string | null;
  maintenanceMessage: string | null;
  /** Install only the ops-over-FTP support (gateway + its token). */
  ftpOps: boolean;
  /** Remove it. Default at the end of every --prod deploy. */
  ftpOpsRemove: boolean;
}

// Becomes both a URL path segment (/<token>/) and a literal inside an Apache
// RewriteRule regex (see kernel/front/scripts/version-dist.mjs) — kept to
// characters with no meaning in either context, rather than escaping.
const ROUTE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// --patch's argument: a bare X.Y.Z, checked against the root package.json
// version only insofar as it must look like a version at all — it is
// deliberately allowed to differ (that's the whole point, see --patch's
// usage note below).
const PATCH_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SSH_CONNECT_TIMEOUT_SECONDS = 10;
// The gateway runs commands synchronously over HTTPS. Verified against this
// host: a 300s command returns 200 with its output intact, so `npm install`
// and a Passenger restart both fit without any job/polling machinery.
const GATEWAY_COMMAND_TIMEOUT_SECONDS = 900;
const FTP_UPLOAD_TIMEOUT_SECONDS = 900;
// How long to wait for a freshly published gateway script to actually be the
// one executing. Measured at ~25s on this host; the margin is for a cold vhost.
const GATEWAY_PUBLISH_TIMEOUT_SECONDS = 120;
let activeArgs: Args | undefined;

function sshTransportArgs(): string[] {
  return ['-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`];
}

class DeployAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeployAbortError';
  }
}

function fail(message: string): never {
  console.error(`[deploy] ${message}`);
  console.error(
    "  npm run deploy -- [--ssh|--ftp] --dev|--preprod|--prod [--target 'front back'] [--dry-run] [--confirm] [--no-database-migrate] [--no-npm-install] [--reset [--i-understand-this-wipes-production-data]] [--faker] [--no-route-admin-token] [--route-admin-token <token>] [--patch X.Y.Z]",
  );
  console.error('  npm run deploy -- --ssh|--ftp --preprod|--prod --rollback X.Y.Z [--dry-run] [--confirm]');
  console.error(
    '  npm run deploy -- --preprod|--prod --ftp-ops            (install only the FTP ops gateway)',
  );
  console.error(
    '  npm run deploy -- --preprod|--prod --ftp-ops-remove     (remove it; default at the end of a --prod deploy)',
  );
  console.error(
    '  npm run deploy -- --ssh|--ftp --preprod|--prod --maintenance-prepare --from DD/MM/YY-HH:mm --to DD/MM/YY-HH:mm [--message "..."] [--dry-run] [--confirm]',
  );
  console.error(
    '  npm run deploy -- --ssh|--ftp --preprod|--prod --maintenance [--from ...] [--to ...] [--message "..."] [--dry-run] [--confirm]',
  );
  throw new DeployAbortError(message);
}

function parseArgs(argv: string[]): Args {
  let transport: Transport | undefined;
  let transportArgs: string[];
  try {
    ({ transport, rest: transportArgs } = parseTransportFlags(argv));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  let mode: string | undefined;
  let targetRaw = 'front back';
  let dryRun = false;
  let confirm = false;
  let databaseMigrate = true;
  let npmInstall = true;
  let reset = false;
  let wipeProdConfirm = false;
  let faker = false;
  let noRouteAdminToken = false;
  let routeAdminToken: string | null = null;
  let patch: string | null = null;
  let rollback: string | null = null;
  let targetCount = 0;
  let maintenance = false;
  let maintenancePrepare = false;
  let maintenanceFrom: string | null = null;
  let maintenanceTo: string | null = null;
  let maintenanceMessage: string | null = null;
  let ftpOps = false;
  let ftpOpsRemove = false;

  const rest = [...transportArgs];
  while (rest.length) {
    const token = rest.shift();
    if (token === '--mode') fail('`--mode` is no longer accepted; use --dev, --preprod, or --prod');
    else if (token === '--dev' || token === '--preprod' || token === '--prod') {
      targetCount += 1;
      mode = token.slice(2);
    } else if (token === '--target') targetRaw = rest.shift() ?? '';
    else if (token === '--dry-run') dryRun = true;
    else if (token === '--confirm') confirm = true;
    else if (token === '--ftp-ops') ftpOps = true;
    else if (token === '--ftp-ops-remove') ftpOpsRemove = true;
    else if (token === '--no-database-migrate') databaseMigrate = false;
    else if (token === '--no-npm-install') npmInstall = false;
    else if (token === '--reset') reset = true;
    else if (token === '--i-understand-this-wipes-production-data') wipeProdConfirm = true;
    else if (token === '--faker') faker = true;
    else if (
      token === '--no-route-token' ||
      token === '--keep-route-token' ||
      token === '--route-token'
    ) {
      fail(`${token} was removed. Preprod has no access token and no IP allowlist.`);
    } else if (token === '--no-route-admin-token') noRouteAdminToken = true;
    else if (token === '--route-admin-token') routeAdminToken = rest.shift() ?? '';
    else if (token === '--patch') patch = rest.shift() ?? '';
    else if (token === '--rollback') rollback = rest.shift() ?? '';
    else if (token === '--maintenance') maintenance = true;
    else if (token === '--maintenance-prepare') maintenancePrepare = true;
    else if (token === '--from') maintenanceFrom = rest.shift() ?? '';
    else if (token === '--to') maintenanceTo = rest.shift() ?? '';
    else if (token === '--message') maintenanceMessage = rest.shift() ?? '';
    else fail(`unknown argument "${token}"`);
  }

  if (targetCount === 0 || (mode !== 'dev' && mode !== 'preprod' && mode !== 'prod')) {
    fail('exactly one of --dev, --preprod, or --prod is required');
  }
  if (targetCount > 1) fail('only one of --dev, --preprod, or --prod is allowed');

  const targets = targetRaw
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token !== 'front' && token !== 'back')
        fail(`--target entries must be "front" or "back" (got "${token}")`);
      return token;
    });
  if (targets.length === 0) fail('--target must name at least one of "front" or "back"');

  // --reset against --prod requires this second, deliberately verbose flag
  // on top of --confirm — --confirm alone is also the routine requirement
  // for every other --prod deploy action, so it must never by itself be
  // enough to let a database-reset through against production.
  if (reset && mode === 'prod' && !wipeProdConfirm) {
    fail(
      '--reset with --prod also requires --i-understand-this-wipes-production-data — database-reset must never run against production without an explicit, unmistakable opt-in',
    );
  }
  if (wipeProdConfirm && !(reset && mode === 'prod')) {
    fail('--i-understand-this-wipes-production-data is only valid together with --reset --prod');
  }
  if (reset && !databaseMigrate)
    fail('--reset already implies database-migrate, cannot combine with --no-database-migrate');
  if (faker && mode === 'prod')
    fail('--faker is not allowed with --prod — fake demo data must never run against production');
  if (mode === 'prod' && !confirm && !dryRun)
    fail('--prod requires --confirm (or pass --dry-run to preview first)');
  if (routeAdminToken !== null && noRouteAdminToken)
    fail('--route-admin-token and --no-route-admin-token cannot be combined');
  if ((routeAdminToken !== null || noRouteAdminToken) && mode === 'dev') {
    fail('--route-admin-token/--no-route-admin-token are only valid with --preprod or --prod');
  }
  if ((routeAdminToken !== null || noRouteAdminToken) && !targets.includes('front')) {
    fail('--route-admin-token/--no-route-admin-token require a front deployment');
  }
  if (mode === 'dev' && targetRaw !== 'front back') {
    fail('--target is only valid with --preprod or --prod (local --dev does not upload)');
  }
  if (mode === 'dev' && !npmInstall) fail('--no-npm-install is only valid with --preprod or --prod');
  if (routeAdminToken !== null && !ROUTE_TOKEN_PATTERN.test(routeAdminToken)) {
    fail(`--route-admin-token must be 1-64 letters/digits/hyphens/underscores (got "${routeAdminToken}")`);
  }
  if (patch !== null && mode === 'dev')
    fail('--patch is only valid with --preprod or --prod (local --dev does not build/upload)');
  if (patch !== null && !PATCH_VERSION_PATTERN.test(patch)) {
    fail(`--patch must be X.Y.Z (got "${patch}")`);
  }
  if (rollback !== null && (mode === 'dev' || !PATCH_VERSION_PATTERN.test(rollback)))
    fail('--rollback must be X.Y.Z on preprod or prod');
  if (
    rollback !== null &&
    (patch !== null ||
      reset ||
      faker ||
      maintenance ||
      maintenancePrepare ||
      !databaseMigrate ||
      !npmInstall ||
      noRouteAdminToken ||
      routeAdminToken !== null)
  )
    fail('--rollback cannot be combined with deploy-operation flags');
  if (rollback !== null && (targets.length !== 2 || !targets.includes('front') || !targets.includes('back')))
    fail('--rollback always switches front and back together; omit --target');

  if (maintenance && maintenancePrepare) fail('--maintenance and --maintenance-prepare cannot be combined');
  if ((maintenance || maintenancePrepare) && mode === 'dev') {
    fail(
      '--maintenance/--maintenance-prepare are not valid with --dev (there is nothing deployed locally to lock down)',
    );
  }
  if (maintenancePrepare && (!maintenanceFrom || !maintenanceTo)) {
    fail('--maintenance-prepare requires --from and --to');
  }
  if (!maintenancePrepare && !maintenance && (maintenanceFrom || maintenanceTo || maintenanceMessage)) {
    fail('--from/--to/--message are only valid with --maintenance-prepare or --maintenance');
  }
  if (maintenance && (reset || faker || !databaseMigrate || !npmInstall)) {
    fail(
      '--maintenance only toggles the lockdown page — it cannot be combined with --reset/--faker/--no-database-migrate/--no-npm-install',
    );
  }
  if (maintenance && patch !== null) {
    fail(
      '--maintenance only toggles the lockdown page — it does not build/upload the app, so --patch would have no effect',
    );
  }
  if (ftpOps && ftpOpsRemove) fail('--ftp-ops and --ftp-ops-remove are mutually exclusive');
  if ((ftpOps || ftpOpsRemove) && mode === 'dev') {
    fail('--ftp-ops/--ftp-ops-remove target the remote gateway; --dev has none');
  }
  // These flags are inherently about the PHP deploy gateway: they install or
  // remove it by hand, so they imply --ftp rather than making the operator
  // restate it. Ops CLIs never take this path.
  if ((ftpOps || ftpOpsRemove) && !transport) transport = 'ftp';

  return {
    transport,
    mode,
    targets: [...new Set(targets)],
    dryRun,
    confirm,
    databaseMigrate,
    npmInstall,
    reset,
    wipeProdConfirm,
    faker,
    maintenance,
    maintenancePrepare,
    maintenanceFrom,
    maintenanceTo,
    maintenanceMessage,
    noRouteAdminToken,
    routeAdminToken,
    patch,
    rollback,
    ftpOps,
    ftpOpsRemove,
  };
}

function readRootPackageVersion(): string {
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Root package.json must contain a MAJOR.MINOR.PATCH version');
  }
  return version;
}

/** --patch overrides which version folder/cPanel app this deploy targets,
 * for both front and back — used to re-push current source into an
 * already-live version (e.g. a hotfix) without bumping root package.json
 * or registering a new cPanel Node.js App. Falls back to the root
 * package.json version when --patch wasn't passed. */
function effectiveVersion(args: Args, actualVersion: string): string {
  return args.patch ?? actualVersion;
}

function run(dryRun: boolean, command: string, args: string[], options: { cwd?: string } = {}): void {
  // The FTP transport substitutes the two remote primitives and nothing else,
  // so every call site below keeps issuing the exact ssh/rsync invocation the
  // SSH transport has always used.
  if (activeArgs?.transport === 'ftp' && command === 'ssh') {
    console.log(`[deploy]${dryRun ? ' (dry-run)' : ''} gateway ${args.at(-1) ?? ''}`);
    if (dryRun) return;
    ftpGatewayExec(args.at(-1) ?? '');
    return;
  }
  if (activeArgs?.transport === 'ftp' && command === 'rsync') {
    if (dryRun) {
      console.log(
        `[deploy] (dry-run) FTP upload ${args.at(-2) ?? 'source'} -> ${args.at(-1)?.replace(`${SSH_HOST}:`, '') ?? 'destination'}`,
      );
      return;
    }
    ftpSyncFromRsyncArgs(args, options.cwd);
    return;
  }
  const display = `${command} ${args.join(' ')}`;
  console.log(`[deploy]${dryRun ? ' (dry-run)' : ''} ${display}`);
  if (dryRun) return;
  if (command === 'ssh') {
    execFileSync('ssh', [...sshTransportArgs(), ...args], {
      stdio: 'inherit',
      cwd: options.cwd,
    });
    return;
  }
  if (command === 'rsync') {
    execFileSync('rsync', ['-e', `ssh ${sshTransportArgs().join(' ')}`, ...args], {
      stdio: 'inherit',
      cwd: options.cwd,
    });
    return;
  }
  execFileSync(command, args, { stdio: 'inherit', cwd: options.cwd });
}

/** Connection details for the FTP transport. The gateway is PHP/Apache on its
 * own subdomain, deliberately independent of the Node app it controls: it has
 * to keep answering while that app is stopped mid-deploy or failing to boot.
 * FTP credentials are shared across targets and live in kernel private JSON. */
function ftpConnection(mode: Mode): {
  gatewayUrl: string;
  ftpHost: string;
  ftpPort: string;
  ftpUser: string;
  ftpPassword: string;
} {
  const json = loadPublicEnv(backRoot, mode);
  const gatewayUrl = (process.env.PAM_OPS_GATEWAY_URL ?? json.OPS_GATEWAY_URL)?.replace(/\/+$/, '');
  const ftpHost = json.FTP_HOST;
  const ftpPort = json.FTP_PORT ?? '21';
  const ftpUser = json.FTP_USER;
  const ftpPassword = json.FTP_PASSWORD;
  if (!gatewayUrl) fail(`ops.gatewayUrl not found for ${mode} — set it in tuucho-config/config.${mode}.json`);
  if (!ftpHost || !ftpUser || !ftpPassword)
    fail(`FTP transport requires ftp.host, ftp.user and ftp.password in kernel private JSON`);
  if (!/^\d{1,5}$/.test(ftpPort) || Number(ftpPort) > 65535)
    fail(`FTP_PORT must be a port number, got ${ftpPort}`);
  if (ftpPort === '22') fail('FTP_PORT=22 is SFTP/SSH, not FTP; this host serves FTP on port 21');
  return { gatewayUrl, ftpHost, ftpPort, ftpUser, ftpPassword };
}

function opsToken(mode: Mode): string {
  const token = loadPublicEnv(backRoot, mode).OPS_TOKEN;
  if (!token) fail(`ops.token not found for ${mode} — the gateway authenticates with it`);
  return token;
}

/** Host process leftover only: APP_TARGET selects the config folder. PORT is
 * optional for Passenger. Everything else lives in uploaded kernel JSON. */
function leftoverProcessEnv(mode: Mode): Record<string, string> {
  const json = loadPublicEnv(backRoot, mode);
  const env: Record<string, string> = { APP_TARGET: mode };
  if (json.APP_PORT) env.PORT = json.APP_PORT;
  return env;
}

/** LWS exposes cPanel's UAPI on the hosting node itself. Only used for the
 * startup-log lookup below, which has to work when the gateway itself is the
 * thing that failed — so it throws rather than calling fail(), letting that
 * caller swallow it. */
function cpanelUapi(
  mode: Mode,
  module: string,
  operation: string,
  parameters: Record<string, string>,
): unknown {
  const token = loadPublicEnv(backRoot, mode).LWS_API_TOKEN;
  if (!token) throw new Error('ops.lwsApiToken not found in kernel private JSON');
  const endpoint = new URL(`https://web60.lws-hosting.com:2083/execute/${module}/${operation}`);
  for (const [key, value] of Object.entries(parameters)) endpoint.searchParams.set(key, value);
  const output = execFileSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--fail',
      '--connect-timeout',
      '10',
      '--max-time',
      '30',
      '--ipv4',
      '-H',
      `Authorization: cpanel ${REMOTE_USER}:${token}`,
      endpoint.toString(),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Stock cPanel wraps UAPI data in `result`; LWS's proxy returns that same
  // object directly. Both are successful UAPI responses.
  const response = JSON.parse(output) as {
    result?: { status?: number; errors?: string[] | null; data?: unknown };
    status?: number;
    errors?: string[] | null;
    data?: unknown;
  };
  const result = response.result ?? response;
  if (result.status !== 1)
    throw new Error(`cPanel ${module}/${operation} failed: ${result.errors?.join('; ') ?? 'unknown error'}`);
  return result.data;
}

/** Best-effort last line of the API subdomain's error log, for the case where
 * the gateway is unreachable and there is no SSH to go and look. Never fatal:
 * it is a diagnostic bolted onto an error path that is already failing. */
function cpanelStartupError(mode: Mode): string | undefined {
  try {
    const domain = mode === 'prod' ? 'api.shop.example' : 'preprod-api.shop.example';
    const rows = cpanelUapi(mode, 'Stats', 'get_site_errors', { domain }) as unknown[];
    const text = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        if (!row || typeof row !== 'object') return undefined;
        const record = row as Record<string, unknown>;
        return [record.message, record.error, record.log, record.entry].find(
          (value) => typeof value === 'string',
        ) as string | undefined;
      })
      .filter((value): value is string => Boolean(value));
    return text.at(-1)?.replace(/\s+/g, ' ').slice(0, 500);
  } catch {
    return undefined;
  }
}

/** Runs one command on the host through the PHP gateway. The gateway
 * reproduces SSH's context (bash, $HOME as cwd, HOME exported), so the
 * command string handed here is byte-identical to the one the SSH transport
 * would run — see scripts/ops-gateway.php. */
function ftpGatewayExec(
  command: string,
  options: { allowFailure?: boolean; quiet?: boolean } = {},
): string | null {
  if (!activeArgs) fail('FTP transport was used before deploy arguments were initialized');
  const { gatewayUrl } = ftpConnection(activeArgs.mode);
  const endpoint = `${gatewayUrl}/control/exec`;
  const payload = JSON.stringify({ command });
  const token = opsToken(activeArgs.mode);
  let response: string | undefined;
  let lastError = 'connection failed';
  let parsed:
    | {
        success?: boolean;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        error?: { code?: string; message?: string };
      }
    | undefined;
  for (let attempt = 1; attempt <= GATEWAY_EXEC_ATTEMPTS; attempt += 1) {
    try {
      response = execFileSync(
        'curl',
        [
          '--silent',
          '--show-error',
          '--connect-timeout',
          String(SSH_CONNECT_TIMEOUT_SECONDS),
          '--max-time',
          String(GATEWAY_COMMAND_TIMEOUT_SECONDS),
          '-H',
          `Authorization: Bearer ${token}`,
          '-H',
          'Content-Type: application/json',
          '--data-raw',
          payload,
          endpoint,
        ],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (error) {
      const failure = error as { stderr?: Buffer | string };
      lastError = String(failure.stderr ?? 'connection failed').trim();
      if (attempt < GATEWAY_EXEC_ATTEMPTS) {
        console.log(
          `[deploy] FTP gateway: retrying after transport error (${attempt}/${GATEWAY_EXEC_ATTEMPTS}): ${lastError}`,
        );
        sleepSync(2000 * attempt);
        continue;
      }
      break;
    }
    if (response === undefined) continue;
    try {
      parsed = JSON.parse(response) as typeof parsed;
      break;
    } catch {
      lastError = `non-JSON response: ${response.slice(0, 200)}`;
      if (attempt < GATEWAY_EXEC_ATTEMPTS && isRetryableGatewayBody(response)) {
        console.log(
          `[deploy] FTP gateway: retrying after LiteSpeed 503 (${attempt}/${GATEWAY_EXEC_ATTEMPTS})`,
        );
        sleepSync(2000 * attempt);
        response = undefined;
        continue;
      }
      if (options.allowFailure) return null;
      fail(`gateway returned a non-JSON response from ${endpoint}: ${response.slice(0, 500)}`);
    }
  }
  if (parsed === undefined) {
    if (options.allowFailure) return null;
    const startupError = cpanelStartupError(activeArgs.mode);
    fail(
      `gateway request failed at ${endpoint}: ${lastError}${startupError ? `; cPanel error log: ${startupError}` : ''}`,
    );
  }
  if (!options.quiet) {
    if (parsed.stdout) process.stdout.write(parsed.stdout);
    if (parsed.stderr) process.stderr.write(parsed.stderr);
  }
  if (!parsed.success) {
    if (options.allowFailure) return null;
    if (parsed.error?.code === 'unauthorized') {
      // Worth spelling out: the gateway reads OPS_TOKEN from the release that
      // is currently deployed, so rotating it locally locks this transport out
      // until that release is replaced — which is what needs the gateway.
      fail(
        `gateway rejected OPS_TOKEN for ${activeArgs.mode}. It reads ops.token from the deployed release ` +
          `(private_html/${activeArgs.mode}/current/config/), so a locally rotated token ` +
          'will not match until that private JSON is replaced. Upload the new config.private.json over plain FTP first, then re-run.',
      );
    }
    if (options.quiet && parsed.stderr) process.stderr.write(parsed.stderr);
    fail(
      `gateway command failed (exit ${parsed.exitCode ?? '?'}): ${parsed.error?.message ?? parsed.error?.code ?? 'unknown error'}`,
    );
  }
  return parsed.stdout ?? '';
}

/** The one place that decides how a shell command reaches the host. Both
 * transports run the same string, which is what keeps --ssh and --ftp from
 * drifting apart. */
function remoteExecSync(command: string): string {
  // Deliberately runs even under --dry-run: every caller is a read-only query
  // (cat/grep/`cloudlinux-selector get`) whose answer is what makes the
  // preview accurate. This is what the SSH transport always did.
  if (activeArgs?.transport === 'ftp') return ftpGatewayExec(command, { quiet: true }) ?? '';
  return execFileSync('ssh', [...sshTransportArgs(), SSH_HOST, command], { encoding: 'utf8' });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function ftpPath(host: string, port: string, remotePath: string): string {
  const cleanHost = host.replace(/^ftps?:\/\//, '').replace(/\/$/, '');
  const path = remotePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `ftp://${cleanHost}:${port}/${path}`;
}

function ftpUploadFile(localPath: string, remotePath: string, mode: Mode): void {
  const { ftpHost, ftpPort, ftpUser, ftpPassword } = ftpConnection(mode);
  try {
    execFileSync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--fail',
        '--connect-timeout',
        '10',
        '--max-time',
        String(FTP_UPLOAD_TIMEOUT_SECONDS),
        '--ipv4',
        '--ftp-create-dirs',
        '--user',
        `${ftpUser}:${ftpPassword}`,
        '--upload-file',
        localPath,
        ftpPath(ftpHost, ftpPort, remotePath),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const failure = error as { stderr?: Buffer | string };
    fail(`FTP upload failed for ${remotePath}: ${String(failure.stderr ?? 'connection failed').trim()}`);
  }
}

/** Uploads a whole directory as one tarball and unpacks it on the host.
 *
 * FTP has no equivalent of rsync's incremental sync, and the obvious
 * alternative — one STOR per file — measures at ~0.21s per file against this
 * host, which is over seven minutes for the front's 1734 asset files alone.
 * A single compressed transfer plus a server-side `tar -xzf` is one round
 * trip, and the gateway already gives us the shell to run it.
 *
 * `prune` reproduces rsync's --delete: the tree is unpacked into a sibling
 * and renamed over the target, so the target only ever contains what the
 * local directory contains. `preserve` reproduces the fact that rsync
 * --delete does NOT remove excluded paths (no --delete-excluded is passed):
 * those entries are carried across from the live target before the swap. */
function ftpSyncDirectory(
  localDir: string,
  remoteDir: string,
  mode: Mode,
  options: { prune: boolean; preserve?: string[] } = { prune: true },
): void {
  const preserve = options.preserve ?? [];
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tuucho-ftp-'));
  const archive = join(temporaryDirectory, 'payload.tgz');
  try {
    execFileSync(
      'tar',
      ['-czf', archive, ...preserve.map((entry) => `--exclude=./${entry}`), '-C', localDir, '.'],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    const bytes = statSync(archive).size;
    const stagedName = `${remoteDir.replace(/[^A-Za-z0-9]+/g, '-')}-${process.pid}.tgz`;
    const staged = `private_html/${mode}/.deploy/${stagedName}`;
    console.log(
      `[deploy] FTP upload ${localDir} -> ${remoteDir} (${(bytes / 1048576).toFixed(1)} MiB archive)`,
    );
    ftpUploadFile(archive, staged, mode);

    const target = shellQuote(remoteDir);
    const stagedQuoted = shellQuote(staged);
    const unpack = shellQuote(`${remoteDir}.deploy-${process.pid}`);
    const previous = shellQuote(`${remoteDir}.replaced-${process.pid}`);
    const script = options.prune
      ? [
          'set -eu',
          `rm -rf ${unpack} ${previous}`,
          `mkdir -p ${unpack}`,
          `tar -xzf ${stagedQuoted} -C ${unpack}`,
          // Excluded paths are the host's, not the build's — node_modules is
          // installed up there, public/ and tmp/ are runtime state.
          ...preserve.map(
            (entry) =>
              `if [ -e ${shellQuote(`${remoteDir}/${entry}`)} ]; then mv ${shellQuote(`${remoteDir}/${entry}`)} ${shellQuote(`${remoteDir}.deploy-${process.pid}/${entry}`)}; fi`,
          ),
          // Two renames rather than rm -rf + mv: the target is live, and a
          // rename leaves it missing for microseconds instead of seconds.
          `if [ -e ${target} ]; then mv ${target} ${previous}; fi`,
          `mv ${unpack} ${target}`,
          `rm -rf ${previous}`,
          `rm -f ${stagedQuoted}`,
        ].join('\n')
      : [
          'set -eu',
          `mkdir -p ${target}`,
          `tar -xzf ${stagedQuoted} -C ${target}`,
          `rm -f ${stagedQuoted}`,
        ].join('\n');
    ftpGatewayExec(script, { quiet: true });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Refuses to write anywhere but the release trees this deploy owns.
 *
 * An earlier attempt at this transport unpacked a whole back release into the
 * account's home directory (config/, api/, db/, services/, app.js, server.js …
 * all loose in ~), because a destination path that came out empty silently
 * became the FTP root instead of failing. Every legitimate destination here
 * starts with one of four prefixes, so anything else is a bug in the caller
 * and must stop the deploy rather than land somewhere unexpected. */
function assertSafeRemotePath(remotePath: string): void {
  const allowed = ['public_html/', 'private_html/', 'nodevenv/', 'bin/'];
  if (
    !remotePath ||
    remotePath.startsWith('/') ||
    remotePath.includes('..') ||
    !allowed.some((prefix) => remotePath.startsWith(prefix))
  ) {
    fail(
      `refusing to upload to ${remotePath || '(empty path)'} — expected a path under ${allowed.join(', ')}`,
    );
  }
}

/** Translates the deploy's rsync invocations into the FTP equivalent. The
 * rsync call sites are left exactly as they are so the SSH transport keeps
 * running the same flags it always has; only the dispatch in run() differs. */
function ftpSyncFromRsyncArgs(args: string[], cwd?: string): void {
  if (!activeArgs) fail('FTP transport was used before deploy arguments were initialized');
  const sourceRaw = args.at(-2);
  const destinationRaw = args.at(-1);
  if (!sourceRaw || !destinationRaw) fail('could not parse rsync arguments for FTP upload');
  const source = sourceRaw.replace(/\/$/, '');
  const destination = (
    destinationRaw.startsWith(`${SSH_HOST}:`)
      ? destinationRaw.slice(`${SSH_HOST}:`.length)
      : destinationRaw.replace(/^[^/]*:/, '')
  ).replace(/\/$/, '');
  const local = source.startsWith('/') ? source : join(cwd ?? backRoot, source);
  assertSafeRemotePath(destination);
  const preserve = args
    .filter((value) => value.startsWith('--exclude='))
    .map((value) => value.slice('--exclude='.length).replace(/^\.?\//, ''));

  if (statSync(local).isFile()) {
    console.log(`[deploy] FTP upload ${local} -> ${destination}`);
    ftpUploadFile(local, destination, activeArgs.mode);
    return;
  }
  ftpSyncDirectory(local, destination, activeArgs.mode, { prune: args.includes('--delete'), preserve });
}

/** Polls the gateway's own /healthz until it reports the digest of the script
 * this deploy published. Returns false if it never does. */
function waitForGatewayDigest(mode: Mode, expected: string): boolean {
  const { gatewayUrl } = ftpConnection(mode);
  const token = opsToken(mode);
  const deadline = Date.now() + GATEWAY_PUBLISH_TIMEOUT_SECONDS * 1000;
  let announced = false;
  while (Date.now() < deadline) {
    try {
      const body = execFileSync(
        'curl',
        [
          '--silent',
          '--show-error',
          '--fail',
          '--connect-timeout',
          String(SSH_CONNECT_TIMEOUT_SECONDS),
          '--max-time',
          '20',
          '-H',
          `Authorization: Bearer ${token}`,
          `${gatewayUrl}/healthz`,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const health = JSON.parse(body) as { sha256?: string };
      if (health.sha256 === expected) return true;
    } catch {
      // The vhost may be mid-reload; keep polling until the deadline.
    }
    if (!announced) {
      console.log('[deploy] FTP gateway: waiting for the published script to take effect (opcache)');
      announced = true;
    }
    sleepSync(2000);
  }
  return false;
}

/** Manual `--ftp-ops`: the PHP deploy gateway and the OPS_TOKEN it
 * authenticates with. Nothing else — no build, no release, no restart.
 *
 * The token goes in its own file beside the release rather than into the
 * release's kernel JSON, for two reasons. It leaves the deployed application's
 * configuration completely untouched — which is what makes `--ftp-ops` safe to
 * run against a production release built long before this gateway existed. And
 * it survives a release swap, so rotating OPS_TOKEN no longer locks the
 * transport out of the host it needs in order to publish the new value. */
function installFtpOps(args: Args): void {
  const mode = args.mode as RemoteMode;
  const { gatewayUrl } = ftpConnection(mode);
  console.log(
    `[deploy]${args.dryRun ? ' (dry-run)' : ''} --ftp-ops: installing the FTP operations gateway at ${gatewayUrl}`,
  );
  if (args.dryRun) {
    console.log(
      `[deploy] (dry-run) would upload scripts/ops-gateway.{php,htaccess} and the OPS_TOKEN file for ${mode}`,
    );
    return;
  }
  bootstrapFtpGateway(args);

  // Token was already published in bootstrapFtpGateway (needed for /healthz on
  // a wiped host). Re-publish + chmod here so `--ftp-ops` alone stays complete.
  publishOpsGatewayToken(mode);
  remoteExecSync(
    `chmod 700 private_html/${mode}/.ops-gateway && chmod 600 private_html/${mode}/.ops-gateway/token`,
  );
  console.log(`[deploy] --ftp-ops: PHP deploy gateway ready for FTP deploys against --${mode}.`);
}

/** Takes it all back off: the loopback server it may have started, its state,
 * and the gateway script itself. Ordered so the gateway is the last thing to
 * go — every step before it needs the gateway to run. */
function removeFtpOps(args: Args, options: { quiet?: boolean } = {}): void {
  const mode = args.mode as RemoteMode;
  const directory = mode === 'preprod' ? 'ops-preprod' : 'ops';
  const gatewayRoot = `/home/${REMOTE_USER}/public_html/${directory}`;
  console.log(
    `[deploy]${args.dryRun ? ' (dry-run)' : ''} --ftp-ops-remove: removing the FTP operations gateway for ${mode}`,
  );
  if (args.dryRun) return;
  try {
    remoteExecSync(
      `for p in $(pgrep -f "private_html/${mode}/current/opsServer[.]js" 2>/dev/null); do kill "$p" 2>/dev/null; done; ` +
        `rm -rf private_html/${mode}/.ops-gateway; ` +
        `rm -f ${gatewayRoot}/index.php ${gatewayRoot}/index.next.php ${gatewayRoot}/index.prev.php`,
    );
    console.log('[deploy] --ftp-ops-remove: gateway removed.');
  } catch (error) {
    // Nothing left to remove is the desired end state, not a failure — and on
    // a prod deploy this runs last, where failing would be worse than useless.
    if (!options.quiet) {
      console.warn(
        `[deploy] --ftp-ops-remove: could not reach the gateway (${error instanceof Error ? error.message : String(error)}) — it may already be gone.`,
      );
    }
  }
}

/** OPS_TOKEN the gateway authenticates with, landed over FTP. Required before
 * `/healthz` can succeed when the release tree (and its kernel JSON) was wiped —
 * otherwise bootstrap waits forever on 401 because the token file is only
 * uploaded later by `--ftp-ops`. */
function publishOpsGatewayToken(mode: Mode): void {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tuucho-ops-token-'));
  const tokenFile = join(temporaryDirectory, 'token');
  try {
    writeFileSync(tokenFile, `${opsToken(mode)}\n`, { mode: 0o600 });
    ftpUploadFile(tokenFile, `private_html/${mode}/.ops-gateway/token`, mode);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Publishes the PHP gateway itself, then proves it runs in the same context
 * SSH would. Nothing else in the FTP path is safe until that holds: a gateway
 * executing from its own document root turns every relative deploy path into
 * a phantom tree under public_html, silently and with exit status 0. */
function bootstrapFtpGateway(args: Args): void {
  const gatewayDirectory = args.mode === 'preprod' ? 'ops-preprod' : 'ops';
  const gatewayRoot = `/home/${REMOTE_USER}/public_html/${gatewayDirectory}`;
  const { gatewayUrl } = ftpConnection(args.mode);
  console.log(
    `[deploy]${args.dryRun ? ' (dry-run)' : ''} FTP gateway: publishing ${gatewayUrl} from public_html/${gatewayDirectory}`,
  );
  if (args.dryRun) return;

  const php = join(backRoot, 'scripts', 'ops-gateway.php');
  const htaccess = join(backRoot, 'scripts', 'ops-gateway.htaccess');
  requireExists(false, php, 'scripts/ops-gateway.php');
  requireExists(false, htaccess, 'scripts/ops-gateway.htaccess');

  // The gateway is installed, used for this deploy, and (on prod, by default)
  // removed again at the end — it is disposable, not a service being upgraded
  // in place. So publish it straight over FTP. Asking whatever happens to be
  // answering to validate its own replacement bought nothing: the previous
  // copy is about to be discarded either way, and the check collapsed to a
  // direct overwrite the moment the host returned a LiteSpeed 503, which is
  // exactly when it claimed to be protecting something. waitForGatewayDigest
  // below is the real proof, and it tests the copy actually in service.
  ftpUploadFile(php, `public_html/${gatewayDirectory}/index.php`, args.mode);
  ftpUploadFile(htaccess, `public_html/${gatewayDirectory}/.htaccess`, args.mode);

  // Auth before the digest wait: after a wipe there is no release kernel JSON and
  // no `.ops-gateway/token`, so every /healthz call 401s until this lands.
  publishOpsGatewayToken(args.mode as RemoteMode);

  // Replacing index.php does not put it into service: this host's opcache
  // keeps executing the previous bytes for up to ~30s. Wait for the running
  // gateway to report the digest of the file we just published, so every
  // check below — and every deploy command after them — runs against it.
  const expected = createHash('sha256').update(readFileSync(php)).digest('hex');
  if (!waitForGatewayDigest(args.mode, expected)) {
    fail(
      `FTP gateway at ${gatewayUrl} never reported the published script's digest — ` +
        'it may be cached, the upload did not land, or OPS_TOKEN on the host does not match this checkout',
    );
  }

  // FTP cannot set permissions; do it now that the gateway answers.
  remoteExecSync(
    `chmod 700 private_html/${args.mode}/.ops-gateway && chmod 600 private_html/${args.mode}/.ops-gateway/token`,
  );

  const home = `/home/${REMOTE_USER}`;
  const probe = (ftpGatewayExec('printf "%s|%s" "$PWD" "$HOME"', { quiet: true }) ?? '').trim();
  if (probe !== `${home}|${home}`) {
    fail(
      `FTP gateway is not running as SSH would (expected cwd|HOME of "${home}|${home}", got "${probe}") — ` +
        'refusing to send SSH-shaped commands that would resolve against the wrong tree',
    );
  }
  // Housekeeping for exactly that failure mode, should an older gateway have
  // left one behind. Scoped to the gateway's own document root.
  ftpGatewayExec(
    `rm -f ${gatewayRoot}/index.next.php ${gatewayRoot}/index.prev.php ${gatewayRoot}/.user.ini; ` +
      `rm -rf ${gatewayRoot}/private_html ${gatewayRoot}/public_html ${gatewayRoot}/nodevenv ${gatewayRoot}/bin`,
    { quiet: true },
  );
  console.log(`[deploy] FTP gateway: ready at ${gatewayUrl} (cwd ${home})`);
}

function clearDist(dryRun: boolean, root: string): void {
  const dist = join(root, 'dist');
  console.log(`[deploy]${dryRun ? ' (dry-run)' : ''} rm -rf ${dist}`);
  if (dryRun) return;
  rmSync(dist, { recursive: true, force: true });
}

function build(
  dryRun: boolean,
  root: string,
  mode: RemoteMode,
  adminRouteToken: string | null,
  extraArgs: string[] = [],
): void {
  // Cleared first so a leftover dist/ built for the other target (or an
  // older version) can never be silently uploaded — see this file's header.
  clearDist(dryRun, root);
  const buildArgs = ['run', 'build', '--', ...extraArgs, `--${mode}`];
  if (adminRouteToken) buildArgs.push('--admin-route-token', adminRouteToken);
  run(dryRun, 'npm', buildArgs, { cwd: root });
}

/** --maintenance-prepare's --from/--to/--message, forwarded verbatim into
 * kernel/front's own build.mjs maintenance-prepare form — front only, see
 * this file's header. Empty when --maintenance-prepare wasn't passed. */
function maintenancePrepareBuildArgs(args: Args): string[] {
  if (!args.maintenancePrepare) return [];
  const extra = [
    'maintenance-prepare',
    '--from',
    args.maintenanceFrom as string,
    '--to',
    args.maintenanceTo as string,
  ];
  if (args.maintenanceMessage) extra.push('--message', args.maintenanceMessage);
  return extra;
}

/** --patch's version, forwarded to both repos' build.mjs as --patch-version
 * — see effectiveVersion's comment. Empty when --patch wasn't passed. */
function patchVersionBuildArgs(args: Args): string[] {
  return args.patch ? ['--patch-version', args.patch] : [];
}

/** Default random 6-digit admin path segment (100000–999999). Only deploy
 * generates this; plain `npm run build` never injects one. */
function generateRouteToken(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

function requireExists(dryRun: boolean, path: string, description: string): void {
  if (existsSync(path)) return;
  if (dryRun) {
    console.log(
      `[deploy] (dry-run) ${description} not present yet at ${path} — would exist after the build step above.`,
    );
    return;
  }
  fail(`${description} not found at ${path} — the build step should have produced it.`);
}

// Getting back OUT of maintenance is deliberately not a separate flag/mode
// here — it's just a normal deploy (`npm run deploy -- --<mode>`, no
// --maintenance), which already rebuilds and uploads the real dist/.htaccess
// as part of what it always does, overwriting whatever's live regardless of
// what that was. A dedicated --restore that swaps .htaccess back from a
// saved local copy was tried first and dropped: it depended on a local
// dist/.htaccess surviving untouched from the last real build until whenever
// someone got around to restoring, which a routine `rm -rf dist` (even one
// unrelated to this mode) silently broke, blocking the one thing standing
// between the live site and staying down.
function runMaintenanceLockdown(args: Args): void {
  const mode = args.mode as RemoteMode;

  const buildArgs = ['run', 'build', '--', 'maintenance'];
  if (args.maintenanceFrom) buildArgs.push('--from', args.maintenanceFrom);
  if (args.maintenanceTo) buildArgs.push('--to', args.maintenanceTo);
  if (args.maintenanceMessage) buildArgs.push('--message', args.maintenanceMessage);
  run(args.dryRun, 'npm', buildArgs, { cwd: frontRoot });
  const html = join(frontRoot, 'dist', 'maintenance.html');
  const htaccess = join(frontRoot, 'dist', 'maintenance.htaccess');
  requireExists(args.dryRun, html, 'front dist/maintenance.html');
  requireExists(args.dryRun, htaccess, 'front dist/maintenance.htaccess');

  const remoteDir = `public_html/${mode}`;
  run(args.dryRun, 'rsync', ['-a', html, `${SSH_HOST}:${remoteDir}/maintenance.html`]);
  console.log(`[deploy] activating maintenance lockdown for ${mode} — this takes the live site down now`);
  run(args.dryRun, 'rsync', ['-a', htaccess, `${SSH_HOST}:${remoteDir}/.htaccess`]);
  console.log(
    `[deploy] ${mode} is now in maintenance${args.dryRun ? ' (dry-run, nothing was executed)' : ''}. ` +
      `Bring it back with a normal deploy: npm run deploy -- --${mode}`,
  );
}

function sleepSync(ms: number): void {
  execFileSync('sleep', [String(ms / 1000)]);
}

// A `cloudlinux-selector restart` is not just a respawn on this host: the
// selector rewrites the API subdomain's .htaccess, and for a few seconds that
// file can name a Node virtualenv that does not exist
// (`.../current/22/bin/node` was observed while the real one is `.../24/`).
// Passenger retries the spawn — around 16 times in the case that prompted this
// number — and only then boots. 30s did not cover it and failed a deploy whose
// every other step had succeeded.
const HEALTHZ_TIMEOUT_MS = 180_000;
const LOCAL_API_TIMEOUT_MS = 120_000;
const HEALTHZ_POLL_INTERVAL_MS = 1_000;

function httpStatus(url: string, maxTimeSeconds = 15): string | null {
  // Do not pass --ipv4: from this network IPv4:443 to the LWS host is refused
  // while IPv6 works. Happy Eyeballs must be free to pick AAAA.
  try {
    return execFileSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '--connect-timeout',
        '10',
        '--max-time',
        String(maxTimeSeconds),
        url,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    return null;
  }
}

function waitUntilFtpGatewayReady(mode: RemoteMode): void {
  const { gatewayUrl } = ftpConnection(mode);
  const token = opsToken(mode);
  const timeoutMs = 90_000;
  const endpoint = `${gatewayUrl}/healthz`;
  console.log(`[deploy] waiting for ${endpoint} after the API restart (up to ${timeoutMs / 1000}s)...`);
  const started = Date.now();
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const body = execFileSync(
        'curl',
        [
          '--silent',
          '--connect-timeout',
          '10',
          '--max-time',
          '20',
          '-H',
          `Authorization: Bearer ${token}`,
          endpoint,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const parsed = JSON.parse(body) as { ok?: boolean };
      if (parsed.ok === true) {
        console.log(`[deploy] ${endpoint} is ready after ${Math.round((Date.now() - started) / 1000)}s.`);
        return;
      }
    } catch {
      // LiteSpeed 503 HTML or a dropped connection: retry until the deadline.
    }
    sleepSync(2000);
  }
  fail(`${endpoint} did not recover within ${timeoutMs / 1000}s after the API restart`);
}

function waitUntilUrlHealthy(url: string, timeoutMs: number): boolean {
  console.log(`[deploy] waiting for ${url} to report healthy (up to ${Math.round(timeoutMs / 1000)}s)...`);
  const started = Date.now();
  const deadline = started + timeoutMs;
  let lastReport = started;
  while (Date.now() < deadline) {
    const status = httpStatus(url);
    if (status === '200') {
      console.log(`[deploy] ${url} is healthy after ${Math.round((Date.now() - started) / 1000)}s.`);
      return true;
    }
    // Silence for three minutes is indistinguishable from a hang; say what the
    // endpoint is actually answering while we wait.
    if (Date.now() - lastReport >= 15_000) {
      console.log(
        `[deploy] still waiting (${Math.round((Date.now() - started) / 1000)}s, last status ${status ?? 'no response'})`,
      );
      lastReport = Date.now();
    }
    sleepSync(HEALTHZ_POLL_INTERVAL_MS);
  }
  return false;
}

/** Blocks until `https://<domain>/healthz` reports 200, or fails loudly
 * after HEALTHZ_TIMEOUT_MS. A restart is asynchronous (Passenger has to
 * actually respawn the process) — proceeding straight to migrate/reset/seed
 * without this risks hitting the app mid-cycle (see the 503 that happened
 * on preprod when a heavy library-import batch call landed ~90s after a
 * restart, right as Passenger was recycling the worker under load). */
function waitUntilHealthy(domain: string): void {
  const url = `https://${domain}/healthz`;
  if (!waitUntilUrlHealthy(url, HEALTHZ_TIMEOUT_MS)) {
    fail(
      `${url} did not report healthy within ${HEALTHZ_TIMEOUT_MS / 1000}s after restart — check ~/private_html/.../tmp/... startup.log on the server.`,
    );
  }
}

function localApiBaseUrl(): string {
  return (loadApiBaseUrl(backRoot, 'dev') ?? 'http://localhost:3000').replace(/\/$/, '');
}

function localHealthzUrl(): string {
  return `${localApiBaseUrl()}/healthz`;
}

function isLocalApiHealthy(): boolean {
  return httpStatus(localHealthzUrl()) === '200';
}

function signalTree(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== 'win32') process.kill(-pid, signal);
    else process.kill(pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopLocalApi(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  console.log(`[deploy] stopping local API (pid ${pid})`);
  signalTree(pid, 'SIGTERM');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    sleepSync(200);
  }
  if (isPidAlive(pid)) {
    console.log(`[deploy] force-killing local API (pid ${pid})`);
    signalTree(pid, 'SIGKILL');
  }
}

function startLocalApi(): ChildProcess {
  console.log('[deploy] local API is down — starting Postgres + API');
  run(
    false,
    'docker',
    ['compose', '--env-file', '.compose.env', 'up', '-d'],
    { cwd: backRoot },
  );
  const child = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: backRoot,
    env: { ...process.env, APP_TARGET: 'dev' },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  if (!child.pid) fail('failed to start local API (no pid)');
  if (!waitUntilUrlHealthy(localHealthzUrl(), LOCAL_API_TIMEOUT_MS)) {
    stopLocalApi(child);
    fail(
      `${localHealthzUrl()} did not report healthy within ${LOCAL_API_TIMEOUT_MS / 1000}s — check the API boot log above.`,
    );
  }
  return child;
}

function withLocalApi(dryRun: boolean, fn: () => void): void {
  if (dryRun) {
    if (isLocalApiHealthy()) {
      console.log(
        `[deploy] (dry-run) local API already healthy at ${localApiBaseUrl()} — would leave it running`,
      );
    } else {
      console.log(
        `[deploy] (dry-run) local API down — would start docker compose + tsx src/server.ts, then stop it afterwards`,
      );
    }
    fn();
    return;
  }

  let started: ChildProcess | null = null;
  const stopIfStarted = (): void => {
    if (!started) return;
    stopLocalApi(started);
    started = null;
  };
  process.once('SIGINT', () => {
    stopIfStarted();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    stopIfStarted();
    process.exit(143);
  });

  if (isLocalApiHealthy()) {
    console.log(`[deploy] local API already running at ${localApiBaseUrl()} — leaving it up afterwards`);
  } else {
    started = startLocalApi();
  }
  try {
    fn();
  } finally {
    stopIfStarted();
  }
}

interface SelectorApp {
  app_mode: string;
  app_uri: string;
  domain: string;
  env_vars: Record<string, string>;
  startup_file: string;
}

interface SelectorEntry {
  nodeVersion: string;
  appRoot: string;
  app: SelectorApp;
}

// LWS can omit a stopped application from a later `get` response. Read the
// selector state once, before stopActiveBackApp stops anything, and keep that
// pre-stop identity through this deploy's create/update decision.
let selectorEntriesSnapshot: SelectorEntry[] | null = null;

/** cPanel Node.js Selector "Application Mode" per target, which is what sets a
 * real `NODE_ENV` for the app.
 *
 * Deliberately NOT this app's own `APP_TARGET` (see config/envSources.ts's
 * requiredAppTarget doc comment): the two are decoupled on purpose, and nothing
 * under `src/` reads `NODE_ENV` for behaviour. What it does drive is Passenger,
 * which serves detailed friendly-error pages in development mode when the app
 * fails to BOOT — outside the reach of app.ts's error handler, because Express
 * never started. Preprod accepts that in exchange for boot diagnostics on a
 * non-public environment; prod must never show them.
 *
 * Reconciled on every deploy by ensureBackApp, not only at creation: before
 * that, the mode was set once by `create` and then never looked at again, so a
 * hand-edit in cPanel silently became permanent. */
function appModeForMode(mode: RemoteMode): 'development' | 'production' {
  return mode === 'preprod' ? 'development' : 'production';
}

function selectorEntriesForMode(mode: RemoteMode, entries = querySelectorEntries()): SelectorEntry[] {
  const appRoot = `private_html/${mode}/current`;
  const apiDomain = mode === 'preprod' ? 'preprod-api.shop.example' : 'api.shop.example';
  return entries.filter(
    (entry) =>
      entry.appRoot === appRoot ||
      entry.appRoot.startsWith(`private_html/${mode}/v`) ||
      entry.app.domain === apiDomain,
  );
}

/** Reads cPanel's live Node.js Selector registrations (read-only, safe to
 * run even during --dry-run) so a version bump can be handled without
 * hand-typing --domain/--app-mode/--startup-file/--env-vars: whatever the
 * previous version's app was configured with gets cloned onto the new one. */
function querySelectorEntries(): SelectorEntry[] {
  if (selectorEntriesSnapshot !== null) return selectorEntriesSnapshot;
  const output = remoteExecSync('cloudlinux-selector get --interpreter nodejs --json');
  const parsed = JSON.parse(output) as {
    available_versions: Record<
      string,
      { users?: Record<string, { applications?: Record<string, SelectorApp> }> }
    >;
  };
  const entries: SelectorEntry[] = [];
  for (const [nodeVersion, versionInfo] of Object.entries(parsed.available_versions)) {
    const applications = versionInfo.users?.[REMOTE_USER]?.applications ?? {};
    for (const [appRoot, app] of Object.entries(applications)) {
      entries.push({ nodeVersion, appRoot, app });
    }
  }
  selectorEntriesSnapshot = entries;
  return entries;
}

/** Select the newest Node version offered by this cPanel account for a true
 * first install, when there is no existing application to clone. */
function queryLatestSelectorNodeVersion(): string {
  const output = remoteExecSync('cloudlinux-selector get --interpreter nodejs --json');
  const parsed = JSON.parse(output) as { available_versions: Record<string, unknown> };
  const versions = Object.keys(parsed.available_versions).sort((left, right) => {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
      const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });
  const latest = versions.at(-1);
  if (!latest) fail('cPanel reports no available Node.js version');
  return latest;
}

/** Pushes leftover process env (`APP_TARGET`, optional `PORT`) onto the
 * cPanel Node.js App as the exact process-env set. Live keys that are not
 * leftover are removed. A no-op when the live set already matches. */
function syncLwsEnvVars(
  args: Args,
  appRoot: string,
  currentEnvVars: Record<string, string>,
  lwsEnv: Record<string, string>,
): void {
  if (lwsEnvVarsMatch(currentEnvVars, lwsEnv)) return;
  const currentKeys = Object.keys(currentEnvVars);
  const desiredKeys = Object.keys(lwsEnv);
  const removed = currentKeys.filter((key) => !(key in lwsEnv));
  const added = desiredKeys.filter((key) => !(key in currentEnvVars));
  const changed = desiredKeys.filter((key) => key in currentEnvVars && currentEnvVars[key] !== lwsEnv[key]);
  console.log(`[deploy] syncing leftover process env (APP_TARGET) onto ${appRoot}`);
  if (added.length > 0) console.log(`[deploy]   add: ${added.join(', ')}`);
  if (changed.length > 0) console.log(`[deploy]   set: ${changed.join(', ')}`);
  if (removed.length > 0) console.log(`[deploy]   remove: ${removed.join(', ')}`);
  // Stopped-app `set --env-vars` realpath()s App Root. The registered key is
  // always `.../current`; if that path is the release symlink, CloudLinux
  // looks up `.../vX.Y.Z` and KeyErrors. A real directory keeps the lookup
  // on `current`. activateBackRelease puts the symlink back afterwards.
  materializeCurrentAppRoot(args);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `cloudlinux-selector set --interpreter nodejs --app-root ${appRoot} --env-vars '${JSON.stringify(lwsEnv)}' --json`,
  ]);
}

function lwsEnvVarsMatch(live: Record<string, string>, desired: Record<string, string>): boolean {
  const liveKeys = Object.keys(live);
  const desiredKeys = Object.keys(desired);
  if (liveKeys.length !== desiredKeys.length) return false;
  return desiredKeys.every((key) => live[key] === desired[key]);
}

/** Replace `private_html/<mode>/current` with an empty real directory when
 * it is the release symlink, so selector `set` cannot resolve App Root to
 * a version folder. No-op when `current` is already a directory. */
function materializeCurrentAppRoot(args: Args): void {
  const current = `private_html/${args.mode}/current`;
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `if [ -L ${current} ]; then rm ${current} && mkdir -p ${current}; elif [ ! -d ${current} ]; then mkdir -p ${current}; fi`,
  ]);
}

/** LWS canonicalizes an already-existing symlink when registering an app.
 * Create or move the selector entry while `current` is a real empty
 * directory, then replace that directory with the release symlink only after
 * the selector has persisted the literal `.../current` app root. A legacy
 * non-empty `current` directory is retained under a timestamped sibling
 * rather than deleted: this is the one-time migration path from the old
 * in-place layout. */
function prepareStableAppRoot(args: Args): void {
  const root = `private_html/${args.mode}`;
  const current = `${root}/current`;
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `mkdir -p ${root}; if [ -L ${current} ]; then rm ${current}; elif [ -d ${current} ]; then ` +
      `if [ -n "$(find ${current} -mindepth 1 -print -quit)" ]; then backup=${current}.legacy-$(date +%Y%m%d%H%M%S); mv ${current} "$backup"; else rmdir ${current}; fi; ` +
      `elif [ -e ${current} ]; then exit 1; fi; mkdir ${current}`,
  ]);
}

function activateBackRelease(args: Args, version: string): void {
  const root = `private_html/${args.mode}`;
  const current = `${root}/current`;
  // `current` is a symlink, an empty placeholder from materializeCurrentAppRoot,
  // or a CloudLinux stub (server.js / public / tmp / .htaccess from `set`).
  // A real release tree (package.json) must never be deleted — those live in vX.Y.Z.
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `if [ -L ${current} ]; then rm ${current}; ` +
      `elif [ -d ${current} ]; then ` +
      `if [ -f ${current}/package.json ] || [ -d ${current}/node_modules ]; then echo "[deploy] refusing to replace populated ${current}" >&2; exit 1; fi; ` +
      `rm -rf ${current}; ` +
      `elif [ -e ${current} ]; then echo "[deploy] refusing to replace ${current}" >&2; exit 1; fi; ` +
      `ln -s v${version} ${current}`,
  ]);
}

/** CloudLinux resolves the App Root symlink when looking up its virtualenv,
 * even though the cPanel UI correctly retains `current` as App Root. Keep a
 * release-name alias to the one stable `current` virtualenv so stop/restart
 * works after `current → vX.Y.Z` is switched. Existing real virtualenv
 * directories are never replaced. */
function ensureBackVenvReleaseAlias(args: Args, version: string): void {
  const venvRoot = `nodevenv/private_html/${args.mode}`;
  const releaseAlias = `${venvRoot}/v${version}`;
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `mkdir -p ${venvRoot}; if [ -e ${releaseAlias} ] && [ ! -L ${releaseAlias} ]; then exit 1; fi; ln -sfn current ${releaseAlias}`,
  ]);
}

/** Ensures the one stable cPanel Node.js App at
 * private_html/<mode>/current. A true first deploy creates that app with the
 * target API domain and the newest cPanel-provided Node version. An old
 * version-rooted app is cloned once onto `current`, preserving its cPanel
 * settings. */
function ensureBackApp(
  args: Args,
  _version: string,
): { appRoot: string; domain: string; startupFile: string } {
  const remoteAppRoot = `private_html/${args.mode}/current`;
  const apiDomain = args.mode === 'preprod' ? 'preprod-api.shop.example' : 'api.shop.example';
  // Older cPanel setups used a different app-root spelling (notably
  // private_html/preprod-api/v...). The API domain is the stable identity;
  // accept it so the first current-layout deploy can clone that app instead
  // of falsely treating an established environment as a first install.
  const entries = selectorEntriesForMode(args.mode);
  const lwsEnv = leftoverProcessEnv(args.mode);

  const appMode = appModeForMode(args.mode);

  const existing = entries.find((entry) => entry.appRoot === remoteAppRoot);
  if (existing) {
    syncLwsEnvVars(args, remoteAppRoot, existing.app.env_vars, lwsEnv);
    // Drift correction: `create` below is the only other place that sets the
    // mode, so without this an app that was flipped by hand in cPanel keeps
    // that value through every future deploy.
    if (existing.app.app_mode !== appMode) {
      console.log(`[deploy] app mode ${existing.app.app_mode} -> ${appMode} for ${remoteAppRoot}`);
      run(args.dryRun, 'ssh', [
        SSH_HOST,
        `cloudlinux-selector set --interpreter nodejs --app-root ${remoteAppRoot} --app-mode ${appMode} --json`,
      ]);
    }
    return { appRoot: remoteAppRoot, domain: existing.app.domain, startupFile: existing.app.startup_file };
  }

  const previous = entries[0];
  if (!previous) {
    const nodeVersion = queryLatestSelectorNodeVersion();
    const envVarsJson = JSON.stringify(lwsEnv);
    prepareStableAppRoot(args);
    run(args.dryRun, 'ssh', [
      SSH_HOST,
      `cloudlinux-selector create --interpreter nodejs --app-root ${remoteAppRoot} --domain ${apiDomain} ` +
        `--app-uri '/' --version ${nodeVersion} --app-mode ${appMode} --startup-file server.js --env-vars '${envVarsJson}' --json`,
    ]);
    return { appRoot: remoteAppRoot, domain: apiDomain, startupFile: 'server.js' };
  }

  console.log(`[deploy] migrating stable Node.js App root: ${previous.appRoot} -> ${remoteAppRoot}`);
  // Move the existing selector registration instead of destroying and
  // recreating it. LWS rejects `create current` while `current` resolves
  // inside the old vX.Y.Z registration, whereas `set --new-app-root` changes
  // that registration to the literal stable `current` path.
  prepareStableAppRoot(args);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `cloudlinux-selector set --interpreter nodejs --app-root ${previous.appRoot} --new-app-root ${remoteAppRoot} ` +
      `--app-mode ${appMode} --env-vars '${JSON.stringify(lwsEnv)}' --json`,
  ]);
  return { appRoot: remoteAppRoot, domain: previous.app.domain, startupFile: previous.app.startup_file };
}

/** Stop the active API before either release pointer moves. This gives a
 * deliberate short outage instead of serving a new front against an old API.
 * After a wipe the selector may still list the app while `current` is a
 * dangling symlink — treat "no such / broken app-root" as already stopped. */
function stopActiveBackApp(args: Args): void {
  const entries = selectorEntriesForMode(args.mode as RemoteMode);
  if (entries.length === 0) {
    console.log(`[deploy] no existing ${args.mode} Node.js App — first deploy will create it after upload.`);
    return;
  }
  for (const entry of entries) {
    console.log(`[deploy] stopping active Node.js App at ${entry.appRoot} before release upload.`);
    const stop =
      `out=$(cloudlinux-selector stop --interpreter nodejs --app-root ${entry.appRoot} --json 2>&1); status=$?; ` +
      `printf '%s\\n' "$out"; ` +
      `if [ "$status" -eq 0 ]; then exit 0; fi; ` +
      `case "$out" in ` +
      `*"No such application"*|*"Unable to find app-root"*|*"it's broken"*) ` +
      `echo "[deploy] app root missing or broken — treating as already stopped"; exit 0;; ` +
      `esac; ` +
      `exit "$status"`;
    run(args.dryRun, 'ssh', [SSH_HOST, stop]);
  }
}

/** `cloudlinux-selector set --env-vars` rewrites the API subdomain's
 * `.htaccess` on this host. Its output retains the Litespeed SetEnv block but
 * can omit the Passenger block, leaving the Node process running yet making
 * every public API request fall through to Apache. Restore that generated
 * routing block after every selector update, without touching the generated
 * environment section. */
function ensurePassengerRouting(args: Args, appRoot: string, startupFile: string): void {
  const documentRoot = args.mode === 'prod' ? 'public_html/api' : 'public_html/preprod-api';
  const command = [
    `htaccess="$HOME/${documentRoot}/.htaccess"`,
    `node_bin=$(for node in "$HOME"/nodevenv/${appRoot}/*/bin/node; do [ -x "$node" ] && { printf '%s' "$node"; break; }; done)`,
    '[ -n "$node_bin" ] || exit 1',
    // One element, not several: these are joined with '; ', and a `then` with
    // a semicolon after it is a bash syntax error.
    `if ! grep -q 'CLOUDLINUX PASSENGER CONFIGURATION BEGIN' "$htaccess"; then ` +
      `tmp=$(mktemp); ` +
      `{ printf '%s\\n' '# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN' ` +
      `'PassengerAppRoot "/home/${REMOTE_USER}/${appRoot}"' 'PassengerBaseURI "/"'; ` +
      `printf 'PassengerNodejs "%s"\\n' "$node_bin"; ` +
      `printf '%s\\n' 'PassengerAppType node' 'PassengerStartupFile ${startupFile}' ` +
      `'# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END'; cat "$htaccess"; } > "$tmp"; ` +
      `mv "$tmp" "$htaccess"; ` +
      `fi`,
    // The block above can be present and complete while the vhost still serves
    // 404 for every request: `cloudlinux-selector restart` rewrites this file
    // and drops the enable directive, which leaves the Node process registered
    // but nothing routed to it. Apache takes the last occurrence, so appending
    // also overrides an inherited `PassengerEnabled off`.
    `if ! grep -qE '^[[:space:]]*PassengerEnabled[[:space:]]+on[[:space:]]*$' "$htaccess"; then printf '%s\\n' 'PassengerEnabled on' >> "$htaccess"; fi`,
    ...directNodeCommands(args),
    'chmod 644 "$htaccess"',
  ].join('; ');
  run(args.dryRun, 'ssh', [SSH_HOST, command]);
}

const DIRECT_NODE_BEGIN = '# BEGIN TUCHO DIRECT NODE, managed by scripts/deploy.ts';
const DIRECT_NODE_END = '# END TUCHO DIRECT NODE';

/**
 * Shell steps (run inside ensurePassengerRouting's command, which has set
 * `$htaccess` and `$node_bin`) that make Passenger start the real Node
 * binary instead of CloudLinux's `node_wrapper`.
 *
 * Why: the selector points `PassengerNodejs` at
 * `~/nodevenv/<app>/<major>/bin/node`, a symlink to a bash wrapper that runs
 * a Python script on every process start only to export the app's env-vars.
 * Measured on the LWS host (2026-10-06): 1.09s to start Node through it,
 * 0.26s without. Passenger on that host stops an idle app after a few
 * seconds, so that cost landed on almost every visitor.
 *
 * The block is appended after the selector's own, so its `PassengerNodejs`
 * wins, and it re-exports leftover process env (`APP_TARGET`, optional
 * `PORT`) with `SetEnv` (the selector's own `SetEnv` block only applies
 * under LiteSpeed). Rewritten on
 * every call, so it follows a Node major change and survives the selector
 * rewriting the file; if the real binary is missing, no block is written and
 * the wrapper keeps working as before.
 */
function directNodeCommands(args: Args): string[] {
  const lwsEnv = leftoverProcessEnv(args.mode);
  const setEnvLines = Object.entries(lwsEnv).map(([key, value]) => {
    // Interpolated into a remote shell command and an Apache directive:
    // anything but a plain token is refused rather than quoted.
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !/^[A-Za-z0-9_.:/-]+$/.test(value)) {
      throw new Error(`leftover process env ${key} is not a plain KEY=token pair`);
    }
    return `SetEnv ${key} ${value}`;
  });
  const quote = (line: string) => `'${line}'`;
  return [
    `sed -i '/^${DIRECT_NODE_BEGIN.replace(/[/.]/g, '\\$&')}$/,/^${DIRECT_NODE_END}$/d' "$htaccess"`,
    `node_major=$(basename "$(dirname "$(dirname "$node_bin")")")`,
    'real_node="/opt/alt/alt-nodejs${node_major}/root/usr/bin/node"',
    `if [ -x "$real_node" ]; then ` +
      `[ -z "$(tail -c1 "$htaccess")" ] || printf '\\n' >> "$htaccess"; ` +
      `{ printf '%s\\n' ${quote(DIRECT_NODE_BEGIN)} ` +
      `'# Real node binary, not CloudLinux node_wrapper (~0.8s per cold start); see deploy.ts.'; ` +
      `printf 'PassengerNodejs "%s"\\n' "$real_node"; ` +
      `printf '%s\\n' ${setEnvLines.map(quote).join(' ')} ${quote(DIRECT_NODE_END)}; } >> "$htaccess"; ` +
      `fi`,
  ];
}

function uploadFront(args: Args): void {
  const version = effectiveVersion(args, readRootPackageVersion());
  const versionDir = join(frontRoot, 'dist', `v${version}`);
  const htaccess = join(frontRoot, 'dist', '.htaccess');
  const rootHtaccess = join(frontRoot, 'dist', 'root.htaccess');
  const wellKnown = join(frontRoot, 'dist', '.well-known');
  const productSitemapRelay = join(frontRoot, 'dist', 'sitemap-products.php');

  requireExists(args.dryRun, versionDir, `front dist/v${version}`);
  requireExists(args.dryRun, htaccess, 'front dist/.htaccess');
  if (args.mode === 'prod')
    requireExists(args.dryRun, productSitemapRelay, 'front dist/sitemap-products.php');
  if (args.mode === 'prod') requireExists(args.dryRun, rootHtaccess, 'front dist/root.htaccess');

  const remoteDir = `public_html/${args.mode}`;
  run(args.dryRun, 'ssh', [SSH_HOST, `mkdir -p ${remoteDir}`]);
  run(args.dryRun, 'rsync', ['-aci', '--delete', `${versionDir}/`, `${SSH_HOST}:${remoteDir}/v${version}/`]);
  if (args.mode === 'prod') {
    run(args.dryRun, 'rsync', ['-a', productSitemapRelay, `${SSH_HOST}:public_html/sitemap-products.php`]);
  }
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `ln -sfn v${version} ${remoteDir}/.current.next && mv -Tf ${remoteDir}/.current.next ${remoteDir}/current`,
  ]);
  run(args.dryRun, 'rsync', ['-a', htaccess, `${SSH_HOST}:${remoteDir}/.htaccess`]);
  // Apple Pay domain association: stable sibling of current/media, not
  // versioned. Only uploaded when the build hoisted public/.well-known
  // (see version-dist.mjs) — missing file is fine until Stripe's download
  // is dropped into public/.well-known/.
  if (existsSync(wellKnown)) {
    run(args.dryRun, 'rsync', ['-aci', '--delete', `${wellKnown}/`, `${SSH_HOST}:${remoteDir}/.well-known/`]);
  }
  // Cleanup: the removed device-token/same-origin-proxy architecture left
  // these two files behind on preprod from earlier deploys. Harmless to
  // remove even when they were never uploaded.
  if (args.mode === 'preprod') {
    run(args.dryRun, 'ssh', [
      SSH_HOST,
      `rm -f ${remoteDir}/preprod-enroll.html ${remoteDir}/__api-proxy.php`,
    ]);
  }
  if (args.mode === 'prod') {
    run(args.dryRun, 'rsync', ['-a', rootHtaccess, `${SSH_HOST}:public_html/.htaccess`]);
  }
}

/** The operational crons own regular, stable files in ~/bin. Production
 * deploys refresh them with the active release path and replace the marked
 * crontab line atomically. Preprod never installs or uploads them. */
function installProductionCron(
  args: Args,
  remoteDir: string,
  opts: {
    enabledEnv: string;
    localHandler: string;
    stableScript: string;
    marker: string;
    cronExpr: string;
    legacyStableScript?: string;
    legacyMarker?: string;
  },
): void {
  if (args.mode !== 'prod') return;
  const enabled = true;
  const cronLine = `${opts.cronExpr} $HOME/${opts.stableScript} ${opts.marker}`;
  const grepExclude = [opts.marker, opts.legacyMarker]
    .filter(Boolean)
    .map((marker) => `grep -Fv '${marker}'`)
    .join(' | ');

  if (!enabled) {
    console.log(
      `[deploy] ${opts.enabledEnv} is not true — removing the production ${opts.stableScript} cron entry.`,
    );
    run(args.dryRun, 'ssh', [
      SSH_HOST,
      `${opts.legacyStableScript ? `rm -f ${opts.legacyStableScript}; ` : ''}tmp=$(mktemp) && (crontab -l 2>/dev/null || true) | ${grepExclude} > "$tmp"; ` +
        `crontab "$tmp"; status=$?; rm -f "$tmp"; exit $status`,
    ]);
    return;
  }

  const releaseDir = `/home/${REMOTE_USER}/${remoteDir}`;
  console.log(`[deploy] installing production cron ${opts.stableScript} (${opts.cronExpr})`);
  run(args.dryRun, 'ssh', [SSH_HOST, 'mkdir -p bin private_file/cron']);
  run(args.dryRun, 'rsync', ['-aci', opts.localHandler, `${SSH_HOST}:${opts.stableScript}`]);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `sed -i 's|__TUCHO_RELEASE_DIR__|${releaseDir}|g' ${opts.stableScript} && chmod 755 ${opts.stableScript}`,
  ]);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `${opts.legacyStableScript ? `rm -f ${opts.legacyStableScript}; ` : ''}tmp=$(mktemp) && (crontab -l 2>/dev/null || true) | ${grepExclude} > "$tmp"; ` +
      `printf '%s\\n' '${cronLine}' >> "$tmp" && crontab "$tmp"; status=$?; rm -f "$tmp"; exit $status`,
  ]);
}

function installProductionCrons(args: Args, remoteDir: string): void {
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_SHIPMENT',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-shipment-tracking.sh'),
    stableScript: 'bin/main-cron-shipment-tracking.sh',
    marker: '# main-cron-shipment-tracking-prod',
    cronExpr: '17 * * * *',
    legacyStableScript: 'bin/tuucho-shipment-tracking.sh',
    legacyMarker: '# tuucho-shipment-tracking-prod',
  });
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_ACCOUNT_DELETION',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-account-deletion.sh'),
    stableScript: 'bin/main-cron-account-deletion.sh',
    marker: '# main-cron-account-deletion-prod',
    cronExpr: '17 4 * * *',
  });
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_GUEST_SAVED_CLEANUP',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-guest-saved-cleanup.sh'),
    stableScript: 'bin/main-cron-guest-saved-cleanup.sh',
    marker: '# main-cron-guest-saved-cleanup-prod',
    cronExpr: '17 5 * * *',
    legacyStableScript: 'bin/main-cron-guest-saved-checkout.sh',
    legacyMarker: '# main-cron-guest-saved-checkout-prod',
  });
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_LOYALTY',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-loyalty.sh'),
    stableScript: 'bin/main-cron-loyalty.sh',
    marker: '# main-cron-loyalty-prod',
    cronExpr: '17 6 * * *',
  });
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_GIFT',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-gift.sh'),
    stableScript: 'bin/main-cron-gift.sh',
    marker: '# main-cron-gift-prod',
    cronExpr: '17 7 * * *',
  });
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_GIFT_PURGE',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-gift-purge.sh'),
    stableScript: 'bin/main-cron-gift-purge.sh',
    marker: '# main-cron-gift-purge-prod',
    cronExpr: '17 8 * * *',
  });
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_PAYMENT_AUTH_EXPIRY',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-payment-auth-expiry.sh'),
    stableScript: 'bin/main-cron-payment-auth-expiry.sh',
    marker: '# main-cron-payment-auth-expiry-prod',
    cronExpr: '17 9 * * *',
  });
  // Every minute, each run pinging /healthz every 5s until the next one
  // starts: keep-warm, plus the liveness check that alerts and attempts a
  // Passenger restore when /healthz fails. See tuucho/docs/cron/README.md.
  installProductionCron(args, remoteDir, {
    enabledEnv: 'ENABLED_CRON_WARM',
    localHandler: join(backRoot, 'operation', 'cron', 'main-cron-warm.sh'),
    stableScript: 'bin/main-cron-warm.sh',
    marker: '# main-cron-warm-prod',
    cronExpr: '* * * * *',
  });
}

function uploadBack(args: Args): void {
  const version = effectiveVersion(args, readRootPackageVersion());
  const versionDir = join(backRoot, 'dist', `v${version}`);
  requireExists(args.dryRun, versionDir, `back dist/v${version}`);
  const versionedPipe = join(versionDir, 'pipe', 'pipe-program-chat-handler.sh');
  const versionedProductRequestPipe = join(versionDir, 'pipe', 'pipe-program-product-request-handler.sh');
  const contactDispatcher = join(versionDir, 'pipe', 'pipe-contact-dispatcher.sh');
  const mainContactDispatcher = join(versionDir, 'pipe', 'main-pipe-contact-dispatcher.sh');
  const productionShipmentTrackingCron = join(
    backRoot,
    'operation',
    'cron',
    'main-cron-shipment-tracking.sh',
  );
  const productionAccountDeletionCron = join(backRoot, 'operation', 'cron', 'main-cron-account-deletion.sh');
  const productionGuestSavedCleanupCron = join(
    backRoot,
    'operation',
    'cron',
    'main-cron-guest-saved-cleanup.sh',
  );
  const productionLoyaltyCron = join(backRoot, 'operation', 'cron', 'main-cron-loyalty.sh');
  const productionGiftCron = join(backRoot, 'operation', 'cron', 'main-cron-gift.sh');
  const productionGiftPurgeCron = join(backRoot, 'operation', 'cron', 'main-cron-gift-purge.sh');
  const productionPaymentAuthExpiryCron = join(
    backRoot,
    'operation',
    'cron',
    'main-cron-payment-auth-expiry.sh',
  );
  const productionWarmCron = join(backRoot, 'operation', 'cron', 'main-cron-warm.sh');
  requireExists(args.dryRun, versionedPipe, 'versioned chat pipe handler');
  requireExists(args.dryRun, versionedProductRequestPipe, 'versioned product-request pipe handler');
  requireExists(args.dryRun, contactDispatcher, 'versioned contact pipe dispatcher');
  requireExists(args.dryRun, mainContactDispatcher, 'main contact pipe dispatcher');
  if (args.mode === 'prod') {
    requireExists(args.dryRun, productionShipmentTrackingCron, 'production shipment-tracking main cron');
    requireExists(args.dryRun, productionAccountDeletionCron, 'production account-deletion main cron');
    requireExists(args.dryRun, productionGuestSavedCleanupCron, 'production guest-saved-cleanup main cron');
    requireExists(args.dryRun, productionLoyaltyCron, 'production loyalty main cron');
    requireExists(args.dryRun, productionGiftCron, 'production gift main cron');
    requireExists(args.dryRun, productionGiftPurgeCron, 'production gift-purge main cron');
    requireExists(
      args.dryRun,
      productionPaymentAuthExpiryCron,
      'production payment-auth-expiry-spy main cron',
    );
    requireExists(args.dryRun, productionWarmCron, 'production keep-warm main cron');
  }

  const remoteDir = `private_html/${args.mode}/current`;
  const releaseDir = `private_html/${args.mode}/v${version}`;
  run(args.dryRun, 'ssh', [SSH_HOST, `mkdir -p ${releaseDir}`]);
  // -c: compare by content checksum, not size+mtime. build() wipes dist/ and
  // rebuilds every run, so every file carries a fresh mtime and a plain -a
  // would re-upload the whole tree even when nothing actually changed.
  // -i: itemize, so the log shows exactly what was added/updated/deleted.
  // --delete prunes remote files that no longer exist locally; the excluded
  // paths below are protected from that too (rsync only deletes excluded
  // entries with --delete-excluded, which is deliberately not passed), so
  // node_modules/public/tmp are never touched.
  run(args.dryRun, 'rsync', [
    '-aci',
    '--delete',
    '--exclude=/node_modules',
    '--exclude=/public',
    '--exclude=/tmp',
    `${versionDir}/`,
    `${SSH_HOST}:${releaseDir}/`,
  ]);
  const { domain, startupFile } = ensureBackApp(args, version);
  activateBackRelease(args, version);
  ensureBackVenvReleaseAlias(args, version);
  ensurePassengerRouting(args, remoteDir, startupFile);
  run(args.dryRun, 'ssh', [SSH_HOST, 'mkdir -p bin']);
  // cPanel's mailbox pipe points only to this stable entry point. Every other
  // executable pipe remains inside private_html/<mode>/vX.Y.Z/.
  run(args.dryRun, 'rsync', [
    '-aci',
    mainContactDispatcher,
    `${SSH_HOST}:bin/main-pipe-contact-dispatcher.sh`,
  ]);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `rm -f bin/pipe-contact-dispatcher.sh bin/tuucho-contact-preprod.env bin/tuucho-contact-prod.env && chmod 755 ${remoteDir}/pipe/pipe-contact-dispatcher.sh ${remoteDir}/pipe/pipe-program-chat-handler.sh ${remoteDir}/pipe/pipe-program-product-request-handler.sh bin/main-pipe-contact-dispatcher.sh`,
  ]);
  if (args.npmInstall) {
    // The nodevenv path's middle segment is the Node major version cPanel
    // provisioned for this exact app-root folder (e.g. 24) — glob it
    // instead of hardcoding, since it isn't guaranteed identical forever.
    const nodevenvGlob = `\${HOME}/nodevenv/${remoteDir}/*/bin/npm`;
    run(args.dryRun, 'ssh', [SSH_HOST, `cd ${remoteDir} && ${nodevenvGlob} install`]);
  }
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `cloudlinux-selector restart --interpreter nodejs --app-root ${remoteDir} --json`,
  ]);
  // Deliberately after the restart as well as before it: the restart itself is
  // what rewrites the subdomain's .htaccess and drops `PassengerEnabled on`,
  // and a check that ran only beforehand cannot see that.
  ensurePassengerRouting(args, remoteDir, startupFile);
  if (args.dryRun) {
    console.log(`[deploy] (dry-run) would poll https://${domain}/healthz until healthy before continuing`);
  } else {
    waitUntilHealthy(domain);
  }
  if (!args.dryRun && args.transport === 'ftp' && isRemoteMode(args.mode)) {
    waitUntilFtpGatewayReady(args.mode);
  }
  installProductionCrons(args, remoteDir);
}

function prepareRemoteOpsServerAfterBackUpload(args: Args): void {
  if (args.dryRun || args.transport !== 'ftp' || !args.targets.includes('back')) return;
  const target = loadGatewayTarget(backRoot, args.mode as RemoteMode);
  console.log('[deploy] FTP: restarting loopback opsServer so migrate uses this release');
  stopRemoteOpsServer(target);
  try {
    startRemoteOpsServer(target);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function applyDatabaseOps(args: Args): void {
  // Hand the transport down: a nested ops command must not quietly reopen an
  // SSH tunnel when the operator asked for --ftp because SSH is unreachable.
  const transport = transportFlags(args.transport);
  if (args.reset) {
    run(
      args.dryRun,
      'npm',
      ['run', 'operation', '--', 'database-reset-and-seed', '--confirm', ...transport, `--${args.mode}`],
      { cwd: backRoot },
    );
  } else if (args.databaseMigrate) {
    run(
      args.dryRun,
      'npm',
      ['run', 'operation', '--', 'database-migrate', '--confirm', ...transport, `--${args.mode}`],
      { cwd: backRoot },
    );
  }
  // Additive on top of whatever ran above (plain migrate, or reset -> migrate
  // -> seed) — layers demo accounts/carts/orders in. parseArgs already
  // blocks --faker with --prod, so args.mode here is always dev/preprod.
  if (args.faker) {
    run(args.dryRun, 'npm', ['run', 'faker', '--', 'seed', ...transport, `--${args.mode}`], {
      cwd: backRoot,
    });
  }
}

function rollback(args: Args): void {
  const mode = args.mode as RemoteMode;
  const version = args.rollback as string;
  const entries = querySelectorEntries();
  const appRoot = `private_html/${mode}/current`;
  const app = entries.find((entry) => entry.appRoot === appRoot);
  if (!app) fail(`rollback requires the stable Node.js App at ${appRoot}; run one normal deploy first`);
  const frontRoot = `public_html/${mode}`;
  const backRoot = `private_html/${mode}`;
  run(args.dryRun, 'ssh', [SSH_HOST, `[ -d ${frontRoot}/v${version} ] && [ -d ${backRoot}/v${version} ]`]);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `ln -sfn v${version} ${frontRoot}/.current.next && mv -Tf ${frontRoot}/.current.next ${frontRoot}/current && ln -sfn v${version} ${backRoot}/.current.next && mv -Tf ${backRoot}/.current.next ${backRoot}/current`,
  ]);
  run(args.dryRun, 'ssh', [
    SSH_HOST,
    `cloudlinux-selector restart --interpreter nodejs --app-root ${appRoot} --json`,
  ]);
  if (!args.dryRun) waitUntilHealthy(app.app.domain);
}

/** Best-effort journal line at the end of a deploy attempt. Runs before
 * prod's default `--ftp-ops-remove` so the gateway is still reachable. */
async function journalDeployFinish(
  args: Args,
  outcome: 'success' | 'failure',
): Promise<void> {
  const version = effectiveVersion(args, readRootPackageVersion());
  const payload = {
    category: 'deploy' as const,
    action: 'deploy.finish',
    summary:
      outcome === 'success'
        ? `Deploy ${args.mode} v${version}: succes`
        : `Deploy ${args.mode} v${version}: echec`,
    outcome,
    detail: {
      version,
      mode: args.mode,
      migrate: args.databaseMigrate,
      reset: args.reset,
      dryRun: args.dryRun,
      transport: args.transport ?? null,
      faker: args.faker,
      rollback: args.rollback,
      maintenance: args.maintenance,
    },
  };
  if (args.dryRun) {
    console.log('[deploy] (dry-run) would journal deploy.finish', payload);
    return;
  }
  try {
    const { opsRequestHeaders } = await import('./opsHeaders.js');
    const { postOperatorActivity } = await import('./postOperatorActivity.js');
    if (args.mode === 'dev') {
      await postOperatorActivity(backRoot, args.mode, payload);
      return;
    }
    if (args.transport === 'ftp') {
      const gatewayUrl = (
        process.env.PAM_OPS_GATEWAY_URL ?? loadPublicEnv(backRoot, args.mode).OPS_GATEWAY_URL
      )?.replace(/\/+$/, '');
      const token = opsToken(args.mode);
      if (!gatewayUrl || !token) {
        console.error('[activity] journal skipped: missing ops gateway or token');
        return;
      }
      const res = await fetch(`${gatewayUrl}/operation/activity`, {
        method: 'POST',
        headers: opsRequestHeaders(token, args.mode, { 'content-type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[activity] journal write failed: ${res.status} ${body}`);
      }
      return;
    }
    const {
      closeOpsSshTunnel,
      freeLocalPort,
      OPS_READY_TIMEOUT_REMOTE_MS,
      spawnOpsSshTunnel,
      waitForOpsReady,
    } = await import('./opsTunnel.js');
    const port = await freeLocalPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawnOpsSshTunnel(args.mode, port);
    try {
      await waitForOpsReady(baseUrl, child, OPS_READY_TIMEOUT_REMOTE_MS);
      process.env.PAM_OPS_API_BASE_URL = baseUrl;
      process.env.PAM_OPS_TOKEN = opsToken(args.mode);
      await postOperatorActivity(backRoot, args.mode, payload);
    } finally {
      closeOpsSshTunnel(child);
      delete process.env.PAM_OPS_API_BASE_URL;
    }
  } catch (error) {
    console.error(
      `[activity] journal write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function runDeploy(args: Args): { removeFtpOpsAtEnd: boolean } {
  console.log(
    `[deploy] transport=${args.transport ?? 'local'} mode=${args.mode} target=${args.targets.join(',')} ` +
      `npmInstall=${args.npmInstall} databaseMigrate=${args.databaseMigrate} reset=${args.reset} faker=${args.faker} ` +
      `noRouteAdminToken=${args.noRouteAdminToken} routeAdminToken=${args.routeAdminToken ?? 'auto'} patch=${args.patch ?? 'none'} rollback=${args.rollback ?? 'none'} dryRun=${args.dryRun} ` +
      `maintenance=${args.maintenance} maintenancePrepare=${args.maintenancePrepare}`,
  );
  if (args.patch) {
    console.log(
      `[deploy] --patch ${args.patch}: building current source as v${args.patch} instead of the root ` +
        'package.json version — neither package.json is modified. This overwrites whatever is currently live at ' +
        'that release and then switches current to it.',
    );
  }

  if (!isRemoteMode(args.mode)) {
    console.log('[deploy] local --dev: skipping build/upload.');
    withLocalApi(args.dryRun, () => applyDatabaseOps(args));
    console.log(`[deploy] done${args.dryRun ? ' (dry-run, nothing was executed)' : ''}.`);
    return { removeFtpOpsAtEnd: false };
  }

  // Every remote path from here on runs shell on the host. Resolve the
  // transport before the first build so an unreachable gateway costs seconds,
  // not the several minutes of a front+back build.
  try {
    requireTransport(args.transport, args.mode);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  // Standalone: install or remove only the FTP ops support, nothing else.
  if (
    args.ftpOps &&
    args.targets.length === 2 &&
    !args.maintenance &&
    !args.rollback &&
    !args.maintenancePrepare
  ) {
    installFtpOps(args);
    console.log(`[deploy] done${args.dryRun ? ' (dry-run, nothing was executed)' : ''}.`);
    return { removeFtpOpsAtEnd: false };
  }
  if (args.ftpOpsRemove) {
    removeFtpOps(args);
    console.log(`[deploy] done${args.dryRun ? ' (dry-run, nothing was executed)' : ''}.`);
    return { removeFtpOpsAtEnd: false };
  }

  if (args.transport === 'ftp') bootstrapFtpGateway(args);

  if (args.maintenance) {
    runMaintenanceLockdown(args);
    return { removeFtpOpsAtEnd: false };
  }
  if (args.rollback) {
    rollback(args);
    console.log(`[deploy] rolled back ${args.mode} front and back to v${args.rollback}.`);
    return { removeFtpOpsAtEnd: false };
  }

  // Admin is a front-end route only. Each front deploy gets a fresh route
  // segment unless explicitly disabled or supplied by the operator.
  const adminRouteToken =
    args.targets.includes('front') && !args.noRouteAdminToken
      ? (args.routeAdminToken ?? generateRouteToken())
      : null;
  if (args.noRouteAdminToken) {
    console.log('[deploy] --no-route-admin-token: admin remains at /admin');
  }

  if (args.targets.includes('front')) {
    const frontExtra = [...maintenancePrepareBuildArgs(args), ...patchVersionBuildArgs(args)];
    build(args.dryRun, frontRoot, args.mode, adminRouteToken, frontExtra);
  }
  if (args.targets.includes('back'))
    build(args.dryRun, backRoot, args.mode, null, patchVersionBuildArgs(args));

  // Stop before the front or back `current` link moves: a brief controlled
  // outage is safer than serving mismatched releases.
  if (args.targets.includes('back')) stopActiveBackApp(args);
  if (args.targets.includes('front')) uploadFront(args);
  if (args.targets.includes('back')) uploadBack(args);

  prepareRemoteOpsServerAfterBackUpload(args);
  applyDatabaseOps(args);

  if (adminRouteToken) {
    const siteUrl = args.mode === 'preprod' ? 'https://preprod.shop.example' : 'https://shop.example';
    console.log(`[deploy] admin access: ${siteUrl}/${adminRouteToken}/admin`);
  }
  console.log(`[deploy] done${args.dryRun ? ' (dry-run, nothing was executed)' : ''}.`);
  // Production does not keep a standing shell endpoint. Deferred until after
  // the journal write so `/operation/activity` can still reach the gateway.
  return { removeFtpOpsAtEnd: args.mode === 'prod' && !args.ftpOps };
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof DeployAbortError)) {
      console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
  activeArgs = args;

  let outcome: 'success' | 'failure' = 'success';
  let removeFtpOpsAtEnd = false;
  try {
    ({ removeFtpOpsAtEnd } = runDeploy(args));
  } catch (error) {
    outcome = 'failure';
    if (!(error instanceof DeployAbortError)) {
      console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }

  await journalDeployFinish(args, outcome);

  if (removeFtpOpsAtEnd) removeFtpOps(args, { quiet: true });
  if (process.exitCode) process.exit(process.exitCode);
}

void main();
