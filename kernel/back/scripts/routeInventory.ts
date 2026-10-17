/**
 * The one machine-checked map of every HTTP route this service exposes.
 *
 * Routes are read from the real composed Express app, not from a regex over
 * router files: `createApp()` and `mountOpsRoutes()` are mounted in-process
 * (no port, no database) and the router stack is walked, so a path here is
 * the path a request actually reaches. Express 5 keeps no original path
 * string on a Layer, so `Router.prototype.use`/`route` are wrapped before
 * express is imported to record each mount segment as it is registered.
 *
 * `--write` regenerates `docs/api/routes.json`. `--check` (used by
 * `npm run check:routes`) fails when that file is stale, when a live route is
 * undocumented in `docs/api/`, or when `docs/api/` names a route that no
 * longer exists.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

process.env.APP_TARGET ??= 'dev';

const root = resolve('.');
const inventoryPath = resolve(root, 'docs/api/routes.json');
const apiDocsRoot = resolve(root, 'docs/api');

const express = (await import('express')).default;

type Layer = {
  name: string;
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
  handle?: { stack?: Layer[] };
  __mount?: string;
  __source?: string;
};

const routerPrototype = (express as unknown as { Router: { prototype: Record<string, unknown> } }).Router
  .prototype;
const originalUse = routerPrototype.use as (...args: unknown[]) => unknown;
const originalRoute = routerPrototype.route as (...args: unknown[]) => unknown;

/** The `.router.ts` file that registered a route, recovered from the call
 * site. It answers "which file owns this endpoint" without a search. */
function callerFile(): string | undefined {
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n').slice(2)) {
    const match = /\(?(\/[^\s()]+\.ts)[:)]/.exec(line);
    if (!match) continue;
    const path = match[1];
    if (path.includes('/node_modules/')) continue;
    if (path.endsWith('/scripts/routeInventory.ts')) continue;
    return relative(root, path);
  }
  return undefined;
}

function tagNewLayers(stack: Layer[], from: number, mount: string, source?: string): void {
  for (let index = from; index < stack.length; index += 1) {
    stack[index].__mount = mount;
    if (source) stack[index].__source = source;
  }
}

routerPrototype.use = function patchedUse(this: { stack: Layer[] }, ...args: unknown[]) {
  const before = this.stack.length;
  const result = originalUse.apply(this, args);
  const mount = typeof args[0] === 'string' ? args[0] : '';
  tagNewLayers(this.stack, before, mount);
  return result;
};

routerPrototype.route = function patchedRoute(this: { stack: Layer[] }, path: unknown) {
  const result = originalRoute.call(this, path);
  tagNewLayers(this.stack, this.stack.length - 1, typeof path === 'string' ? path : '', callerFile());
  return result;
};

export type RouteEntry = {
  method: string;
  path: string;
  source?: string;
  middleware: string[];
};

const ignoredMiddleware = new Set(['<anonymous>', 'router', 'handle', 'bound dispatch', 'jsonParser']);

type Guard = { prefix: string; name: string };

/** Collects the routes in one router's stack.
 *
 * A guard is remembered with the absolute prefix it was mounted at, because
 * Express registers `use('/account', cors, json, accountRouter)` as three
 * sibling layers rather than as a parent of the router: `cors` guards
 * `/account/*` but is not in the router's own stack. A route then inherits
 * exactly the guards whose prefix it sits under, which keeps `requireAdmin`
 * off a sibling router and `serveStatic` off everything outside `/media`.
 *
 * A bare `use(fn)` still applies only to what is registered after it in the
 * same stack, so the running list is local here and copied, never shared, when
 * recursing into a child.
 */
function walk(stack: Layer[], prefix: string, inherited: readonly Guard[], out: RouteEntry[]): void {
  let guards: Guard[] = [...inherited];
  for (const layer of stack) {
    const mount = layer.__mount ?? '';
    if (layer.route) {
      const path = normalizePath(prefix + (layer.route.path === '/' ? '' : layer.route.path));
      const applicable = guards
        .filter(
          (guard) => guard.prefix === '' || path === guard.prefix || path.startsWith(`${guard.prefix}/`),
        )
        .map((guard) => guard.name);
      const routeChain = [
        ...applicable,
        ...layer.route.stack.map((entry) => entry.name).filter((name) => !ignoredMiddleware.has(name)),
      ];
      for (const method of Object.keys(layer.route.methods)) {
        out.push({
          method: method.toUpperCase(),
          path,
          source: layer.__source,
          middleware: [...new Set(routeChain)],
        });
      }
      continue;
    }
    if (layer.handle?.stack) {
      walk(layer.handle.stack, prefix + mount, guards, out);
      continue;
    }
    if (!ignoredMiddleware.has(layer.name)) {
      guards = [...guards, { prefix: normalizePath(prefix + mount).replace(/^\/$/, ''), name: layer.name }];
    }
  }
}

