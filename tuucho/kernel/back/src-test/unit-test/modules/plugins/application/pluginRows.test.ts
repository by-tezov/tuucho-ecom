import { test } from 'node:test';
import type { MatchesTable, PluginsRow } from '../../../../../src/db/rows.js';

const _pluginsRowMatchesTable: MatchesTable<PluginsRow, 'plugins'> = true;

test('the plugins row type includes config file stamps', () => {
  const sample: Pick<PluginsRow, 'config_files_hash' | 'config_files_applied_at' | 'secrets'> = {
    config_files_hash: null,
    config_files_applied_at: null,
    secrets: {},
  };
  void [_pluginsRowMatchesTable, sample];
});
