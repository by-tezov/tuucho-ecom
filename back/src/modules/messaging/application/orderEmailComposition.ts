import type { Language } from '../../../utils/language.js';
import {
  groupOrderDisplayLines,
  type OrderDisplayGroup,
  type OrderDisplayLineInput,
  type OrderDisplayNailLine,
  type OrderDisplaySection,
} from '../../../utils/groupOrderDisplayLines.js';

/**
 * A composed set in the order emails, drawn like the shop's cart card: the
 * ten-finger picture (two rows of five, left pinky to thumb then right thumb
 * to pinky, an empty slot where no nail goes) and, under the line, each
 * hand's nails with their finger, shape, length and variation.
 */

const HAND_FINGERS = {
  left: ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb'],
  right: ['right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
} as const;

interface CompositionEmailStrings {
  handLeft: string;
  handRight: string;
  /** `{count}` nails out of `{max}`. */
  nailCount: string;
  fingers: Record<string, string>;
}

function fingers(left: string[], right: string[]): Record<string, string> {
  return Object.fromEntries([
    ...HAND_FINGERS.left.map((finger, index) => [finger, left[4 - index]!]),
    ...HAND_FINGERS.right.map((finger, index) => [finger, right[index]!]),
  ]);
}

/** Same copy as the shop's galleryNail strings. Fingers are listed thumb to
 * pinky for each hand. */
const COMPOSITION_EMAIL_STRINGS: Record<Language, CompositionEmailStrings> = {
  fr: {
    handLeft: 'Main gauche',
    handRight: 'Main droite',
    nailCount: '{count} / {max} ongles',
    fingers: fingers(
      ['Pouce gauche', 'Index gauche', 'Majeur gauche', 'Annulaire gauche', 'Auriculaire gauche'],
      ['Pouce droit', 'Index droit', 'Majeur droit', 'Annulaire droit', 'Auriculaire droit'],
    ),
  },
  en: {
    handLeft: 'Left hand',
    handRight: 'Right hand',
    nailCount: '{count} / {max} nails',
    fingers: fingers(
      ['Left thumb', 'Left index', 'Left middle', 'Left ring', 'Left pinky'],
      ['Right thumb', 'Right index', 'Right middle', 'Right ring', 'Right pinky'],
    ),
  },
  es: {
    handLeft: 'Mano izquierda',
    handRight: 'Mano derecha',
    nailCount: '{count} / {max} uñas',
    fingers: fingers(
      ['Pulgar izquierdo', 'Índice izquierdo', 'Medio izquierdo', 'Anular izquierdo', 'Meñique izquierdo'],
      ['Pulgar derecho', 'Índice derecho', 'Medio derecho', 'Anular derecho', 'Meñique derecho'],
    ),
  },
  it: {
    handLeft: 'Mano sinistra',
    handRight: 'Mano destra',
    nailCount: '{count} / {max} unghie',
    fingers: fingers(
      ['Pollice sinistro', 'Indice sinistro', 'Medio sinistro', 'Anulare sinistro', 'Mignolo sinistro'],
      ['Pollice destro', 'Indice destro', 'Medio destro', 'Anulare destro', 'Mignolo destro'],
    ),
  },
  nl: {
    handLeft: 'Linkerhand',
    handRight: 'Rechterhand',
    nailCount: '{count} / {max} nagels',
    fingers: fingers(
      ['Linkerduim', 'Linkerwijsvinger', 'Linkermiddelvinger', 'Linkerringvinger', 'Linkerpink'],
      ['Rechterduim', 'Rechterwijsvinger', 'Rechtermiddelvinger', 'Rechterringvinger', 'Rechterpink'],
    ),
  },
  pt: {
    handLeft: 'Mão esquerda',
    handRight: 'Mão direita',
    nailCount: '{count} / {max} unhas',
    fingers: fingers(
      ['Polegar esquerdo', 'Indicador esquerdo', 'Médio esquerdo', 'Anelar esquerdo', 'Mindinho esquerdo'],
      ['Polegar direito', 'Indicador direito', 'Médio direito', 'Anelar direito', 'Mindinho direito'],
    ),
  },
  th: {
    handLeft: 'มือซ้าย',
    handRight: 'มือขวา',
    nailCount: '{count} / {max} ชิ้น',
    fingers: fingers(
      ['นิ้วโป้งซ้าย', 'นิ้วชี้ซ้าย', 'นิ้วกลางซ้าย', 'นิ้วนางซ้าย', 'นิ้วก้อยซ้าย'],
      ['นิ้วโป้งขวา', 'นิ้วชี้ขวา', 'นิ้วกลางขวา', 'นิ้วนางขวา', 'นิ้วก้อยขวา'],
    ),
  },
};

export interface CompositionEmailView {
  nailCountLabel: string;
  /** Two rows of five cells; `photo` null for an empty slot. */
  mosaicRows: Array<{ cells: Array<{ photo: string | null; filled: boolean }> }>;
  hands: Array<{
    label: string;
    nails: Array<{
      title: string;
      productUid: string;
      photo: string | null;
      fingerLabel: string;
      shapeLengthLabel: string;
      variationLabel: string;
    }>;
  }>;
}

export function compositionEmailView(
  nails: OrderDisplayNailLine[],
  language: Language,
): CompositionEmailView {
  const strings = COMPOSITION_EMAIL_STRINGS[language];
  const byFinger = new Map(nails.map((nail) => [nail.finger, nail]));
  return {
    nailCountLabel: strings.nailCount.replace('{count}', String(nails.length)).replace('{max}', '10'),
    mosaicRows: (['left', 'right'] as const).map((hand) => ({
      cells: HAND_FINGERS[hand].map((finger) => {
        const nail = byFinger.get(finger);
        return { photo: nail?.photo ?? null, filled: nail !== undefined };
      }),
    })),
    hands: (['left', 'right'] as const).flatMap((hand) => {
      const handNails = HAND_FINGERS[hand].flatMap((finger) => {
        const nail = byFinger.get(finger);
        return nail ? [nail] : [];
      });
      if (handNails.length === 0) return [];
      return [
        {
          label: hand === 'left' ? strings.handLeft : strings.handRight,
          nails: handNails.map((nail) => ({
            title: nail.title,
            productUid: nail.productUid,
            photo: nail.photo,
            fingerLabel: strings.fingers[nail.finger] ?? nail.finger,
            shapeLengthLabel: [nail.shapeLabel, nail.lengthLabel].filter(Boolean).join(' · '),
            variationLabel: nail.variationLabel,
          })),
        },
      ];
    }),
  };
}

/** The words around an item line: the customer note's heading, the size
 * before its value and the product reference. Same copy as the shop's cart
 * (`cart.referenceLabel`, `galleryNail.sizeShort`). */
const ITEM_LABELS: Record<Language, { comment: string; size: string; ref: string }> = {
  fr: { comment: 'Commentaire', size: 'taille', ref: 'Réf.' },
  en: { comment: 'Comment', size: 'size', ref: 'Ref.' },
  es: { comment: 'Comentario', size: 'talla', ref: 'Referencia' },
  it: { comment: 'Commento', size: 'taglia', ref: 'Rif.' },
  nl: { comment: 'Opmerking', size: 'maat', ref: 'Ref.' },
  pt: { comment: 'Comentário', size: 'tamanho', ref: 'Ref.' },
  th: { comment: 'ความคิดเห็น', size: 'ไซซ์', ref: 'รหัส' },
};

export function orderItemLabels(language: Language): { comment: string; size: string; ref: string } {
  return ITEM_LABELS[language];
}

export function compositionFingerLabel(finger: string, language: Language): string {
  return COMPOSITION_EMAIL_STRINGS[language].fingers[finger] ?? finger;
}

const SECTION_ORDER: Record<OrderDisplaySection, number> = {
  nail: 0,
  composition: 1,
  accessory: 2,
  gift: 3,
};

/** Gift-recipient mail lists products only: a cart-rule gift stays in its
 * product section and loses the free-gift label. */
function asProductLines(groups: OrderDisplayGroup[]): OrderDisplayGroup[] {
  const next = groups.map((group) => {
    if (!group.isGift) return group;
    const section: OrderDisplaySection =
      group.nails.length > 0 ? 'composition' : group.shapeKey ? 'nail' : 'accessory';
    return { ...group, isGift: false, section };
  });
  next.sort((a, b) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section]);
  let last: OrderDisplaySection | undefined;
  for (const group of next) {
    group.sectionStart = group.section !== last;
    last = group.section;
  }
  return next;
}

/** The order emails' item table rows: display groups with their localized
 * section header, the customer's note and, for a composed set, its mosaic
 * and hands. `productOnly` is the gift-recipient view: no prices, no
 * free-gift labels. */
export function orderEmailItemGroups(
  items: OrderDisplayLineInput[],
  language: Language,
  sectionLabels: Record<OrderDisplaySection, string>,
  productOnly = false,
) {
  const groups = productOnly ? asProductLines(groupOrderDisplayLines(items)) : groupOrderDisplayLines(items);
  return groups.map((group) => ({
    ...group,
    sectionLabel: group.sectionStart ? sectionLabels[group.section] : null,
    commentLabel: ITEM_LABELS[language].comment,
    sizeLabel: ITEM_LABELS[language].size,
    refLabel: ITEM_LABELS[language].ref,
    composition: group.section === 'composition' ? compositionEmailView(group.nails, language) : null,
  }));
}
