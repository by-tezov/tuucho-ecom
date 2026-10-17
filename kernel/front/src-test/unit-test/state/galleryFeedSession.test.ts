import { afterEach, describe, expect, it } from 'vitest';
import type { GalleryItem } from '@/data/types';
import {
  clearGalleryFeedSession,
  readGalleryFeedSession,
  writeGalleryFeedSession,
  type GalleryFeedSession,
} from '@/state/galleryFeedSession';

const item = { productUid: 'set-1' } as GalleryItem;

function session(overrides: Partial<GalleryFeedSession> = {}): GalleryFeedSession {
  return {
    apiLanguage: 'fr',
    status: 'anonymous',
    favoriteIdsKey: '',
    filters: { occasion: [], shape: [], length: [] },
    sizes: [],
    favoritesOnly: false,
    userLibraryOnly: false,
    hasUserLibraryItems: false,
    stockFilter: 'in',
    priceRange: null,
    items: [item],
    totalCount: 1,
    nextCursor: null,
    giftReceiverToken: null,
    ...overrides,
  };
}

afterEach(() => {
  clearGalleryFeedSession();
});

describe('galleryFeedSession', () => {
  it('restores the shop feed and ignores a gift-tab session', () => {
    writeGalleryFeedSession(session({ giftReceiverToken: 'gift-1', items: [item] }));
    expect(readGalleryFeedSession('fr', 'anonymous', [])).toBeNull();

    writeGalleryFeedSession(session({ giftReceiverToken: null }));
    expect(readGalleryFeedSession('fr', 'anonymous', [])?.items).toEqual([item]);
  });

  it('restores a gift feed only for the same receiver token', () => {
    writeGalleryFeedSession(session({ giftReceiverToken: 'gift-1' }));
    expect(readGalleryFeedSession('fr', 'anonymous', [], 'gift-1')?.items).toEqual([item]);
    expect(readGalleryFeedSession('fr', 'anonymous', [], 'other')).toBeNull();
  });

  it('does not restore a gift feed after remaining budget changes', () => {
    writeGalleryFeedSession(session({ giftReceiverToken: 'gift-1', giftRemainingBudget: 40 }));
    expect(readGalleryFeedSession('fr', 'anonymous', [], 'gift-1', 40)?.items).toEqual([item]);
    expect(readGalleryFeedSession('fr', 'anonymous', [], 'gift-1', 5)).toBeNull();
  });
});