function normalizePath(path: string): string {
  const collapsed = path.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed === '' ? '/' : collapsed;
}

function sortRoutes(routes: RouteEntry[]): RouteEntry[] {
  return [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

async function collect(): Promise<{ public: RouteEntry[]; ops: RouteEntry[] }> {
  const { createApp } = await import('../src/app.js');
  const { ensurePluginsLoaded } = await import('../src/modules/plugins/application/loadPluginRuntime.js');
  const { listHttpMounts } = await import('@tuucho/plugin-sdk');
  const publicRoutes: RouteEntry[] = [];
  walk((createApp() as unknown as { router: { stack: Layer[] } }).router.stack, '', [], publicRoutes);
  await ensurePluginsLoaded();
  for (const mount of listHttpMounts()) {
    const router = mount.router as { stack?: Layer[] } | undefined;
    if (!router?.stack) continue;
    const prefix =
      mount.scope === 'admin'
        ? `/admin${mount.path || ''}`
        : mount.scope === 'account'
          ? `/account${mount.path || ''}`
          : mount.path || '';
    const inherited: Guard[] =
      mount.scope === 'admin' || mount.scope === 'account' ? [{ prefix: '', name: 'requireAuth' }] : [];
    walk(router.stack, prefix, inherited, publicRoutes);
  }

  const { mountOpsRoutes } = await import('../src/opsRoutes.js');
  const { requireOpsToken } = await import('../src/opsAuth.js');
  const opsRouter = express.Router();
  // Mounted exactly as opsServer.ts does, so the recorded guard chain matches
  // what a request actually passes through on the loopback surface.
  opsRouter.use(requireOpsToken);
  mountOpsRoutes(opsRouter);
  const opsRoutes: RouteEntry[] = [];
  walk((opsRouter as unknown as { stack: Layer[] }).stack, '', [], opsRoutes);

  return { public: sortRoutes(publicRoutes), ops: sortRoutes(opsRoutes) };
}

async function walkDocs(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walkDocs(path);
      return extname(entry.name) === '.md' ? Promise.resolve([path]) : Promise.resolve([]);
    }),
  );
  return nested.flat();
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

type DocRoute = {
  key: string;
  /** True when the line spelled out method and absolute path. An entry
   * expanded from shorthand can only ever *add* coverage: it is never used to
   * claim documentation names a route that does not exist, because resolving
   * an ellipsis against the wrong heading would invent a path. */
  certain: boolean;
};

/** Expands one line of documentation into the routes it names.
 *
 * Docs deliberately compress sibling endpoints into a single heading, and both
 * shorthands are unambiguous in context, so the checker reads them rather than
 * forcing every heading to repeat itself:
 *
 *   `GET` / `PUT /gift/:token/destination`  a bare method binds to the first
 *                                            full path on the same line
 *   `GET /a/b/wallet` / `…/ledger`          an ellipsis means the previous
 *                                            path's parent prefix
 */
function routesInLine(line: string, anchor: { path?: string }): DocRoute[] {
  const tokens = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
  const found: DocRoute[] = [];
  const pendingMethods: string[] = [];
  let lastMethod: string | undefined;
  let lineAnchor: string | undefined;

  const clean = (raw: string): string => normalizePath(raw.split('?')[0].replace(/[.,;:]+$/, ''));
  const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/');

  for (const token of tokens) {
    const explicit = new RegExp(`^(${METHODS.join('|')})\\s+(\\S+)$`).exec(token);
    if (explicit) {
      const [, method, rawPath] = explicit;
      lastMethod = method;
      if (rawPath.startsWith('…/')) {
        const base = lineAnchor ?? anchor.path;
        if (base)
          found.push({ key: `${method} ${clean(`${parentOf(base)}/${rawPath.slice(2)}`)}`, certain: false });
        continue;
      }
      if (!rawPath.startsWith('/')) continue;
      const path = clean(rawPath);
      lineAnchor = path;
      anchor.path = path;
      found.push({ key: `${method} ${path}`, certain: true });
      while (pendingMethods.length > 0) found.push({ key: `${pendingMethods.pop()} ${path}`, certain: true });
      continue;
    }
    if ((METHODS as readonly string[]).includes(token)) {
      if (lineAnchor) found.push({ key: `${token} ${lineAnchor}`, certain: true });
      else pendingMethods.push(token);
      continue;
    }
    if (token.startsWith('…/')) {
      const base = lineAnchor ?? anchor.path;
      if (base && lastMethod) {
        found.push({ key: `${lastMethod} ${clean(`${parentOf(base)}/${token.slice(2)}`)}`, certain: false });
      }
    }
  }
  return found;
}

