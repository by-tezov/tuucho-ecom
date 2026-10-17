#!/usr/bin/env node
/**
 * Loading floors and auto-dismiss delays come from the environment, not from
 * a constant typed into the screen that needs one.
 *
 * Three env values cover the whole app (see `src/config/env.ts`):
 *
 *   VITE_LOADING_MIN_SHORT / VITE_LOADING_MIN / VITE_LOADING_MIN_LONG
 *     → `shopConfig.loadingMinMs.short | .normal | .long`, the floor under a
 *       LoadingModal: work that settles sooner still shows the spinner that
 *       long, work that takes longer keeps it until it settles.
 *   VITE_NOTICE
 *     → `shopConfig.noticeMs`, how long a message that closes itself stays on
 *       screen: a success dialog, a toast, an inline notice, a message shown
 *       just before a redirect.
 *
 * This existed as nine per-screen env vars and a dozen hardcoded constants
 * that had drifted to 250 / 350 / 1400 / 2400 / 4000 ms for no stated reason,
 * plus two env vars nothing read at all. One knob per screen is a knob nobody
 * turns; the point of the three tiers is that they stay consistent, and they
 * only stay consistent if new code cannot quietly opt out.
 *
 * What fails here:
 *
 *   1. `withMinDuration(work, 350)` — a numeric floor. Pass a tier.
 *   2. `setTimeout` / `delay` with a one-shot delay between
 *      MESSAGE_BAND_MIN_MS and MESSAGE_BAND_MAX_MS. That band is where
 *      "long enough to read" lives, so a literal there is almost always a
 *      notice that should read `shopConfig.noticeMs`. Shorter values are
 *      animation and settle timings, longer ones are request timeouts and
 *      polling intervals; neither is a message, so neither is policed.
 *   3. A `VITE_LOADING_MIN*` / `VITE_NOTICE*` name read outside
 *      `src/config/env.ts`, which is how per-screen timing vars came back
 *      last time.
 *
 * A genuine in-band delay that is not a message (a retry backoff, a reconnect
 * wait) belongs in ALLOWED below, with the reason written down.
 */
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const sourceRoot = resolve('src');
/** The two files that may name a timing env var: the parser that turns it
 * into `shopConfig`, and the ambient declaration that types it. */
const ENV_READERS = new Set([resolve('src/config/env.ts'), resolve('src/vite-env.d.ts')]);

/** Where "a human has to read this" delays live. */
const MESSAGE_BAND_MIN_MS = 1000;
const MESSAGE_BAND_MAX_MS = 4999;

/** In-band delays that are deliberately not messages. Each entry is a file,
 * the delay it may use, and why that delay is not a notice. Add one only when
 * the wait is genuinely not something a customer reads. */
const ALLOWED = [
  {
    file: 'src/components/gallery/PhotoSwapFade.tsx',
    ms: 4000,
    why: 'Safety cap: the previous photo stops covering a new one that never reports its load.',
  },
  {
    file: 'src/components/layout/LazyCartDrawer.tsx',
    ms: 1500,
    why: 'Idle-time preload of the cart drawer chunk where requestIdleCallback is missing (Safari).',
  },
  {
    file: 'src/api/session/backendHealth.ts',
    ms: 1500,
    why: 'Upper bound of the randomized retry backoff between health probes.',
  },
  {
    file: 'src/components/chat/AccountContactChat.tsx',
    ms: 1500,
    why: 'Reconnect wait after a dropped chat stream.',
  },
  {
    file: 'src/hooks/useGalleryFeed.ts',
    ms: 1500,
    why: 'Retry delay for a failed "load more" page request.',
  },
  {
    file: 'src/routes/cart/useCartProductPresentation.ts',
    ms: 1500,
    why: 'Single retry before giving up on the cart presentation fetch.',
  },
];

/** One-shot waits only. A repeating `setInterval` is a clock or a poll, never
 * a message being read, so it is not policed. */
const TIMER_CALLEES = new Set(['setTimeout', 'delay']);
/** `delay(ms)` takes it first; `setTimeout` takes the callback first. */
const DELAY_ARG_INDEX = { setTimeout: 1, delay: 0 };

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      const extension = extname(entry.name);
      return Promise.resolve(extension === '.ts' || extension === '.tsx' ? [path] : []);
    }),
  );
  return nested.flat();
}

/** Numeric value of an argument, following a file-level `const X = 2400` one
 * hop so a named constant is not a way around the rule. */
function numericValue(node, constants) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    return node.operator === ts.SyntaxKind.MinusToken
      ? -Number(node.operand.text)
      : Number(node.operand.text);
  }
  if (ts.isIdentifier(node)) return constants.get(node.text);
  return undefined;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

const errors = [];
const files = await walk(sourceRoot);
let timers = 0;
let floors = 0;

for (const path of files) {
  const relativePath = relative(process.cwd(), path);
  const text = await readFile(path, 'utf8');

  if (!ENV_READERS.has(path)) {
    for (const match of text.matchAll(/VITE_(?:LOADING_MIN|NOTICE)[A-Z_]*/g)) {
      errors.push(
        `${relativePath}: reads ${match[0]} directly. Timing env lives in src/config/env.ts; use shopConfig.loadingMinMs.* or shopConfig.noticeMs.`,
      );
    }
  }

  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const constants = new Map();
  const visitConstants = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = numericValue(node.initializer, new Map());
      if (value !== undefined) constants.set(node.name.text, value);
    }
    ts.forEachChild(node, visitConstants);
  };
  visitConstants(source);

  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);

      if (name === 'withMinDuration') {
        floors += 1;
        const last = node.arguments[node.arguments.length - 1];
        const value = last ? numericValue(last, constants) : undefined;
        if (value !== undefined) {
          errors.push(
            `${relativePath}:${lineOf(node)}: withMinDuration(..., ${value}) hardcodes a loading floor. Pass shopConfig.loadingMinMs.short, .normal or .long.`,
          );
        }
      }

      if (name !== undefined && TIMER_CALLEES.has(name)) {
        timers += 1;
        const argument = node.arguments[DELAY_ARG_INDEX[name]];
        const value = argument ? numericValue(argument, constants) : undefined;
        if (value !== undefined && value >= MESSAGE_BAND_MIN_MS && value <= MESSAGE_BAND_MAX_MS) {
          const allowed = ALLOWED.some(
            (entry) => entry.file === relativePath.split('\\').join('/') && entry.ms === value,
          );
          if (!allowed) {
            errors.push(
              `${relativePath}:${lineOf(node)}: ${name === 'delay' ? `delay(${value})` : `setTimeout(..., ${value})`} sits in the ${MESSAGE_BAND_MIN_MS}-${MESSAGE_BAND_MAX_MS}ms band. A message the customer reads before it closes itself uses shopConfig.noticeMs; if this is a retry or a poll, add it to ALLOWED in scripts/checkTimings.mjs with the reason.`,
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (errors.length > 0) {
  console.error(`timings check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `timings check passed (${floors} loading floors, ${timers} timers, ${ALLOWED.length} documented exceptions).`,
);
