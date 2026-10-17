import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getGiverPortal, type GiftSummary } from '../../api/gift';
import type { AuthSessionContextValue, AuthStatus } from '../../state/AuthContext';

type AuthedRequest = AuthSessionContextValue['authedRequest'];

/** The giver's own view of the offer sitting on this cart. Null whenever the
 * active cart is not a gift cart, or the shopper is not signed in. The setter
 * comes back with it: the cart's own dialogs (cancel, extend) already hold a
 * fresher summary than a refetch would give. */
export function useGiverPortalSummary(args: {
  isGiftCart: boolean;
  giverToken: string | null | undefined;
  status: AuthStatus;
  authedRequest: AuthedRequest;
}): [GiftSummary | null, Dispatch<SetStateAction<GiftSummary | null>>] {
  const { isGiftCart, giverToken, status, authedRequest } = args;
  const [giftSummary, setGiftSummary] = useState<GiftSummary | null>(null);

  useEffect(() => {
    if (!isGiftCart || !giverToken || status !== 'authenticated') {
      setGiftSummary(null);
      return;
    }
    let cancelled = false;
    void authedRequest((access) => getGiverPortal(giverToken, access))
      .then((summary) => {
        if (!cancelled) setGiftSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setGiftSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isGiftCart, giverToken, status, authedRequest]);

  return [giftSummary, setGiftSummary];
}
