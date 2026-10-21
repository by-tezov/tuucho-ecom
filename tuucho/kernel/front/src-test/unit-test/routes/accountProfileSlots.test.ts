import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CORE_FRONT_SLOTS } from '@/plugins/frontSlots';

const here = dirname(fileURLToPath(import.meta.url));

describe('Account profile slots', () => {
  it('places Delete left of the end region and stretches Information', () => {
    const page = readFileSync(resolve(here, '../../../src/routes/AccountPage.tsx'), 'utf8');
    const css = readFileSync(
      resolve(here, '../../../src/components/account/settings/AccountSettings.module.css'),
      'utf8',
    );
    const deleteAt = page.indexOf('<DeletionSettings');
    const endAt = page.indexOf('CORE_FRONT_SLOTS.accountProfileEnd');
    expect(deleteAt).toBeGreaterThan(0);
    expect(endAt).toBeGreaterThan(deleteAt);
    expect(page).not.toMatch(/OpeningEntries/);
    expect(page).toMatch(/detailsPair/);
    expect(page).toMatch(/CORE_FRONT_SLOTS\.accountProfileDetails/);
    expect(page).toMatch(/CORE_FRONT_SLOTS\.accountProfileCredentials/);
    expect(css).toMatch(/\.profileSubmit/);
    expect(css).toMatch(/margin-top:\s*auto/);
    expect(CORE_FRONT_SLOTS.accountProfileEnd).toBe('slot.account.profile.end');
    expect(CORE_FRONT_SLOTS.accountProfileDetails).toBe('slot.account.profile.details');
    expect(CORE_FRONT_SLOTS.accountProfileCredentials).toBe('slot.account.profile.credentials');
  });

  it('registers Introduction on the end region with order 0', () => {
    const front = readFileSync(
      resolve(here, '../../../../../plugins/home/onboarding/tuucho-onboarding/front/index.tsx'),
      'utf8',
    );
    expect(front).toMatch(/CORE_FRONT_SLOTS\.accountProfileEnd/);
    expect(front).toMatch(/slotOrder/);
    expect(front).not.toMatch(/CORE_FRONT_SLOTS\.accountProfile,/);
  });

  it('sorts PluginSlot contributors by slotOrder', () => {
    const host = readFileSync(resolve(here, '../../../src/plugins/PluginHost.tsx'), 'utf8');
    expect(host).toMatch(/slotOrder\?:/);
    expect(host).toMatch(/mod\.slotOrder\?\.\[name\] \?\? 10/);
  });
});
