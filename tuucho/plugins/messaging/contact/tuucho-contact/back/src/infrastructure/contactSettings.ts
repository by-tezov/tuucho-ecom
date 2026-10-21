import { config } from '@kernel/back/config/env';
import {
  pluginSecret,
  pluginSettingBool,
  pluginSettingByteSize,
  pluginSettingDurationMs,
  pluginSettingNumber,
  pluginSettingOptionalString,
  pluginSettingString,
  resolvePluginPrivatePath,
} from '@kernel/back/modules/plugins/application/pluginSettingValues';
import { pluginOwnedRateLimiter } from '@kernel/back/middleware/pluginRateLimiter';

const PLUGIN = 'tuucho-contact';

export const contactRateLimiter = pluginOwnedRateLimiter({
  pluginId: PLUGIN,
  rateKey: 'rateContactEmail',
  fallback: '15m:5',
  disableKey: 'disableRateContactEmail',
  kind: 'rate_limit_contact_email',
});

export function contactIdentityMax(): number {
  return pluginSettingNumber(PLUGIN, 'identityMax', 160);
}

export function contactMessageMax(): number {
  return pluginSettingNumber(PLUGIN, 'messageMax', 5000);
}

export function contactImageMaxBytes(): number {
  return pluginSettingByteSize(PLUGIN, 'imageMaxBytes', '5m');
}

export function chatImageMaxBytes(): number {
  return pluginSettingByteSize(PLUGIN, 'chatImageMaxBytes', '5m');
}

export function contactMediaDir(): string {
  return resolvePluginPrivatePath(config.privateDir, PLUGIN, 'mediaContactDir', '/media/contact');
}

export function chatMediaDir(): string {
  return resolvePluginPrivatePath(config.privateDir, PLUGIN, 'mediaChatDir', '/media/chat');
}

export function contactMediaAbsolutePath(fileName: string): string {
  return `${contactMediaDir()}/${fileName}`;
}

export function chatMediaAbsolutePath(fileName: string): string {
  return `${chatMediaDir()}/${fileName}`;
}

export function chatMaxSessionsPerUser(): number {
  return pluginSettingNumber(PLUGIN, 'maxSessionsPerUser', 15);
}

export function adminChatOwnerEmailSuppressionTimeoutMs(): number {
  return pluginSettingDurationMs(PLUGIN, 'adminOwnerEmailSuppressionTimeout', '10m');
}

export function chatSmtpSettings() {
  const portRaw = pluginSettingOptionalString(PLUGIN, 'smtpPort');
  const port = portRaw ? Number(portRaw) : undefined;
  return {
    host: pluginSettingOptionalString(PLUGIN, 'smtpHost'),
    port: port && Number.isSafeInteger(port) && port > 0 ? port : undefined,
    user: pluginSettingOptionalString(PLUGIN, 'smtpUser'),
    password: pluginSecret(PLUGIN, 'smtpPassword'),
    fromEmail: pluginSettingOptionalString(PLUGIN, 'fromEmail'),
    recipientEmail: pluginSettingOptionalString(PLUGIN, 'seedRecipient'),
  };
}

export function contactSeedRecipient(): string | undefined {
  return pluginSettingOptionalString(PLUGIN, 'seedRecipient');
}

export function contactDevEmailChatDir(): string | undefined {
  return pluginSettingString(PLUGIN, 'devEmailChatDir', '/email-chat');
}
