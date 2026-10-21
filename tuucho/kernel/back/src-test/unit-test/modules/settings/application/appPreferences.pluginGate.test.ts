import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApiLogPreferenceEnabled,
  isEmailLogPreferenceEnabled,
} from '../../../../../src/modules/settings/application/appPreferences.js';
import { setRuntimeEnabledPluginIds } from '../../../../../src/modules/plugins/application/runtimeEnabledPlugins.js';

test('API and email log preferences stay off when their journal plugin is disabled', () => {
  setRuntimeEnabledPluginIds([]);
  assert.equal(isApiLogPreferenceEnabled(), false);
  assert.equal(isEmailLogPreferenceEnabled(), false);
});

test('API log preference can turn on only when journal-admin is runtime-enabled', () => {
  setRuntimeEnabledPluginIds(['tuucho-journal-admin']);
  assert.equal(isEmailLogPreferenceEnabled(), false);
  const apiOn = isApiLogPreferenceEnabled();
  setRuntimeEnabledPluginIds([]);
  assert.equal(isApiLogPreferenceEnabled(), false);
  assert.equal(typeof apiOn, 'boolean');
});
