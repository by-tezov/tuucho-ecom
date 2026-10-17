/** Split total concurrent VUs across load scenarios (weights match the default 25-VU mix). */

/** One entry per k6 scenario family, in allocation priority order. */
const WEIGHTS = {
  guest: 6,
  auth: 5,
  contact: 3,
  checkout: 4,
  /** Single-nail gallery, cart rules and the crawler-facing SEO relay routes. */
  nail: 3,
  /** Composed sets: save, edit, cart, free checkout. */
  compose: 3,
  /** Full gift cycle: offer, receiver choice and confirm, giver free checkout. */
  gift: 2,
  guestCheckout: 2,
} as const;

export type LoadVuKey = keyof typeof WEIGHTS;

export type LoadVuSplit = { total: number } & Record<LoadVuKey, number>;

const KEYS = Object.keys(WEIGHTS) as LoadVuKey[];
const WEIGHT_SUM = KEYS.reduce((sum, key) => sum + WEIGHTS[key], 0);

/**
 * Allocate `total` VUs across every scenario family by weight. Prefer at least
 * one VU per family when `total` covers them all; otherwise fill in weight
 * order until the budget is spent.
 */
export function allocateLoadVus(total: number): LoadVuSplit {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`load VU total must be a positive integer (got ${total})`);
  }

  const raw = Object.fromEntries(
    KEYS.map((key) => [key, Math.floor((total * WEIGHTS[key]) / WEIGHT_SUM)]),
  ) as Record<LoadVuKey, number>;

  let assigned = KEYS.reduce((sum, key) => sum + raw[key], 0);
  const remainders = KEYS.map((key) => ({
    key,
    frac: (total * WEIGHTS[key]) / WEIGHT_SUM - raw[key],
  })).sort((a, b) => b.frac - a.frac || WEIGHTS[b.key] - WEIGHTS[a.key]);

  for (const entry of remainders) {
    if (assigned >= total) break;
    raw[entry.key] += 1;
    assigned += 1;
  }

  if (total >= KEYS.length) {
    for (const key of KEYS) {
      if (raw[key] === 0) {
        const donor = KEYS.filter((candidate) => raw[candidate] > 1).sort(
          (a, b) => raw[b] - raw[a] || WEIGHTS[b] - WEIGHTS[a],
        )[0];
        if (!donor) break;
        raw[donor] -= 1;
        raw[key] += 1;
      }
    }
  }

  return { total, ...raw };
}

/** The contention profile's own split: most VUs fight over one scarce variant
 * and one limited voucher, pairs share an account, the rest keep reading. */
export interface ContentionSplit {
  total: number;
  scarce: number;
  /** Always even: two VUs per shared account. */
  twins: number;
  guest: number;
}

export function allocateContentionVus(total: number): ContentionSplit {
  if (!Number.isInteger(total) || total < 4) {
    throw new Error(`the contention profile needs at least 4 VUs (got ${total})`);
  }
  const twins = Math.max(2, Math.floor((total * 0.3) / 2) * 2);
  const guest = Math.max(1, Math.floor(total * 0.2));
  return { total, scarce: total - twins - guest, twins, guest };
}

export function defaultLoadVus(profile: 'smoke' | 'baseline' | 'contention'): number {
  return profile === 'baseline' ? 50 : 25;
}

/** Steady-state / total run length in seconds (smoke/contention constant; baseline ramp sum). */
export function defaultLoadDurationSec(profile: 'smoke' | 'baseline' | 'contention'): number {
  return profile === 'baseline' ? 120 : 60;
}

export function formatDurationSec(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new Error(`load duration must be a positive integer number of seconds (got ${seconds})`);
  }
  return `${seconds}s`;
}
