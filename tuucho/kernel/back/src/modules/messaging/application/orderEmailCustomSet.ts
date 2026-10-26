import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '../../../utils/language.js';
import { emailStrings } from './emailStrings.js';
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

interface CustomSetEmailStrings {
  handLeft: string;
  handRight: string;
  /** `{count}` nails out of `{max}`. */
  nailCount: string;
  fingers: Record<string, string>;
}

export interface CustomSetEmailView {
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

export function customSetEmailView(
  nails: OrderDisplayNailLine[],
  language: Language,
): CustomSetEmailView {
  const strings = localizedCatalog<CustomSetEmailStrings>(language, 'custom-set');
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
 * before its value and the product reference. Same keys as the shop's cart
 * (`cart.referenceLabel`, `galleryNail.sizeShort`); values from locale packs. */
export function orderItemLabels(language: Language): { comment: string; size: string; ref: string } {
  return emailStrings(language).itemLabels;
}

export function customSetFingerLabel(finger: string, language: Language): string {
  return localizedCatalog<CustomSetEmailStrings>(language, 'custom-set').fingers[finger] ?? finger;
}

const SECTION_ORDER: Record<OrderDisplaySection, number> = {
  nail: 0,
  customSet: 1,
  accessory: 2,
  gift: 3,
};

/** Gift-recipient mail lists products only: a cart-rule gift stays in its
 * product section and loses the free-gift label. */
function asProductLines(groups: OrderDisplayGroup[]): OrderDisplayGroup[] {
  const next = groups.map((group) => {
    if (!group.isGift) return group;
    const section: OrderDisplaySection =
      group.nails.length > 0 ? 'customSet' : group.shapeKey ? 'nail' : 'accessory';
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
    commentLabel: orderItemLabels(language).comment,
    sizeLabel: orderItemLabels(language).size,
    refLabel: orderItemLabels(language).ref,
    customSet: group.section === 'customSet' ? customSetEmailView(group.nails, language) : null,
  }));
}
