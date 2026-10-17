import type { Language } from '../../../utils/language.js';
import { groupOrderDisplayLines } from '../../../utils/groupOrderDisplayLines.js';
import { emailStrings } from './emailStrings.js';
import type { OrderEmailData } from './orderEmailData.js';
import { customSetFingerLabel, orderItemLabels } from './orderEmailCustomSet.js';

/** The plaintext alternative of the order emails' item table, in the same
 * language and with the same labels as the HTML copy. When `hidePrices` is
 * set (gift recipient with prices hidden), quantities stay and amounts go. */
export function formatOrderLines(
  order: OrderEmailData,
  language: Language,
  hidePrices = false,
): string {
  const labels = orderItemLabels(language);
  const free = emailStrings(language).orderConfirmation.giftFreeLabel;
  const sectionLabels = emailStrings(language).itemGroupLabels;
  return groupOrderDisplayLines(order.items)
    .map((group) => {
      const sizes = group.sizes
        .map((line) => {
          const descriptor =
            group.section === 'customSet' || group.shapeKey ? `${labels.size} ${line.size} ` : '';
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
                const finger = customSetFingerLabel(nail.finger, language);
                return `  · ${nail.title} (${[nail.shapeLabel, nail.lengthLabel, nail.variationLabel, finger].filter(Boolean).join(', ')})`;
              })
              .join('\n')
          : '';
      const ref = group.productUid ? `\n  ${labels.ref} ${group.productUid}` : '';
      const comment = group.comment ? `\n  ${labels.comment} : ${group.comment}` : '';
      const gift = !hidePrices && group.isGift ? ` · ${free}` : '';
      const variantLabel =
        group.section === 'customSet'
          ? null
          : group.shapeKey
            ? [group.shapeLabel, group.lengthLabel].filter(Boolean).join(' · ')
            : group.packLabel;
      const heading = group.sectionStart ? `-- ${sectionLabels[group.section]} --\n` : '';
      return `${heading}- ${group.title}${variantLabel ? ` (${variantLabel})` : ''}${gift}\n${sizes}${nailLines}${ref}${comment}`;
    })
    .join('\n');
}
