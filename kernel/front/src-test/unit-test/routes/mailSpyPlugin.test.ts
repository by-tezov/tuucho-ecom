import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, '../../../../../plugins/tuucho/messaging/mail-spy/tuucho-mail-spy');

describe('tuucho-mail-spy surface', () => {
  it('is a dedicated admin page, not Preferences or Configure', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'plugin.json'), 'utf8')) as {
      id: string;
      kind: string;
      provides?: string[];
      settingsSchema?: unknown;
      adminNav?: Array<{ to: string; permission: string }>;
    };
    expect(manifest.id).toBe('tuucho-mail-spy');
    expect(manifest.kind).toBe('generic');
    expect(manifest.provides).toContain('AdminPage');
    expect(manifest.settingsSchema).toBeUndefined();
    expect(manifest.adminNav?.[0]?.to).toBe('/spy-mail');
    expect(manifest.adminNav?.[0]?.permission).toBe('spy_mail');

    const prefs = readFileSync(resolve(here, '../../../src/routes/AdminPreferencesPage.tsx'), 'utf8');
    expect(prefs).not.toMatch(/SPY_GROUPS/);
    expect(prefs).not.toMatch(/adminPreferencesSpy/);
  });

  it('contact registers chat owner notify through spy, not chat SMTP env', () => {
    const contactRegister = readFileSync(
      resolve(pluginRoot, '../../contact/tuucho-contact/back/register.ts'),
      'utf8',
    );
    expect(contactRegister).toMatch(/id: 'contact\.inbound'/);
    expect(contactRegister).toMatch(/id: 'contact\.chat'/);
    const chat = readFileSync(
      resolve(pluginRoot, '../../contact/tuucho-contact/back/src/application/chat.ts'),
      'utf8',
    );
    expect(chat).toMatch(/spyTo\('contact\.chat'\)/);
    expect(chat).not.toMatch(/chatSmtp\.recipientEmail/);
    const contactFront = readFileSync(
      resolve(pluginRoot, '../../contact/tuucho-contact/front/index.tsx'),
      'utf8',
    );
    expect(contactFront).toMatch(/configure: <AdminContactConfigure \/>/);
    const configure = readFileSync(
      resolve(pluginRoot, '../../contact/tuucho-contact/front/AdminContactConfigure.tsx'),
      'utf8',
    );
    expect(configure).toMatch(/from '\.\.\/\.\.\/\.\.\/mail-spy\/tuucho-mail-spy\/front\/useSpyMailAdmin'/);
    expect(
      existsSync(resolve(pluginRoot, '../../contact/tuucho-contact/front/../../../mail-spy/tuucho-mail-spy/front/useSpyMailAdmin.ts')),
    ).toBe(true);
    const spyPage = readFileSync(resolve(pluginRoot, 'front/AdminSpyMailPage.tsx'), 'utf8');
    expect(spyPage).not.toMatch(/\[on, reload, copy\]/);
    const channelsUi = readFileSync(resolve(pluginRoot, 'front/SpyMailChannels.tsx'), 'utf8');
    expect(channelsUi).not.toMatch(/<select/);
    expect(channelsUi).toMatch(/AdminFilterSelect/);
    expect(channelsUi).toMatch(/SegmentedSwitch/);
    expect(channelsUi).toMatch(/ToggleSwitch/);
    expect(channelsUi).toMatch(/TrashIcon/);
    expect(channelsUi).toMatch(/styles\.removeButton/);
    expect(channelsUi).toMatch(/styles\.recipientRow/);
    expect(channelsUi).not.toMatch(/Chip/);
    expect(channelsUi).not.toMatch(/ghostDanger/);
    expect(channelsUi).not.toMatch(/>\s*\{copy\.remove\}\s*</);
    expect(channelsUi).toMatch(/type="search"/);
    expect(spyPage).toMatch(/showSearch/);
    expect(configure).toMatch(/showSearch=\{channels\.length > 2\}/);
    expect(channelsUi).not.toMatch(/filterKind|Spy-email type|Spy-Email Type/);
  });
});
