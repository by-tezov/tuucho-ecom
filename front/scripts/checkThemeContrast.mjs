import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const themePath = resolve(projectRoot, 'src/styles/theme.css');
const css = await readFile(themePath, 'utf8');

function extractBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Missing theme selector: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`Unclosed theme selector: ${selector}`);
}

function declarations(selector) {
  return new Map(
    [...extractBlock(selector).matchAll(/(--(?:color|border|shadow)-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
      ([, token, value]) => [token, value.trim()],
    ),
  );
}

function rgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Contrast assertions require a six-digit hex colour, received: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex) {
  const channels = rgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Split `light-dark(a, b)` on the top-level comma (rgba args nest commas). */
function splitLightDarkArgs(inner) {
  let depth = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      return [inner.slice(0, index).trim(), inner.slice(index + 1).trim()];
    }
  }
  throw new Error(`Malformed light-dark() args: ${inner}`);
}

/** Resolve a theme.css colour value to a solid #rrggbb for the given scheme. */
function resolveColor(raw, scheme) {
  const value = raw.trim();
  const lightDark = /^light-dark\(\s*([\s\S]*)\s*\)$/.exec(value);
  if (lightDark) {
    const [lightValue, darkValue] = splitLightDarkArgs(lightDark[1]);
    return resolveColor(scheme === 'light' ? lightValue : darkValue, scheme);
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value);
  if (rgba) {
    const alpha = rgba[4] == null ? 1 : Number(rgba[4]);
    if (alpha + Number.EPSILON < 1) {
      // Semi-transparent tokens need a background to assert against; callers
      // composite them. Opaque-enough values flatten to their RGB.
      return {
        kind: 'rgba',
        r: Number(rgba[1]),
        g: Number(rgba[2]),
        b: Number(rgba[3]),
        a: alpha,
      };
    }
    return toHex([Number(rgba[1]), Number(rgba[2]), Number(rgba[3])]);
  }
  throw new Error(`Unsupported colour value for contrast check: ${value}`);
}

function compositeOver(fg, bgHex) {
  if (typeof fg === 'string') return fg;
  const [br, bg, bb] = rgb(bgHex);
  return toHex([fg.r * fg.a + br * (1 - fg.a), fg.g * fg.a + bg * (1 - fg.a), fg.b * fg.a + bb * (1 - fg.a)]);
}

function solidAgainst(resolved, fallbackBg) {
  if (typeof resolved === 'string') return resolved;
  return compositeOver(resolved, fallbackBg);
}

const base = declarations(':root');
const enhancedPalettes = {
  'light/enhanced': declarations(":root[data-theme='light'][data-contrast='more']"),
  'dark/enhanced': declarations(":root[data-theme='dark'][data-contrast='more']"),
};
const errors = [];

for (const [name, palette] of Object.entries(enhancedPalettes)) {
  const missing = [...base.keys()].filter((token) => !palette.has(token));
  const unknown = [...palette.keys()].filter((token) => !base.has(token));
  if (missing.length) errors.push(`${name}: missing enhanced overrides: ${missing.join(', ')}`);
  if (unknown.length) errors.push(`${name}: unknown enhanced overrides: ${unknown.join(', ')}`);
}

// Text pairs shared by standard AA and enhanced. Cream-on-accent fills are
// asserted for light only: in dark, accent is a bright text colour and filled
// controls use --color-surface-inverse (see Button primary / cart FAB).
const textPairs = [
  ['--color-ink', '--color-bg'],
  ['--color-ink', '--color-bg-card'],
  ['--color-ink-strong', '--color-bg'],
  ['--color-muted', '--color-bg'],
  ['--color-muted', '--color-bg-card'],
  ['--color-accent', '--color-bg'],
  ['--color-accent', '--color-bg-card'],
  ['--color-accent', '--color-accent-subtle'],
  ['--color-cream-bright', '--color-surface-inverse'],
  ['--color-muted-on-dark', '--color-surface-inverse'],
  ['--color-danger', '--color-danger-soft'],
  ['--color-info', '--color-info-soft'],
  ['--color-success', '--color-success-soft'],
  ['--color-warning', '--color-warning-soft'],
  ['--color-alert', '--color-alert-soft'],
  ['--color-violet', '--color-violet-soft'],
  ['--color-neutral', '--color-neutral-soft'],
];

