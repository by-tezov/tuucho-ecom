import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('CartBanner hosts', () => {
  it('IntroSurface owns the intro copy; Layout does not path-allowlist pages', () => {
    const intro = readFileSync(resolve(here, '../../../src/components/ui/IntroSurface.tsx'), 'utf8');
    const layout = readFileSync(resolve(here, '../../../src/components/layout/Layout.tsx'), 'utf8');
    const banner = readFileSync(resolve(here, '../../../src/components/layout/CartBanner.tsx'), 'utf8');
    expect(intro).toMatch(/host="intro"/);
    expect(layout).not.toMatch(/INTRO_SURFACE_PATHS/);
    expect(layout).toMatch(/<CartBanner \/>/);
    expect(banner).toMatch(/host === 'layout' && introPresent/);
  });
});
