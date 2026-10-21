import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groupSettingsFields } from '@/routes/pluginSettingsForm';

const here = dirname(fileURLToPath(import.meta.url));

describe('groupSettingsFields', () => {
  it('keeps consecutive keys with the same section together', () => {
    const groups = groupSettingsFields(
      ['appId', 'appSecret', 'oauthReturnUrl'],
      {
        appId: {
          type: 'string',
          label: 'App id',
          description: 'From Meta.',
          section: 'app',
          sectionTitle: 'Facebook app',
          sectionDescription: 'Credentials from the Meta app.',
        },
        appSecret: {
          type: 'secret',
          label: 'App secret',
          description: 'Never shown.',
          section: 'app',
        },
        oauthReturnUrl: {
          type: 'url',
          label: 'Return URL',
          description: 'Must match Meta.',
          section: 'oauth',
          sectionTitle: 'OAuth return',
          sectionDescription: 'Where Facebook sends the browser.',
        },
      },
      'Settings',
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: 'app',
      title: 'Facebook app',
      description: 'Credentials from the Meta app.',
      keys: ['appId', 'appSecret'],
    });
    expect(groups[1]).toMatchObject({
      id: 'oauth',
      title: 'OAuth return',
      keys: ['oauthReturnUrl'],
    });
  });
});

describe('AdminPluginConfigurePage kit', () => {
  it('consumes kernel form fields and does not invent native select or page textarea', () => {
    const src = readFileSync(resolve(here, '../../../src/routes/AdminPluginConfigurePage.tsx'), 'utf8');
    expect(src).toMatch(/from '\.\.\/components\/ui\/SecretField'/);
    expect(src).toMatch(/from '\.\.\/components\/ui\/FormSection'/);
    expect(src).toMatch(/from '\.\.\/components\/ui\/TextField'/);
    expect(src).toMatch(/from '\.\.\/components\/ui\/ColorField'/);
    expect(src).not.toMatch(/<select/);
    expect(src).not.toMatch(/<textarea/);
    expect(src).toMatch(/frontConfigure \?/);
    expect(src).toMatch(/<SettingsForm/);
  });
});

describe('sign-in openings', () => {
  it('do not put admin Configure href on the shared sign-in opening', () => {
    const files = [
      resolve(here, '../../../../../plugins/identity/facebook/tuucho-signin-facebook/back/register.ts'),
      resolve(here, '../../../../../plugins/identity/google/tuucho-signin-google/back/register.ts'),
      resolve(here, '../../../../../plugins/identity/apple/tuucho-signin-apple/back/register.ts'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/href:/);
      expect(src, file).toMatch(/CORE_OPENING_FILTERS\.signIn/);
    }
    const openings = readFileSync(resolve(here, '../../../src/plugins/OpeningEntries.tsx'), 'utf8');
    expect(openings).toMatch(/from '\.\.\/components\/ui\/Button'/);
    expect(openings).not.toMatch(/from 'react-router-dom'/);
    const prefs = readFileSync(resolve(here, '../../../src/routes/AdminPreferenceOpenings.tsx'), 'utf8');
    expect(prefs).toMatch(/adminPath\(`\/plugins\/\$\{entry\.pluginId\}`\)/);
    expect(prefs).toMatch(/pluginOn\(entry\.pluginId\)/);
    const account = readFileSync(resolve(here, '../../../src/routes/AccountPage.tsx'), 'utf8');
    expect(account).not.toMatch(/openings\?\.signInMethods/);
    expect(account).toMatch(/SignInMethodsSettings/);
  });
});

describe('journal preference switches', () => {
  it('require the parent journal plugin enabled, not a leftover kernel row', () => {
    const src = readFileSync(resolve(here, '../../../src/routes/adminPreferencesCronLogs.tsx'), 'utf8');
    expect(src).toMatch(/pluginOn\('tuucho-journal-admin'\)/);
    expect(src).toMatch(/pluginOn\('tuucho-journal-email'\)/);
    expect(src).toMatch(/pluginOn\('tuucho-commerce-loyalty'\)/);
    expect(src).toMatch(/pluginOn\('tuucho-commerce-gift'\)/);
  });
});
