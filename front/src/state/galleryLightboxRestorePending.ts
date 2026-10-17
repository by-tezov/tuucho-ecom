/** Set during GalleryPage render so Layout's scroll restore (parent layout)
 * can skip before GalleryGrid aligns the virtualized row. */
let lightboxRestorePending = false;

export function isGalleryLightboxRestorePending(): boolean {
  return lightboxRestorePending;
}

export function setGalleryLightboxRestorePending(pending: boolean): void {
  lightboxRestorePending = pending;
}
