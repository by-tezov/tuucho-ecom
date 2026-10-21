import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CORE_FRONT_SLOTS } from '@/plugins/frontSlots';

const here = dirname(fileURLToPath(import.meta.url));

describe('Admin home slots', () => {
  it('keeps kernel chrome and hosts numbers plus attention regions', () => {
    const page = readFileSync(resolve(here, '../../../src/routes/AdminPage.tsx'), 'utf8');
    expect(page).toMatch(/CORE_FRONT_SLOTS\.adminDashboardAttention/);
    expect(page).toMatch(/CORE_FRONT_SLOTS\.adminDashboard/);
    expect(page).toMatch(/AdminAttentionCard/);
    expect(page).toMatch(/AdminStatCard/);
    expect(CORE_FRONT_SLOTS.adminDashboard).toBe('slot.admin.dashboard');
    expect(CORE_FRONT_SLOTS.adminDashboardAttention).toBe('slot.admin.dashboard.attention');
  });

  it('puts loyalty on numbers and product-requests on attention', () => {
    const loyalty = readFileSync(
      resolve(
        here,
        '../../../../../plugins/commerce/loyalty/tuucho-commerce-loyalty/front/index.tsx',
      ),
      'utf8',
    );
    const requests = readFileSync(
      resolve(
        here,
        '../../../../../plugins/commerce/product-requests/tuucho-commerce-product-requests/front/index.tsx',
      ),
      'utf8',
    );
    expect(loyalty).toMatch(/CORE_FRONT_SLOTS\.adminDashboard/);
    expect(loyalty).not.toMatch(/adminDashboardAttention/);
    expect(requests).toMatch(/CORE_FRONT_SLOTS\.adminDashboardAttention/);
    expect(requests).not.toMatch(/adminDashboard\]/);
  });
});
