import { useEffect, useState } from 'react';
import { probeWalletAvailability } from './probeWalletAvailability';

export type WalletAvailability = {
  googlePay: boolean;
  applePay: boolean;
  /** False until the wallet probe resolves (or fails). Do not clear a
   * restored cart wallet sentinel until this is true. */
  ready: boolean;
};

const PENDING: WalletAvailability = { googlePay: false, applePay: false, ready: false };

/**
 * React wrapper around {@link probeWalletAvailability} for pages that need
 * a live subscription (e.g. payment-methods). Cart bootstrap awaits the
 * promise form directly so first paint does not depend on this hook.
 */
export function useWalletAvailability(): WalletAvailability {
  const [availability, setAvailability] = useState<WalletAvailability>(PENDING);

  useEffect(() => {
    let cancelled = false;
    void probeWalletAvailability().then((next) => {
      if (!cancelled) setAvailability(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