/** Every route named anywhere in docs/api. Headings are the common form but a
 * route documented inline in prose counts just as much. */
async function documentedRoutes(): Promise<{ all: Set<string>; certain: Set<string> }> {
  // The generated reference lists every route by construction, so counting it
  // would make this check pass trivially. What must be earned is a
  // hand-written explanation of the route's behaviour.
  const files = (await walkDocs(apiDocsRoot)).filter((path) => !path.endsWith('09-reference.md'));
  const sources = await Promise.all(files.map((path) => readFile(path, 'utf8')));
  const all = new Set<string>();
  const certain = new Set<string>();
  for (const source of sources) {
    // Prose wraps freely, so a `GET\n/account/chat/sessions` span is normal.
    // Collapse whitespace inside every backtick span first, otherwise a
    // wrapped reference reads as two unrelated fragments.
    const joined = source.replace(/`[^`]*`/g, (span) => span.replace(/\s+/g, ' '));
    const anchor: { path?: string } = {};
    for (const line of joined.split('\n')) {
      for (const route of routesInLine(line, anchor)) {
        all.add(route.key);
        if (route.certain) certain.add(route.key);
      }
    }
  }
  return { all, certain };
}

/** Middleware every route on a surface shares says nothing about a specific
 * route, so it is listed once for the surface and stripped from the entries.
 * What is left per route is what actually distinguishes it: its auth guard,
 * its body parser, its session requirement. */
function hoistSharedMiddleware(routes: RouteEntry[]): { shared: string[]; routes: RouteEntry[] } {
  if (routes.length === 0) return { shared: [], routes };
  const shared = routes[0].middleware.filter((name) =>
    routes.every((route) => route.middleware.includes(name)),
  );
  const sharedSet = new Set(shared);
  return {
    shared,
    routes: routes.map((route) => ({
      ...route,
      middleware: route.middleware.filter((name) => !sharedSet.has(name)),
    })),
  };
}

function serialize(inventory: { public: RouteEntry[]; ops: RouteEntry[] }): string {
  const publicSurface = hoistSharedMiddleware(inventory.public);
  const opsSurface = hoistSharedMiddleware(inventory.ops);
  return (
    JSON.stringify(
      {
        $comment:
          'Generated by `npm run sync:routes` from the real Express stack. Do not edit by hand. `npm run check:routes` fails when this drifts from the code or from docs/api/.',
        publicSurfaceMiddleware: publicSurface.shared,
        publicSurface: publicSurface.routes,
        opsSurfaceMiddleware: opsSurface.shared,
        opsSurface: opsSurface.routes,
      },
      null,
      2,
    ) + '\n'
  );
}

const mode = process.argv.includes('--check') ? 'check' : 'write';
const inventory = await collect();
const serialized = serialize(inventory);

if (mode === 'write') {
  await writeFile(inventoryPath, serialized);
  console.log(
    `route inventory written (${inventory.public.length} public, ${inventory.ops.length} ops routes).`,
  );
  process.exit(0);
}

const errors: string[] = [];

const committed = await readFile(inventoryPath, 'utf8').catch(() => '');
if (committed !== serialized) {
  errors.push('docs/api/routes.json is stale. Run `npm run sync:routes`.');
}

const documented = await documentedRoutes();
for (const route of [...inventory.public, ...inventory.ops]) {
  const key = `${route.method} ${route.path}`;
  if (!documented.all.has(key)) {
    errors.push(`${key} is served by ${route.source ?? 'an unknown file'} but absent from docs/api/.`);
  }
}

const live = new Set([...inventory.public, ...inventory.ops].map((route) => `${route.method} ${route.path}`));
for (const key of documented.certain) {
  // `/media` and `/ops-gateway` are Apache/PHP surfaces, not Express routes.
  if (key.includes('/media/') || key.includes('/ops-gateway')) continue;
  if (!live.has(key)) errors.push(`docs/api/ documents ${key}, which no route serves.`);
}

if (errors.length > 0) {
  console.error(`Route check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Route check passed (${inventory.public.length} public, ${inventory.ops.length} ops routes documented).`,
);

// Mounting the real app opens the pg pool and the rate-limiter timers, which
// keep the event loop alive even though nothing here ever queried. The two
// exits above are explicit for the same reason.
process.exit(0);
