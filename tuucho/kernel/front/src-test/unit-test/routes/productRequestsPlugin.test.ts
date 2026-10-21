import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(
  here,
  '../../../../../plugins/commerce/product-requests/tuucho-commerce-product-requests',
);

describe('tuucho-commerce-product-requests surface', () => {
  it('is the size-request product: admin page, no Preferences island, schema Configure', () => {
    const pkg = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8')) as {
      tuucho: {
        provides?: string[];
        settingsSchema?: unknown;
      };
    };
    const manifest = pkg.tuucho;
    expect(manifest.provides).toContain('AdminPage');
    expect(manifest.provides).not.toContain('PreferenceEntry');
    expect(manifest.settingsSchema).toEqual(expect.any(Object));
    expect(Object.keys(manifest.settingsSchema ?? {}).length).toBeGreaterThan(0);
    for (const field of Object.values(manifest.settingsSchema ?? {})) {
      expect((field as { label?: string }).label?.trim()).toBeTruthy();
      expect((field as { description?: string }).description?.trim()).toBeTruthy();
    }

    const register = readFileSync(resolve(pluginRoot, 'back/register.ts'), 'utf8');
    expect(register).not.toMatch(/CORE_OPENING_FILTERS\.preferences/);
    expect(register).not.toMatch(/Demandes de taille/);
    expect(register).not.toMatch(/size-requests/);

    const catalogue = readFileSync(resolve(here, '../../../src/routes/adminPreferencesCatalogue.tsx'), 'utf8');
    expect(catalogue).not.toMatch(/allowSizeRequest/);
    expect(catalogue).not.toMatch(/outOfStockSizeRequestEnabled/);
  });
});
