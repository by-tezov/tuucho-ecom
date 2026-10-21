import { useState } from 'react';
import {
  submitAnonymousProductRequest,
  submitAuthenticatedProductRequest,
  type ProductRequest,
} from '../api/contact';
import { isBackendUnavailableError } from '../api/http';
import { useAuthSession } from '../state/AuthContext';

export type ProductRequestPhase = 'idle' | 'sending' | 'sent' | 'failed';

interface UseProductRequestOptions {
  /** The signed-in account's address, or null for a guest — who then types
   * the address the workshop should answer at. */
  accountEmail: string | null;
  /** Resolves once the request reached Shop; rejects on any failure. */
  submit: (email: string) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Ask Shop to make this" — shared by the two places a customer can
 * reach a sold-out variant: the cart's size picker (SelectionPickerModal)
 * and the out-of-stock line notice (OutOfStockModal). Owns the phase so
 * each modal can decide what its own dialog looks like in each one — the
 * confirmation replaces the whole body in both, which a self-contained
 * component couldn't do from the inside. */
export function useProductRequest({ accountEmail, submit }: UseProductRequestOptions) {
  const [phase, setPhase] = useState<ProductRequestPhase>('idle');
  const [email, setEmail] = useState(accountEmail ?? '');
  const sending = phase === 'sending';

  async function submitRequest() {
    if (sending || !EMAIL_RE.test(email.trim())) return;
    setPhase('sending');
    try {
      await submit(email.trim());
      setPhase('sent');
    } catch (error) {
      // Backend confirmed down: Layout's site-wide notice owns that case,
      // so don't stack a local "try again" on top of it.
      setPhase(isBackendUnavailableError(error) ? 'idle' : 'failed');
    }
  }

  return {
    phase,
    sending,
    email,
    setEmail,
    /** Guests type their own; a signed-in account never sees the field. */
    needsEmail: accountEmail === null,
    canSubmit: EMAIL_RE.test(email.trim()) && !sending,
    submitRequest,
    /** Drops a failure notice that no longer applies (e.g. the customer
     * picked a different size). */
    clearFailure: () => setPhase((current) => (current === 'failed' ? 'idle' : current)),
  };
}

export type ProductRequestState = ReturnType<typeof useProductRequest>;

/** Sends one made-to-order request, picking the right endpoint for the
 * current session: signed in, the customer's address and id are read from
 * the token server-side and `email` is ignored; as a guest, the typed
 * address is the only way back to them. Shared by every entry point (the
 * cart's size picker and out-of-stock notice, the gallery's "request your
 * size") so none of them can drift on which endpoint to call. */
export function useSubmitProductRequest(): (request: ProductRequest, email: string) => Promise<void> {
  const { status, authedRequest } = useAuthSession();
  return async (request, email) => {
    if (status === 'authenticated') {
      await authedRequest((token) => submitAuthenticatedProductRequest(token, request));
      return;
    }
    await submitAnonymousProductRequest({ ...request, email });
  };
}
