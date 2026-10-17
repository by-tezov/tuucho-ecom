import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(
  here,
  '../../../../../plugins/tuucho/commerce/product-requests/tuucho-commerce-product-requests',
);

describe('tuucho-commerce-product-requests surface', () => {
  it('is the size-request product: admin page, no Preferences island, no Configure', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'plugin.json'), 'utf8')) as {
      provides?: string[];
      settingsSchema?: unknown;
    };
    expect(manifest.provides).toContain('AdminPage');
    expect(manifest.provides).not.toContain('PreferenceEntry');
    expect(manifest.settingsSchema).toBeUndefined();

    const register = readFileSync(resolve(pluginRoot, 'back/register.ts'), 'utf8');
    expect(register).not.toMatch(/CORE_OPENING_FILTERS\.preferences/);
    expect(register).not.toMatch(/Demandes de taille/);
    expect(register).not.toMatch(/size-requests/);

    const catalogue = readFileSync(resolve(here, '../../../src/routes/adminPreferencesCatalogue.tsx'), 'utf8');
    expect(catalogue).not.toMatch(/allowSizeRequest/);
    expect(catalogue).not.toMatch(/outOfStockSizeRequestEnabled/);
  });
});
