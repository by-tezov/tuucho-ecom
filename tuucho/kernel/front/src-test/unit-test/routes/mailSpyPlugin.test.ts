import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, '../../../../../plugins/messaging/mail-spy/tuucho-mail-spy');

describe('tuucho-mail-spy surface', () => {
  it('keeps recipients in plugin config, not an admin page', () => {
    const pkg = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8')) as {
      tuucho: {
        id: string;
        kind: string;
        provides?: string[];
        permissions?: Array<{ code: string }>;
        settingsSchema?: Record<string, { label?: string; description?: string; type?: string; hidden?: boolean }>;
        adminNav?: Array<{ to: string }>;
        defaultSettings?: { rules?: unknown };
      };
    };
    const manifest = pkg.tuucho;
    expect(manifest.id).toBe('tuucho-mail-spy');
    expect(manifest.kinds).toEqual(['generic']);
    expect(manifest.provides ?? []).not.toContain('AdminPage');
    expect(manifest.adminNav ?? []).toEqual([]);
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.settingsSchema?.rules?.type).toBe('text');
    expect(manifest.settingsSchema?.rules?.hidden).toBe(true);
    expect(manifest.defaultSettings?.rules).toEqual([]);
    for (const field of Object.values(manifest.settingsSchema ?? {})) {
      expect(field.label?.trim()).toBeTruthy();
      expect(field.description?.trim()).toBeTruthy();
    }

    const prefs = readFileSync(resolve(here, '../../../src/routes/AdminPreferencesPage.tsx'), 'utf8');
    expect(prefs).not.toMatch(/SPY_GROUPS/);
    expect(prefs).not.toMatch(/adminPreferencesSpy/);
    const front = readFileSync(resolve(pluginRoot, 'front/index.tsx'), 'utf8');
    expect(front).toMatch(/configureTab: 'Rules'/);
    expect(front).toMatch(/SpyRulesPanel/);
    expect(front).not.toMatch(/adminRoutes/);
    expect(existsSync(resolve(pluginRoot, 'front/SpyMailChannels.tsx'))).toBe(true);
  });

  it('contact registers chat owner notify through spy, not a recipient picker', () => {
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
    expect(configure).not.toMatch(/useSpyMailAdmin/);
    expect(configure).toMatch(/contactMailCopy/);
    const resolveSrc = readFileSync(resolve(pluginRoot, 'back/src/application/spyResolve.ts'), 'utf8');
    expect(resolveSrc).toMatch(/getCachedPluginSettings/);
    expect(resolveSrc).not.toMatch(/seedEnvRecipientsIfEmpty/);
    expect(resolveSrc).not.toMatch(/super-admin/);
  });
});
