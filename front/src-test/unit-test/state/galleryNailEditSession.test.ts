import { describe, expect, it } from 'vitest';
import {
  adoptGuestComposeDraft,
  clearAccountComposeDrafts,
  clearEditDraft,
  editCompositionDraftId,
  editDraftKey,
  isNewCompositionDraft,
  newCompositionDraftId,
  parkGuestComposeDraftForSignIn,
  readEditDraft,
  writeEditDraft,
  type GalleryNailEditDraft,
} from '../../../src/state/galleryNailEditSession';

const draft = (nails: GalleryNailEditDraft['nails'] = [{ productId: 'p1' } as GalleryNailEditDraft['nails'][number]]): GalleryNailEditDraft => ({
  size: 'M',
  quantity: 1,
  nails,
});

describe('galleryNailEditSession draft ids', () => {
  it('builds new and edit ids from the cart owner', () => {
    expect(newCompositionDraftId({ status: 'loading', userId: undefined, giftToken: null })).toBeNull();
    expect(newCompositionDraftId({ status: 'anonymous', userId: undefined, giftToken: null })).toBe(
      'new:guest',
    );
    expect(
      newCompositionDraftId({ status: 'authenticated', userId: 'u1', giftToken: null }),
    ).toBe('new:user:u1');
    expect(
      editCompositionDraftId({ status: 'authenticated', userId: 'u1', giftToken: null }, 'c9'),
    ).toBe('edit:user:u1:c9');
    expect(
      newCompositionDraftId({ status: 'anonymous', userId: undefined, giftToken: 'gift-tok' }),
    ).toBe('new:gift:gift-tok');
  });

  it('recognizes new drafts and storage keys', () => {
    expect(isNewCompositionDraft('new:guest')).toBe(true);
    expect(isNewCompositionDraft('edit:guest:c1')).toBe(false);
    expect(editDraftKey('new:guest')).toBe('psn-gallery-nail-edit:new:guest');
  });
});

describe('galleryNailEditSession persistence', () => {
  it('clears an emptied new draft and keeps an emptied edit', () => {
    writeEditDraft('new:guest', draft());
    expect(readEditDraft('new:guest')?.nails).toHaveLength(1);

    writeEditDraft('new:guest', draft([]));
    expect(readEditDraft('new:guest')).toBeNull();

    writeEditDraft('edit:guest:c1', draft());
    writeEditDraft('edit:guest:c1', draft([]));
    expect(readEditDraft('edit:guest:c1')).toEqual({ size: 'M', quantity: 1, nails: [] });
  });

  it('parks the guest new draft for sign-in and drops guest edits', () => {
    writeEditDraft('new:guest', draft([{ productId: 'guest-nail' } as GalleryNailEditDraft['nails'][number]]));
    writeEditDraft('edit:guest:c1', draft());

    parkGuestComposeDraftForSignIn();

    expect(readEditDraft('new:guest')).toBeNull();
    expect(readEditDraft('edit:guest:c1')).toBeNull();
    expect(readEditDraft('new:sign-in')?.nails[0]?.productId).toBe('guest-nail');
  });

  it('adopts a parked draft only when the account has none yet', () => {
    writeEditDraft('new:sign-in', draft([{ productId: 'parked' } as GalleryNailEditDraft['nails'][number]]));
    adoptGuestComposeDraft('u1');
    expect(readEditDraft('new:sign-in')).toBeNull();
    expect(readEditDraft('new:user:u1')?.nails[0]?.productId).toBe('parked');

    writeEditDraft('new:sign-in', draft([{ productId: 'later' } as GalleryNailEditDraft['nails'][number]]));
    writeEditDraft('new:user:u1', draft([{ productId: 'mine' } as GalleryNailEditDraft['nails'][number]]));
    adoptGuestComposeDraft('u1');
    expect(readEditDraft('new:user:u1')?.nails[0]?.productId).toBe('mine');
    expect(readEditDraft('new:sign-in')).toBeNull();
  });

  it('clears account drafts at sign-out', () => {
    writeEditDraft('new:user:u1', draft());
    writeEditDraft('edit:user:u1:c1', draft());
    writeEditDraft('new:sign-in', draft());
    writeEditDraft('new:guest', draft());

    clearAccountComposeDrafts();

    expect(readEditDraft('new:user:u1')).toBeNull();
    expect(readEditDraft('edit:user:u1:c1')).toBeNull();
    expect(readEditDraft('new:sign-in')).toBeNull();
    expect(readEditDraft('new:guest')?.nails).toHaveLength(1);
  });

  it('clearEditDraft removes one key', () => {
    writeEditDraft('new:guest', draft());
    clearEditDraft('new:guest');
    expect(readEditDraft('new:guest')).toBeNull();
  });
});
