/**
 * Generic sign-in provider opening. Live credentials live on
 * `tuucho-signin-<provider>` plugins (settingsSchema / secrets), not kernel JSON.
 */
import {
  pluginSecret,
  pluginSettingDurationMs,
  pluginSettingOptionalString,
} from '../../plugins/application/pluginSettingValues.js';
import { isCachedPluginEnabled } from '../../plugins/application/pluginStore.js';

export function signInProviderPluginId(provider: string): string {
  return `tuucho-signin-${provider}`;
}

export function isSignInProviderEnabled(provider: string): boolean {
  return isCachedPluginEnabled(signInProviderPluginId(provider));
}

export function signInProviderSetting(provider: string, key: string): string | undefined {
  if (!isSignInProviderEnabled(provider)) return undefined;
  return pluginSettingOptionalString(signInProviderPluginId(provider), key);
}

export function signInProviderSecret(provider: string, key: string): string | undefined {
  if (!isSignInProviderEnabled(provider)) return undefined;
  return pluginSecret(signInProviderPluginId(provider), key);
}

export function signInProviderSignupTtlMs(provider: string): number {
  return pluginSettingDurationMs(signInProviderPluginId(provider), 'signupTokenTtl', '10m');
}
