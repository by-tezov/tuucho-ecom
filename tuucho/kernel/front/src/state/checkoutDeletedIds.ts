/**
 * Address and payment method ids the customer explicitly deleted in this tab.
 * Cart edits only touch React state, so without this the cartBootstrapCache
 * snapshot (or a revalidate that raced the delete) repaints the deleted entry
 * on the next /cart visit and re-selects it. Ids are unique and deletes are
 * permanent, so the set never needs clearing.
 *
 * Persisted to sessionStorage (ids only, never a payload) because the
 * in-memory set alone was lost whenever a module reinstantiated — Vite's
 * dual-lane chunk loading, a chunk remount — and deleted checkout addresses
 * came back. sessionStorage keeps the original tab-scoped lifetime while
 * surviving that reinstantiation. Storage access is wrapped: private-mode
 * throws fall back to the in-memory set.
 */
const STORAGE_KEY = 'tuucho-checkout-deleted-ids';

const deletedIds = new Set<string>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      if (typeof id === 'string') deletedIds.add(id);
    }
  } catch {
    // Storage unavailable (private mode, quota): the in-memory set still works.
  }
}

/** The hydrated deleted-id set (lazy sessionStorage read on first access). */
export function deletedCheckoutIds(): Set<string> {
  hydrate();
  return deletedIds;
}

/** Records a delete and persists the set. cartBootstrapCache re-scrubs its
 * live entry itself after calling this. */
export function noteCheckoutEntityDeleted(id: string): void {
  hydrate();
  deletedIds.add(id);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...deletedIds]));
  } catch {
    // Same fallback: losing persistence only weakens cross-remount scrubbing.
  }
}
