import { resolve } from 'node:path';
import { parseDurationMs } from '../../../utils/duration.js';
import { requiredByteSize, requiredRateLimit } from '../../../config/envParsers.js';
import { getCachedPluginSecret, getCachedPluginSettings } from './pluginStore.js';

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

export function pluginSettingString(pluginId: string, key: string, fallback = ''): string {
  return asString(getCachedPluginSettings(pluginId)[key]) ?? fallback;
}

export function pluginSettingOptionalString(pluginId: string, key: string): string | undefined {
  return asString(getCachedPluginSettings(pluginId)[key]);
}

export function pluginSettingNumber(pluginId: string, key: string, fallback: number): number {
  const raw = getCachedPluginSettings(pluginId)[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = asString(raw);
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
}

export function pluginSettingBool(pluginId: string, key: string, fallback = false): boolean {
  const raw = getCachedPluginSettings(pluginId)[key];
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export function pluginSettingDurationMs(pluginId: string, key: string, fallback: string): number {
  const raw = pluginSettingString(pluginId, key, fallback);
  return parseDurationMs(raw) ?? parseDurationMs(fallback) ?? 0;
}

export function pluginSettingDurationMsOrNull(pluginId: string, key: string): number | null {
  const raw = pluginSettingOptionalString(pluginId, key);
  if (!raw) return null;
  return parseDurationMs(raw) ?? null;
}

export function pluginSettingByteSize(pluginId: string, key: string, fallback: string): number {
  const raw = pluginSettingString(pluginId, key, fallback);
  return requiredByteSize(raw, `${pluginId}.${key}`);
}

export function pluginSettingRate(
  pluginId: string,
  key: string,
  fallback: string,
): { windowMs: number; limit: number } {
  const raw = pluginSettingString(pluginId, key, fallback);
  return requiredRateLimit(raw, `${pluginId}.${key}`);
}

export function pluginSecret(pluginId: string, key: string): string | undefined {
  return getCachedPluginSecret(pluginId, key);
}

export function resolvePluginPrivatePath(
  privateDir: string,
  pluginId: string,
  key: string,
  fallback: string,
): string {
  const relative = pluginSettingString(pluginId, key, fallback).replace(/^[/\\]+/, '');
  const resolved = resolve(privateDir, relative);
  const root = resolve(privateDir);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`${pluginId}.${key} must stay within PRIVATE_DIR.`);
  }
  return resolved;
}

export function resolvePluginDevEmailDir(
  devDir: string | undefined,
  pluginId: string,
  key: string,
  fallback: string,
): string | undefined {
  if (!devDir) return undefined;
  const relative = pluginSettingString(pluginId, key, fallback).replace(/^[/\\]+/, '');
  return resolve(devDir, relative);
}
