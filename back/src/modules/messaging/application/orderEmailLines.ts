import type { Language } from '../../../utils/language.js';
import { groupOrderDisplayLines } from '../../../utils/groupOrderDisplayLines.js';
import { EMAIL_STRINGS } from './emailStrings.js';
import type { OrderEmailData } from './orderEmailData.js';
import { compositionFingerLabel, orderItemLabels } from './orderEmailComposition.js';

/** The plaintext alternative of the order emails' item table, in the same
 * language and with the same labels as the HTML copy. When `hidePrices` is
 * set (gift recipient with prices hidden), quantities stay and amounts go. */
export function formatOrderLines(
  order: OrderEmailData,
  language: Language,
  hidePrices = false,
): string {
  const labels = orderItemLabels(language);
  const free = EMAIL_STRINGS[language].orderConfirmation.giftFreeLabel;
  const sectionLabels = EMAIL_STRINGS[language].itemGroupLabels;
  return groupOrderDisplayLines(order.items)
    .map((group) => {
      const sizes = group.sizes
        .map((line) => {
          const descriptor =
            group.section === 'composition' || group.shapeKey ? `${labels.size} ${line.size} ` : '';
          if (hidePrices) return `  - ${descriptor}x${line.quantity}`;
          const amount = group.isGift ? free : `${line.lineTotal.toFixed(2)} €`;
          return `  - ${descriptor}x${line.quantity} : ${amount}`;
        })
        .join('\n');
      const nailLines =
        group.nails.length > 0
          ? '\n' +
            group.nails
              .map((nail) => {
                const finger = compositionFingerLabel(nail.finger, language);
                return `  · ${nail.title} (${[nail.shapeLabel, nail.lengthLabel, nail.variationLabel, finger].filter(Boolean).join(', ')})`;
              })
              .join('\n')
          : '';
      const ref = group.productUid ? `\n  ${labels.ref} ${group.productUid}` : '';
      const comment = group.comment ? `\n  ${labels.comment} : ${group.comment}` : '';
      const gift = !hidePrices && group.isGift ? ` · ${free}` : '';
      const variantLabel =
        group.section === 'composition'
          ? null
          : group.shapeKey
            ? [group.shapeLabel, group.lengthLabel].filter(Boolean).join(' · ')
            : group.packLabel;
      const heading = group.sectionStart ? `-- ${sectionLabels[group.section]} --\n` : '';
      return `${heading}- ${group.title}${variantLabel ? ` (${variantLabel})` : ''}${gift}\n${sizes}${nailLines}${ref}${comment}`;
    })
    .join('\n');
}
