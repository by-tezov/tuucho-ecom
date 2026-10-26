#!/usr/bin/env node
/**
 * Every backend endpoint this app calls must actually exist.
 *
 * `src/api/**` is the only place that names a URL, and the backend publishes
 * the routes it really serves in `tuucho/docs/api/routes.json`
 * (generated from its live Express stack, not from a regex). This walks every
 * request the client code makes and matches it against that inventory.
 *
 * It closes the worst cross-repo failure mode here: both repositories
 * typecheck green while the front calls a path the backend renamed or removed,
 * which is only discovered in the browser.
 *
 * Skipped when the sibling backend checkout is absent, so this repository still
 * builds standalone.
 */
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const apiRoot = resolve('src/api');
const inventoryPath = resolve('../../docs/api/routes.json');

let inventory;
try {
  inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
} catch {
  console.log('api contract check skipped: tuucho/docs/api/routes.json is not available.');
  process.exit(0);
}

/** The helpers that actually issue a request. Their first argument is the
 * path; an optional second argument carries `method`. */
const REQUEST_HELPERS = new Set(['request', 'requestJson', 'apiFetch', 'requestBlob', 'requestVoid']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return extname(entry.name) === '.ts' ? Promise.resolve([path]) : Promise.resolve([]);
    }),
  );
  return nested.flat();
}

/** Stands in for an interpolated expression while a path is being read. No
 * real URL contains it, so it survives to be interpreted below. */
const INTERP = '{{interp}}';

/** Renders a path argument with every interpolation replaced by the sentinel,
 * so an interpolated path segment (an address id) and an interpolated suffix
 * (a query string) can be told apart afterwards. */
function pathFromNode(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) out += INTERP + span.literal.text;
    return out;
  }
  return undefined;
}

function normalize(path) {
  const withoutQuery = path.split('?')[0];
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed || '/';
}

/** Turns a sentinel-bearing path into something matchable.
 *
 * A sentinel filling a whole segment is a path parameter. A sentinel glued to
 * static text is a query string or an opaque suffix, so the path is truncated
 * there and matched as far as it is actually known. */
function interpret(raw) {
  const segments = raw.split('/');
  const out = [];
  for (const segment of segments) {
    if (segment === INTERP) {
      out.push(':param');
      continue;
    }
    const at = segment.indexOf(INTERP);
    if (at >= 0) {
      const stem = segment.slice(0, at);
      if (stem) out.push(stem);
      return { path: normalize(out.join('/')), truncated: true };
    }
    out.push(segment);
  }
  return { path: normalize(out.join('/')), truncated: false };
}

function methodFromInit(node) {
  if (!node) return 'GET';
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) ? property.name.text : undefined;
    if (name !== 'method') continue;
    const value = property.initializer;
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      return value.text.toUpperCase();
    }
    return undefined;
  }
  return 'GET';
}

const routes = [...inventory.publicSurface, ...inventory.opsSurface].map((route) => ({
  method: route.method,
  segments: route.path.split('/'),
  path: route.path,
}));

/** A backend path parameter matches any single front segment. A truncated path
 * matches a route whose leading segments agree, which is all a query string or
 * an opaque suffix lets us prove. */
function matches(method, path, truncated) {
  const segments = path.split('/');
  return routes.some((route) => {
    if (route.method !== method) return false;
    if (truncated ? route.segments.length < segments.length : route.segments.length !== segments.length) {
      return false;
    }
    return segments.every(
      (segment, index) => route.segments[index].startsWith(':') || route.segments[index] === segment,
    );
  });
}

/** Some modules wrap the shared transport with a fixed base path: chat calls
 * its own request helper with '/sessions' and reaches '/account/chat/sessions'.
 * Learning each wrapper's prefix and which arguments carry the path and the
 * init object lets its call sites resolve to real URLs. */
function localWrappers(source) {
  const wrappers = new Map();
  const visit = (node) => {
    const isFunction =
      ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
    if (isFunction && node.body) {
      const name = ts.isFunctionDeclaration(node)
        ? node.name?.text
        : node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
          ? node.parent.name.text
          : undefined;
      const parameters = node.parameters.map((parameter) =>
        ts.isIdentifier(parameter.name) ? parameter.name.text : undefined,
      );
      if (name) {
        const inner = (child) => {
          if (
            ts.isCallExpression(child) &&
            ts.isIdentifier(child.expression) &&
            REQUEST_HELPERS.has(child.expression.text) &&
            child.arguments.length > 0 &&
            ts.isTemplateExpression(child.arguments[0]) &&
            child.arguments[0].templateSpans.length === 1 &&
            ts.isIdentifier(child.arguments[0].templateSpans[0].expression)
          ) {
            const template = child.arguments[0];
            const spanName = template.templateSpans[0].expression.text;
            const pathIndex = parameters.indexOf(spanName);
            if (pathIndex >= 0 && template.head.text.startsWith('/')) {
              wrappers.set(name, {
                prefix: template.head.text + template.templateSpans[0].literal.text,
                pathIndex,
                initIndex: parameters.findIndex((parameter) => parameter === 'init'),
                // A wrapper with no forwarded init pins its own verb, the way
                // a FormData upload helper is always a POST.
                fixedMethod: methodFromInit(child.arguments[1]),
                definition: child,
              });
            }
          }
          ts.forEachChild(child, inner);
        };
        inner(node.body);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return wrappers;
}

const files = await walk(apiRoot);
const errors = [];
const called = new Set();
let unresolved = 0;

for (const file of files) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const wrappers = localWrappers(source);
  const definitions = new Set([...wrappers.values()].map((wrapper) => wrapper.definition));

  const record = (node, rawPath, method) => {
    if (rawPath === undefined || method === undefined) {
      unresolved += 1;
      return;
    }
    if (!rawPath.startsWith('/')) return;
    const { path, truncated } = interpret(rawPath);
    called.add(method + ' ' + path + (truncated ? '/...' : ''));
    if (matches(method, path, truncated)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    errors.push(
      relative(resolve('.'), file) +
        ':' +
        (line + 1) +
        ' calls ' +
        method +
        ' ' +
        path +
        ', which no backend route serves.',
    );
  };

  const visit = (node) => {
    if (ts.isCallExpression(node) && !definitions.has(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      const wrapper = name ? wrappers.get(name) : undefined;
      if (wrapper) {
        const rawPath = pathFromNode(node.arguments[wrapper.pathIndex]);
        const method =
          wrapper.initIndex >= 0
            ? methodFromInit(node.arguments[wrapper.initIndex])
            : (wrapper.fixedMethod ?? 'GET');
        record(node, rawPath === undefined ? undefined : wrapper.prefix + rawPath, method);
      } else if (name && REQUEST_HELPERS.has(name) && node.arguments.length > 0) {
        record(node, pathFromNode(node.arguments[0]), methodFromInit(node.arguments[1]));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (errors.length > 0) {
  console.error(`api contract check failed (${errors.length}):`);
  for (const error of [...new Set(errors)].sort()) console.error(`- ${error}`);
  console.error(
    'Regenerate the backend inventory with `npm --prefix ../back run sync:routes` if a route was just added.',
  );
  process.exit(1);
}

console.log(
  `api contract check passed (${called.size} distinct endpoints called, all served${unresolved > 0 ? `; ${unresolved} dynamic call site${unresolved === 1 ? '' : 's'} not statically checkable` : ''}).`,
);
