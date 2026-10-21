import { registerEmailCatalog } from '@tuucho/plugin-sdk';
import { ACCOUNT_EMAIL_COPY_FR } from '../../../../../plugins/locale/tuucho-locale-fr/back/accountEmailFr.js';
import { frCustomSet } from '../../../../../plugins/locale/tuucho-locale-fr/back/customSetFr.js';
import { frEmail } from '../../../../../plugins/locale/tuucho-locale-fr/back/emailFr.js';
import { frGiftReceiver } from '../../../../../plugins/locale/tuucho-locale-fr/back/giftReceiverFr.js';
import {
  frGiftNotice,
  frGiftSelectReminder,
  frGiftShareCard,
  frGiftShareCardPdf,
  frGiverPromise,
} from '../../../../../plugins/commerce/gift/tuucho-commerce-gift-locale-fr/back/mailFr.js';

/** Unit tests that assert French copy must register locale catalogs; plugins
 * are not loaded in kernel `test:unit`. */
export function registerFrEmailCatalogs(): void {
  registerEmailCatalog('fr', frEmail);
  registerEmailCatalog('gift-receiver:fr', frGiftReceiver);
  registerEmailCatalog('custom-set:fr', frCustomSet);
  registerEmailCatalog('account-email:fr', ACCOUNT_EMAIL_COPY_FR);
  registerEmailCatalog('gift-share-card:fr', frGiftShareCard);
  registerEmailCatalog('gift-notice:fr', frGiftNotice);
  registerEmailCatalog('gift-select-reminder:fr', frGiftSelectReminder);
  registerEmailCatalog('giver-promise:fr', frGiverPromise);
  registerEmailCatalog('gift-share-card-pdf:fr', frGiftShareCardPdf);
}
