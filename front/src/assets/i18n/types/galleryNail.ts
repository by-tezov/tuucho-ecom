export interface GalleryNailStrings {
  pageEyebrow: string;
  title: string;
  sub: string;
  addToCart: string;
  updateCart: string;
  cancelEdit: string;
  totalLabel: string;
  quantityLabel: string;
  sizeLabel: string;
  maxNails: string;
  removeNail: string;
  editConfirmTitle: string;
  editConfirmMessage: string;
  editConfirmAction: string;
  /** Dialog shown when the cart sends the customer back to a set under modification. */
  editRedirectTitle: string;
  editRedirectMessage: string;
  editRedirectAction: string;
  compositionTitle: string;
  fingers: Record<
    | 'left-thumb'
    | 'left-index'
    | 'left-middle'
    | 'left-ring'
    | 'left-pinky'
    | 'right-thumb'
    | 'right-index'
    | 'right-middle'
    | 'right-ring'
    | 'right-pinky',
    string
  >;

  handLeft: string;
  handRight: string;
  handsLabel: string;
  legendEmpty: string;
  legendTaken: string;
  legendSelected: string;
  legendChosen: string;
  moveNail: string;
  /** Under the hands legend: how to move a nail (tap-then-tap or drag). */
  moveHelp: string;
  /** Replaces moveHelp while a nail is picked up; {title} is its name. */
  moveSelected: string;
  pickFingerTitle: string;
  pickFingerNote: string;
  /** Zoom modal add button; {finger} is the lowercased finger name. */
  pickFingerCta: string;
  pickFingerNone: string;
  pickFingerFull: string;
  emptySlotAdd: string;
  emptySlotDrop: string;
  /** Nail page CTA, opens this nail in the composer. */
  composeWithNail: string;
  /** Nail page: what buying a single nail means. */
  singleNailNote: string;
  nailsOne: string;
  nailsMany: string;
  sizeShort: string;

  blockedEmpty: string;

  blockedNoFinger: string;

  blockedDuplicateFinger: string;

  /** The chosen set size is not offered for a nail already in the set.
   * Shape and length that are not offered never appear in the pickers. */
  blockedUnavailable: string;

  /** Second line of the carousel stamp. The first line is `sizeShort`. */
  unavailableStamp: string;

  nailCount: string;

  loadingSet: string;

  /** Shown while "Mettre à jour le panier" writes the set back to the cart. */
  updatingCart: string;

  /** Label beside the sizes this nail's shape, length and option are made in. */
  availableSizesLabel: string;

  /** Body of the composition size-request dialog. `{size}` is the set size. */
  compositionSizeRequestText: string;

  /** Notice under the composition size-request form. */
  compositionSizeRequestNotice: string;
}
