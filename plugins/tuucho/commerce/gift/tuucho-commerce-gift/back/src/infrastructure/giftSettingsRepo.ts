import type pg from 'pg';
import { parseDurationMs } from '@kernel/back/utils/duration';
import {
  pluginSettingNumber,
  pluginSettingString,
} from '@kernel/back/modules/plugins/application/pluginSettingValues';
import type { GiftSettings } from '../domain/settings.js';

const PLUGIN = 'tuucho-commerce-gift';

function durationMs(key: string, fallback: string): number {
  return parseDurationMs(pluginSettingString(PLUGIN, key, fallback)) ?? parseDurationMs(fallback) ?? 0;
}

function pinFailures(): { pinFreeFailures: number; pinMaxFailures: number } {
  const raw = pluginSettingString(PLUGIN, 'pinFailures', '5:8');
  const [freeRaw, maxRaw] = raw.split(':');
  const pinFreeFailures = Number(freeRaw);
  const pinMaxFailures = Number(maxRaw);
  return {
    pinFreeFailures: Number.isSafeInteger(pinFreeFailures) ? pinFreeFailures : 5,
    pinMaxFailures: Number.isSafeInteger(pinMaxFailures) ? pinMaxFailures : 8,
  };
}

function programFromSettings(): Omit<GiftSettings, 'enabled'> {
  const minBudget = pluginSettingNumber(PLUGIN, 'minBudget', 12);
  const maxBudgetCeiling = pluginSettingNumber(PLUGIN, 'maxBudgetCeiling', 150);
  return {
    receiverTokenTtlDays: pluginSettingNumber(PLUGIN, 'receiverTokenTtlDays', 30),
    extendCeilingDays: pluginSettingNumber(PLUGIN, 'extendCeilingDays', 60),
    lockSessionTtlHours: pluginSettingNumber(PLUGIN, 'lockSessionTtlHours', 12),
    stockHoldTtlDays: pluginSettingNumber(PLUGIN, 'stockHoldTtlDays', 7),
    giverPayTtlDays: pluginSettingNumber(PLUGIN, 'giverPayTtlDays', 15),
    selectReminderBeforeMs: durationMs('selectReminderBefore', '7d'),
    holdReminderBeforeMs: durationMs('holdReminderBefore', '1d'),
    payReminderBeforeMs: durationMs('payReminderBefore', '3d'),
    visibilityAfterTerminalDays: pluginSettingNumber(PLUGIN, 'visibilityAfterTerminalDays', 7),
    minBudget,
    maxBudgetCeiling: maxBudgetCeiling < minBudget ? minBudget : maxBudgetCeiling,
    maxAccessoryBudgetCeiling: pluginSettingNumber(PLUGIN, 'maxAccessoryBudgetCeiling', 10),
    maxOpenPromisesPerGiver: pluginSettingNumber(PLUGIN, 'maxOpenPromisesPerGiver', 10),
    ...pinFailures(),
    purgeAfterDays: pluginSettingNumber(PLUGIN, 'purgeAfterDays', 396),
  };
}

/** Programme numbers from the gift plugin settings. `enabled` is always true:
 * the leftover `gift_settings.enabled` column is not read. */
export async function getGiftSettings(_db: pg.Pool | pg.PoolClient): Promise<GiftSettings> {
  return {
    ...programFromSettings(),
    enabled: true,
  };
}
