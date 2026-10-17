import { afterEach, describe, expect, it } from 'vitest';
import {
  isGalleryLightboxRestorePending,
  setGalleryLightboxRestorePending,
} from '../../../../src/state/galleryLightboxRestorePending';

afterEach(() => {
  setGalleryLightboxRestorePending(false);
});

describe('gallery lightbox restore pending flag', () => {
  it('is visible to layout before the gallery grid layout effect', () => {
    expect(isGalleryLightboxRestorePending()).toBe(false);
    setGalleryLightboxRestorePending(true);
    expect(isGalleryLightboxRestorePending()).toBe(true);
  });
});
