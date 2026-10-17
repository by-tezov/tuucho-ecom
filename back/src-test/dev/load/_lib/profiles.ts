import type { Options } from 'k6/options';
import { buildThresholds } from './thresholds.ts';
import {
  allocateContentionVus,
  allocateLoadVus,
  defaultLoadDurationSec,
  defaultLoadVus,
  formatDurationSec,
  type ContentionSplit,
  type LoadVuSplit,
} from './vuAlloc.ts';

export type LoadProfileName = 'smoke' | 'baseline' | 'contention';

export {
  allocateContentionVus,
  allocateLoadVus,
  defaultLoadDurationSec,
  defaultLoadVus,
  formatDurationSec,
  type ContentionSplit,
  type LoadVuSplit,
};

type Scenario = NonNullable<Options['scenarios']>[string];

function setupTimeoutFor(total: number): string {
  if (total >= 80) return '15m';
  if (total >= 40) return '10m';
  return '5m';
}

function constantScenario(exec: string, vus: number, duration: string): Scenario | undefined {
  if (vus <= 0) return undefined;
  return {
    executor: 'constant-vus' as const,
    exec,
    vus,
    duration,
  };
}

/** Ramp up / hold / ramp down; total stage time ≈ `durationSec`. */
function rampingScenario(exec: string, peak: number, durationSec: number): Scenario | undefined {
  if (peak <= 0) return undefined;
  const mid = Math.max(1, Math.ceil(peak / 2));
  const ramp = Math.max(1, Math.floor(durationSec / 4));
  const hold = Math.max(1, durationSec - ramp * 2);
  return {
    executor: 'ramping-vus' as const,
    exec,
    startVUs: 0,
    stages: [
      { duration: formatDurationSec(ramp), target: mid },
      { duration: formatDurationSec(hold), target: peak },
      { duration: formatDurationSec(ramp), target: 0 },
    ],
  };
}

function defined(scenarios: Record<string, Scenario | undefined>): Record<string, Scenario> {
  return Object.fromEntries(
    Object.entries(scenarios).filter((entry): entry is [string, Scenario] => Boolean(entry[1])),
  );
}

/** k6 exec name per VU family, shared by the smoke and baseline mixes. */
const MIX_EXECS: Record<keyof Omit<LoadVuSplit, 'total'>, [scenario: string, exec: string]> = {
  guest: ['guest_read', 'guestRead'],
  auth: ['auth_account', 'authAccount'],
  contact: ['contact_chat', 'contactChat'],
  checkout: ['checkout_free', 'checkoutFree'],
  nail: ['nail_browse', 'nailBrowse'],
  compose: ['compose', 'compose'],
  gift: ['gift_cycle', 'giftCycle'],
  guestCheckout: ['guest_checkout', 'guestCheckout'],
};

/**
 * smoke / baseline: the whole customer mix (constant or ramping).
 * contention: most VUs race for one scarce variant and one limited voucher,
 * pairs of VUs share an account, the rest keep reading the catalogue.
 * `vus` / `durationSec` omit → profile defaults (25×60s / 50×120s / 25×60s).
 */
export function resolveProfile(
  name: string,
  vusRaw?: string,
  durationRaw?: string,
): {
  profile: LoadProfileName;
  options: Options;
  total: number;
  durationSec: number;
} {
  const profile: LoadProfileName =
    name === 'baseline' ? 'baseline' : name === 'contention' ? 'contention' : 'smoke';
  const total = vusRaw ? Number(vusRaw) : defaultLoadVus(profile);
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`PAM_LOAD_VUS must be a positive integer (got ${vusRaw ?? total})`);
  }
  const durationSec = durationRaw ? Number(durationRaw) : defaultLoadDurationSec(profile);
  if (!Number.isInteger(durationSec) || durationSec < 1) {
    throw new Error(
      `PAM_LOAD_DURATION must be a positive integer number of seconds (got ${durationRaw ?? durationSec})`,
    );
  }
  const duration = formatDurationSec(durationSec);
  const thresholds = buildThresholds(profile);
  const base = { setupTimeout: setupTimeoutFor(total), thresholds };

  if (profile === 'contention') {
    const split = allocateContentionVus(total);
    return {
      profile,
      total,
      durationSec,
      options: {
        ...base,
        scenarios: defined({
          scarce_checkout: constantScenario('scarceCheckout', split.scarce, duration),
          twin_cart: constantScenario('twinCart', split.twins, duration),
          nail_browse: constantScenario('nailBrowse', split.guest, duration),
        }),
      },
    };
  }

  const split = allocateLoadVus(total);
  const scenarios: Record<string, Scenario | undefined> = {};
  for (const [key, [scenario, exec]] of Object.entries(MIX_EXECS)) {
    const vus = split[key as keyof typeof MIX_EXECS];
    scenarios[scenario] =
      profile === 'baseline'
        ? rampingScenario(exec, vus, durationSec)
        : constantScenario(exec, vus, duration);
  }
  return { profile, total, durationSec, options: { ...base, scenarios: defined(scenarios) } };
}
