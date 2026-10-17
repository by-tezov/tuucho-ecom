import { useEffect, useState } from 'react';
import { getGiftPublicSettings } from '../api/gift';

export interface GiftPublicCreateSettings {
  maxSetsCeiling: number;
  /** Smallest sets budget create accepts (`GIFT_MIN_BUDGET`), 0 until the
   * settings call lands. */
  minBudget: number;
  maxBudgetCeiling: number;
  maxAccessoryBudgetCeiling: number;
  receiverTokenTtlDays: number;
  stockHoldTtlDays: number;
  giverPayTtlDays: number;
  /** Cheapest and dearest set currently in stock, or null when the catalogue
   * has nothing to buy. Backs the create page's "about this many sets". */
  setPriceRange: { min: number; max: number } | null;
}

let cached: GiftPublicCreateSettings | null = null;
let inflight: Promise<GiftPublicCreateSettings | null> | null = null;

function clampTtlDays(value: unknown, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.min(max, Math.round(value))
    : fallback;
}

function normalize(result: {
  maxSetsCeiling?: number;
  minBudget?: number;
  maxBudgetCeiling?: number;
  maxAccessoryBudgetCeiling?: number;
  receiverTokenTtlDays?: number;
  stockHoldTtlDays?: number;
  giverPayTtlDays?: number;
  setPriceRange?: { min: number; max: number } | null;
}): GiftPublicCreateSettings {
  const maxSetsCeiling =
    typeof result.maxSetsCeiling === 'number' && Number.isFinite(result.maxSetsCeiling)
      ? result.maxSetsCeiling
      : 0;
  const minBudget =
    typeof result.minBudget === 'number' && Number.isFinite(result.minBudget) && result.minBudget > 0
      ? result.minBudget
      : 0;
  const maxBudgetCeiling =
    typeof result.maxBudgetCeiling === 'number' && Number.isFinite(result.maxBudgetCeiling)
      ? result.maxBudgetCeiling
      : 0;
  const maxAccessoryBudgetCeiling =
    typeof result.maxAccessoryBudgetCeiling === 'number' && Number.isFinite(result.maxAccessoryBudgetCeiling)
      ? result.maxAccessoryBudgetCeiling
      : 0;
  const range = result.setPriceRange;
  const setPriceRange =
    range &&
    typeof range.min === 'number' &&
    typeof range.max === 'number' &&
    Number.isFinite(range.min) &&
    Number.isFinite(range.max) &&
    range.min > 0 &&
    range.max >= range.min
      ? { min: range.min, max: range.max }
      : null;
  return {
    maxSetsCeiling,
    minBudget,
    maxBudgetCeiling,
    maxAccessoryBudgetCeiling,
    receiverTokenTtlDays: clampTtlDays(result.receiverTokenTtlDays, 365, 30),
    stockHoldTtlDays: clampTtlDays(result.stockHoldTtlDays, 30, 7),
    giverPayTtlDays: clampTtlDays(result.giverPayTtlDays, 90, 30),
    setPriceRange,
  };
}

async function fetchSettings(): Promise<GiftPublicCreateSettings | null> {
  if (cached !== null) return cached;
  if (!inflight) {
    inflight = getGiftPublicSettings()
      .then((result) => {
        cached = normalize(result);
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useGiftPublicSettings(): GiftPublicCreateSettings | null {
  const [settings, setSettings] = useState<GiftPublicCreateSettings | null>(cached);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setSettings(cached);
    const load = () => {
      void fetchSettings().then((value) => {
        if (cancelled) return;
        if (value) {
          setSettings(value);
          return;
        }
        retry = setTimeout(load, 400);
      });
    };
    load();
    return () => {
      cancelled = true;
      if (retry !== undefined) clearTimeout(retry);
    };
  }, []);

  return settings;
}