const enhancedOnlyTextPairs = [
  ['--color-surface-inverse', '--color-accent-bright'],
  ['--color-ink-strong', '--color-accent-bright'],
  ['--color-cream-bright', '--color-accent'],
  ['--color-cream-bright', '--color-danger-solid'],
];

const lightOnlyTextPairs = [
  ['--color-cream-bright', '--color-accent'],
  ['--color-cream-bright', '--color-danger-solid'],
];

// UI / non-text contrast: ≥3:1 (WCAG 1.4.11). Soft decorative borders stay
// out of the standard matrix; form inputs and photo controls must pass.
const standardUiPairs = [
  ['--border-input', '--color-bg-card'],
  ['--color-cream-bright', '--color-photo-control'],
  ['--color-scroll-hint-fg', '--color-scroll-hint'],
  // Focus ring on dark sections (footer, reviews, admin sidebar).
  ['--color-accent-bright', '--color-surface-inverse'],
];

const enhancedUiPairs = [
  ...standardUiPairs,
  ['--border-medium', '--color-bg'],
  ['--border-strong', '--color-bg'],
  ['--color-accent-line', '--color-bg'],
  ['--color-scroll-hint-track', '--color-bg'],
  ['--color-danger-border', '--color-bg-card'],
  ['--color-info-border', '--color-bg-card'],
];

function assertPairs(name, getSolid, pairs, minRatio) {
  let count = 0;
  for (const [foregroundToken, backgroundToken] of pairs) {
    const background = getSolid(backgroundToken, backgroundToken);
    if (!background) continue;
    const foreground = getSolid(foregroundToken, backgroundToken, { allowRgbaComposite: true });
    if (!foreground) continue;
    count += 1;
    const ratio = contrast(foreground, background);
    if (ratio + Number.EPSILON < minRatio) {
      errors.push(
        `${name}: ${foregroundToken} on ${backgroundToken} is ${ratio.toFixed(2)}:1; expected at least ${minRatio}:1`,
      );
    }
  }
  return count;
}

let assertionCount = 0;

// Enhanced: explicit hex maps, AAA-ish text target.
for (const [name, palette] of Object.entries(enhancedPalettes)) {
  const scheme = name.startsWith('light') ? 'light' : 'dark';
  const getSolid = (token, against, opts = {}) => {
    const raw = palette.get(token);
    if (!raw) return null;
    const resolved = resolveColor(raw, scheme);
    if (typeof resolved === 'string') return resolved;
    if (opts.allowRgbaComposite) {
      const bgRaw = palette.get(against);
      if (!bgRaw) return null;
      const bg = resolveColor(bgRaw, scheme);
      return solidAgainst(resolved, typeof bg === 'string' ? bg : '#000000');
    }
    return null;
  };
  assertionCount += assertPairs(name, getSolid, [...textPairs, ...enhancedOnlyTextPairs], 7);
  assertionCount += assertPairs(name, getSolid, enhancedUiPairs, 3);
}

// Standard: resolve light-dark() from :root for each scheme, AA targets.
for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  const name = `${scheme}/standard`;
  const cache = new Map();
  function rawToken(token) {
    if (cache.has(token)) return cache.get(token);
    const raw = base.get(token);
    if (!raw) {
      cache.set(token, null);
      return null;
    }
    try {
      const resolved = resolveColor(raw, scheme);
      cache.set(token, resolved);
      return resolved;
    } catch (error) {
      errors.push(`${name}: ${token}: ${error instanceof Error ? error.message : String(error)}`);
      cache.set(token, null);
      return null;
    }
  }
  const getSolid = (token, againstToken, opts = {}) => {
    const resolved = rawToken(token);
    if (!resolved) return null;
    if (typeof resolved === 'string') return resolved;
    if (!opts.allowRgbaComposite) return null;
    const against = rawToken(againstToken);
    const bgHex = typeof against === 'string' ? against : scheme === 'light' ? '#ffffff' : '#000000';
    return solidAgainst(resolved, bgHex);
  };
  const standardText = scheme === 'light' ? [...textPairs, ...lightOnlyTextPairs] : textPairs;
  assertionCount += assertPairs(name, getSolid, standardText, 4.5);
  assertionCount += assertPairs(name, getSolid, standardUiPairs, 3);
}

if (errors.length > 0) {
  console.error(`Theme contrast check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Theme contrast check passed (${base.size} semantic tokens; enhanced overrides complete; ${assertionCount} ratio assertions across standard AA and enhanced).`,
  );
}
