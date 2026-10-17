const STORAGE_PREFIX = 'psn-gallery-nail-edit:';

export type GalleryNailEditDraft = {
  size: string;
  quantity: number;
  nails: Array<{
    productId: string;
    productUid: string;
    title: string;
    shapeKey: string;
    lengthKey: string;
    shapeLabel: string;
    lengthLabel: string;
    finger: string;
    /** Variation option; absent in drafts written before variations. */
    variationKey?: string;
    photo: string | null;
  }>;
};

/**
 * Draft ids. Both kinds of draft follow the cart's owner, exactly like the
 * cart itself, so leaving the composer (or the tab) never loses the thread:
 * - a set composed from scratch: `new:<owner>`;
 * - unsaved changes to a set of the cart being modified: `edit:<owner>:<id>`
 *   (the cart keeps showing the saved version until "Mettre à jour").
 *
 * Owners:
 * - guest: kept like the guest cart (localStorage). At sign-in the guest's
 *   new set is parked with the guest cart merge (mergeGuestStateIntoAccount)
 *   and handed to the account the first time its draft is read
 *   (adoptGuestComposeDraft); its edit drafts are dropped, the merged sets
 *   get new ids in the account;
 * - signed in: kept per account (localStorage, keyed by user id), dropped at
 *   sign-out with the account's other cached data (clearAccountComposeDrafts
 *   from invalidateCartBootstrapCache('logout')), so the next person on the
 *   browser never sees them;
 * - gift receiver: its own drafts per gift, for the tab only, since the gift
 *   basket is a separate cart.
 */
const NEW_DRAFT = 'new:';
const EDIT_DRAFT = 'edit:';
const GUEST_OWNER = 'guest';
const USER_OWNER_PREFIX = 'user:';
const GIFT_OWNER_PREFIX = 'gift:';
const GUEST_DRAFT = `${NEW_DRAFT}${GUEST_OWNER}`;
/** A guest draft taken over by a sign-in, not yet read by the account. */
const SIGN_IN_DRAFT = `${NEW_DRAFT}sign-in`;

type DraftOwner = {
  status: 'loading' | 'authenticated' | 'anonymous';
  userId: string | undefined;
  giftToken: string | null;
};

/** The cart's owner as a draft scope; null while sign-in is still resolving
 * (the owner is not known yet, like the product cache). */
function ownerScope(owner: DraftOwner): string | null {
  if (owner.giftToken) return `${GIFT_OWNER_PREFIX}${owner.giftToken}`;
  if (owner.status === 'loading') return null;
  if (owner.status === 'authenticated') return owner.userId ? `${USER_OWNER_PREFIX}${owner.userId}` : null;
  return GUEST_OWNER;
}

/** The new-set draft for the current cart owner, or null (owner unknown). */
export function newCompositionDraftId(owner: DraftOwner): string | null {
  const scope = ownerScope(owner);
  return scope ? `${NEW_DRAFT}${scope}` : null;
}

/** The unsaved changes to one set of the cart, or null (owner unknown). */
export function editCompositionDraftId(owner: DraftOwner, compositionId: string): string | null {
  const scope = ownerScope(owner);
  return scope ? `${EDIT_DRAFT}${scope}:${compositionId}` : null;
}

export function isNewCompositionDraft(draftId: string): boolean {
  return draftId.startsWith(NEW_DRAFT);
}

export function editDraftKey(draftId: string): string {
  return `${STORAGE_PREFIX}${draftId}`;
}

function storageFor(draftId: string): Storage {
  const giftDraft =
    draftId.startsWith(`${NEW_DRAFT}${GIFT_OWNER_PREFIX}`) ||
    draftId.startsWith(`${EDIT_DRAFT}${GIFT_OWNER_PREFIX}`);
  return giftDraft ? window.sessionStorage : window.localStorage;
}

function removeLocalKeys(match: (key: string) => boolean): void {
  for (const key of Object.keys(window.localStorage).filter(match)) window.localStorage.removeItem(key);
}

function moveDraft(from: string, to: string, onlyIfEmpty: boolean): void {
  const value = window.localStorage.getItem(editDraftKey(from));
  if (!value) return;
  if (!onlyIfEmpty || !window.localStorage.getItem(editDraftKey(to))) {
    window.localStorage.setItem(editDraftKey(to), value);
  }
  window.localStorage.removeItem(editDraftKey(from));
}

/** Sign-in, with the guest cart merge: the guest slots are emptied at once,
 * whichever way the sign-in ends. */
export function parkGuestComposeDraftForSignIn(): void {
  if (typeof window === 'undefined') return;
  try {
    moveDraft(GUEST_DRAFT, SIGN_IN_DRAFT, false);
    const guestEdits = editDraftKey(`${EDIT_DRAFT}${GUEST_OWNER}:`);
    removeLocalKeys((key) => key.startsWith(guestEdits));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/** The signed-in account takes the parked guest set. When it already has
 * one of its own, that one is kept and the guest's is dropped: only one set
 * is composed at a time. */
export function adoptGuestComposeDraft(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    moveDraft(SIGN_IN_DRAFT, `${NEW_DRAFT}${USER_OWNER_PREFIX}${userId}`, true);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/** At sign-out: no account's unfinished set or edit stays readable in the
 * browser. */
export function clearAccountComposeDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    const accountNew = editDraftKey(`${NEW_DRAFT}${USER_OWNER_PREFIX}`);
    const accountEdits = editDraftKey(`${EDIT_DRAFT}${USER_OWNER_PREFIX}`);
    removeLocalKeys(
      (key) =>
        key.startsWith(accountNew) || key.startsWith(accountEdits) || key === editDraftKey(SIGN_IN_DRAFT),
    );
  } catch {
    // Storage blocked: nothing was kept.
  }
}

export function readEditDraft(draftId: string): GalleryNailEditDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = storageFor(draftId).getItem(editDraftKey(draftId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as GalleryNailEditDraft;
  } catch {
    return null;
  }
}

export function writeEditDraft(draftId: string, draft: GalleryNailEditDraft): void {
  if (typeof window === 'undefined') return;
  // An emptied new set leaves nothing behind; an emptied edit is a real
  // unsaved change and stays.
  if (isNewCompositionDraft(draftId) && draft.nails.length === 0) {
    clearEditDraft(draftId);
    return;
  }
  try {
    storageFor(draftId).setItem(editDraftKey(draftId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked (private mode): the draft just isn't kept.
  }
}

export function clearEditDraft(draftId: string): void {
  if (typeof window === 'undefined') return;
  try {
    storageFor(draftId).removeItem(editDraftKey(draftId));
  } catch {
    // Storage blocked: nothing was kept either.
  }
}
