import type { CapsuleFormKey } from '../../../data/capsuleForms';
import type { CapsuleLengthKey } from '../../../data/capsuleLengths';

export interface CapsuleFormStrings {
  name: string;
  desc: string;
  /** base alt for the form's photo carousel (the slide index is appended) */
  alt: string;
}

export interface CapsuleLengthStrings {
  name: string;
  desc: string;
  /** alt for the length's photo — same hand, same shape, this length only */
  alt: string;
}

export interface CapsulesStrings {
  eyebrow: string;
  title: string;
  intro: string;
  shapesTitle: string;
  shapesSub: string;
  forms: Record<CapsuleFormKey, CapsuleFormStrings>;
  lengthsTitle: string;
  lengthsSub: string;
  lengths: Record<CapsuleLengthKey, CapsuleLengthStrings>;
  /** label of the shape field opening the shape picker (sheet on mobile) */
  lengthsShapeLabel: string;
  /** title of the shape picker sheet/dialog */
  lengthsShapePickerTitle: string;
  lengthsTableTitle: string;
  /** the measurements are indicative, not a guarantee */
  lengthsNote: string;
  /** "consult the size guide for the width" sentence after lengthsNote,
   *  split around its inline link to /sizes (word order differs per
   *  language) */
  lengthsNoteSizesBefore: string;
  lengthsNoteSizesLink: string;
  lengthsNoteSizesAfter: string;

  /** bottom-of-page note: other shapes/lengths exist on request, split
   *  around its inline link to /contact */
  moreNoteBefore: string;
  moreNoteLink: string;
  moreNoteAfter: string;
  lengthUnavailable: string;
}
