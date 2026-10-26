import { getEmailCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '../../../utils/language.js';
import type { EmailStrings } from './emailStringTypes.js';

export type {
  EmailStrings,
  LoyaltyExpiryReminderStrings,
  OrderCancelledStrings,
  OrderConfirmationStrings,
  OrderItemGroupLabels,
  OrderShippedStrings,
  OrderUpdatedStrings,
} from './emailStringTypes.js';

/** Order/loyalty email values for the active language. Registered by
 * `tuucho-kernel-locale-en` / `tuucho-kernel-locale-fr`. */
export function emailStrings(language: Language): EmailStrings {
  const catalog = getEmailCatalog<EmailStrings>(language);
  if (!catalog) {
    throw new Error(`Email catalog not registered: ${language}`);
  }
  return catalog;
}
