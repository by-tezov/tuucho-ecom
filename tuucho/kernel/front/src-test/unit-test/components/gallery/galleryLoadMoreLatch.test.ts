import { describe, expect, it } from 'vitest';
import { nextGalleryLoadMoreLatch } from '@/components/gallery/galleryLoadMoreLatch';

describe('nextGalleryLoadMoreLatch', () => {
  it('fires once when the visitor reaches the end with more pages available', () => {
    const fired = nextGalleryLoadMoreLatch({
      latched: false,
      atEnd: true,
      hasMore: true,
      loadingMore: false,
    });
    expect(fired).toEqual({ latched: true, fire: true });

    const again = nextGalleryLoadMoreLatch({ latched: true, atEnd: true, hasMore: true, loadingMore: true });
    expect(again).toEqual({ latched: true, fire: false });
  });

  it('re-arms when the fetch finishes, so a parked visitor is not stuck on page 2', () => {
    const afterFetch = nextGalleryLoadMoreLatch({
      latched: true,
      atEnd: true,
      hasMore: true,
      loadingMore: false,
    });
    expect(afterFetch).toEqual({ latched: true, fire: true });
  });

  it('unlatches when the visitor leaves the end of the grid', () => {
    expect(
      nextGalleryLoadMoreLatch({ latched: true, atEnd: false, hasMore: true, loadingMore: false }),
    ).toEqual({
      latched: false,
      fire: false,
    });
    expect(
      nextGalleryLoadMoreLatch({ latched: true, atEnd: false, hasMore: true, loadingMore: true }),
    ).toEqual({
      latched: false,
      fire: false,
    });
  });

  it('never fires without a next page, and drops the latch there', () => {
    expect(
      nextGalleryLoadMoreLatch({ latched: true, atEnd: true, hasMore: false, loadingMore: false }),
    ).toEqual({
      latched: false,
      fire: false,
    });
  });
});
