import { describe, expect, it } from 'vitest';
import type { AdminAccess } from '@/api/admin/roles';
import { pluginConfigBulkActions } from '@/routes/AdminPluginConfigBulk';
import { pluginConfigFilesActions } from '@/routes/AdminPluginConfigFiles';

function access(permissions: string[]): AdminAccess {
  return {
    roles: [],
    manageRoles: false,
    permissions,
    assignableRoles: [],
    targetableRoles: { all: false, roles: [] },
  };
}

const schema = { clientId: { type: 'string' } };

describe('pluginConfigFilesActions', () => {
  it('hides all file chrome when the plugin has no settingsSchema', () => {
    expect(pluginConfigFilesActions({}, access(['plugin_config_import', 'plugin_config_export']), true)).toEqual({
      showChrome: false,
      showUpdate: false,
      showImport: false,
      showExport: false,
    });
    expect(pluginConfigFilesActions(undefined, access(['plugin_config_import']), true).showChrome).toBe(false);
  });

  it('shows Update, Import, and Export for super-admin catalogue grants', () => {
    const actions = pluginConfigFilesActions(
      schema,
      access(['preferences', 'plugin_config_import', 'plugin_config_export']),
      true,
    );
    expect(actions).toEqual({
      showChrome: true,
      showUpdate: true,
      showImport: true,
      showExport: true,
    });
  });

  it('hides Update, Import, and Export when staff lacks the file codes', () => {
    const actions = pluginConfigFilesActions(schema, access(['preferences']), true);
    expect(actions.showChrome).toBe(true);
    expect(actions.showUpdate).toBe(false);
    expect(actions.showImport).toBe(false);
    expect(actions.showExport).toBe(false);
  });

  it('does not show Update when files are absent, even with import', () => {
    const actions = pluginConfigFilesActions(schema, access(['plugin_config_import']), false);
    expect(actions.showUpdate).toBe(false);
    expect(actions.showImport).toBe(true);
    expect(actions.showExport).toBe(false);
  });
});

describe('pluginConfigBulkActions', () => {
  it('hides all bulk chrome without file codes', () => {
    expect(pluginConfigBulkActions(access(['preferences']))).toEqual({
      showChrome: false,
      showUpdate: false,
      showImport: false,
      showExport: false,
    });
  });

  it('shows Update all and Import all from plugin_config_import only', () => {
    expect(pluginConfigBulkActions(access(['plugin_config_import']))).toEqual({
      showChrome: true,
      showUpdate: true,
      showImport: true,
      showExport: false,
    });
  });

  it('shows Export all from plugin_config_export only', () => {
    expect(pluginConfigBulkActions(access(['plugin_config_export']))).toEqual({
      showChrome: true,
      showUpdate: false,
      showImport: false,
      showExport: true,
    });
  });
});
