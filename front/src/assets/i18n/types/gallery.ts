export interface GalleryStrings {
  pageEyebrow: string;
  title: string;
  sub: string;
  filtersToggle: string;
  reset: string;
  /** Filter sheet/dialog footer: discards the whole in-progress selection
   * back to defaults without closing (see applyFilters below, which does
   * close) — "reset everything in the sheet", vs. each section's own
   * `reset` link above, which only clears that one section. */
  clearFilters: string;
  /** Filter sheet/dialog footer: commits the in-progress selection — filters
   * only take effect on this, never per-chip. */
  applyFilters: string;
  empty: string;
  emptyFavorites: string;
  one: string;
  many: string;
  altPrefix: string;
  photoLabel: string;
  prevPhoto: string;
  nextPhoto: string;
  goToPhoto: string;
  close: string;
  /** aria-label for the card's zoom button — opens the product modal (PhotoLightbox) */
  zoomAlt: string;
  favoriteAdd: string;
  favoriteRemove: string;
  /** aria-label for the card's share button (Web Share API) */
  shareLabel: string;
  favoritesFilterLabel: string;
  userLibraryFilterLabel: string;
  /** Availability section of the filter sheet/dialog: which half of the
   * catalogue the grid shows. Sold-out designs are hidden unless `Out` (or
   * `All`) is picked. */
  stockFilterAria: string;
  /** Short heading for the Availabilité section inside the filter sheet. */
  stockFilterSectionLabel: string;
  stockFilterIn: string;
  stockFilterOut: string;
  /** Short heading for the Prix section inside the filter sheet. */
  priceRangeSectionLabel: string;
  priceRangeMinAria: string;
  priceRangeMaxAria: string;
  userLibraryMarkerLabel: string;
  addToCartAria: string;
  sizeLabel: string;
  addToCartCta: string;
  /** Short label for the card's compact add-to-cart button (vs. the fuller
   * addToCartCta used in the product modal). */
  addCta: string;
  /** Shown in place of the size selector when the active shape currently
   * has no size in stock — Add to cart stays disabled until another shape
   * or size is chosen. */
  outOfStockNotice: string;
  /** Button under that notice, and the dialog it opens (SizeRequestModal):
   * pick a size and ask for that shape to be made in it. A muted chip in
   * the zoom modal can pass that size in as initialSize. */
  sizeRequestCta: string;
  sizeRequestTitle: string;
  sizeRequestText: string;
  /** Replaces the usual request notice until a size is picked. */
  sizeRequestPickSize: string;
  sizeRequestNotice: string;
  /** Link to check a size from a product modal. */
  sizeGuideLink: string;
  /** Photo counter suffix in the product modal on desktop (scroll / double-click). */
  zoomHint: string;
  /** Photo counter suffix on touch devices (pinch / double-tap). */
  zoomHintMobile: string;
  trustSecurePayment: string;
  trustMadeAndShipped: string;
  trustTracked: string;
  trustHandmadeFrance: string;
  /** Accessible label for the card-local retry control after the bounded
   * thumbnail and modal-image attempts both fail. */
  imageRetry: string;

  zoomKeyboardHint: string;
}
