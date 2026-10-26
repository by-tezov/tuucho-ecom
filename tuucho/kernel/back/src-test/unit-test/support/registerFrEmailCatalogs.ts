import { registerEmailCatalog } from '@tuucho/plugin-sdk';
import { ACCOUNT_EMAIL_COPY_EN } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-en/back/accountEmailEn.js';
import { enCustomSet } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-en/back/customSetEn.js';
import { enEmail } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-en/back/emailEn.js';
import { enGiftReceiver } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-en/back/giftReceiverEn.js';
import {
  enGiftNotice,
  enGiftSelectReminder,
  enGiftShareCard,
  enGiftShareCardPdf,
  enGiverPromise,
} from '../../../../../plugins/commerce/gift/tuucho-commerce-gift-locale-en/back/mailEn.js';
import { ACCOUNT_EMAIL_COPY_FR } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-fr/back/accountEmailFr.js';
import { frCustomSet } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-fr/back/customSetFr.js';
import { frEmail } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-fr/back/emailFr.js';
import { frGiftReceiver } from '../../../../../plugins/kernel-locale/tuucho-kernel-locale-fr/back/giftReceiverFr.js';
import {
  frGiftNotice,
  frGiftSelectReminder,
  frGiftShareCard,
  frGiftShareCardPdf,
  frGiverPromise,
} from '../../../../../plugins/commerce/gift/tuucho-commerce-gift-locale-fr/back/mailFr.js';

/** Unit tests that assert locale copy must register catalogs; plugins
 * are not loaded in kernel `test:unit`. */
export function registerFrEmailCatalogs(): void {
  registerEmailCatalog('en', enEmail);
  registerEmailCatalog('gift-receiver:en', enGiftReceiver);
  registerEmailCatalog('custom-set:en', enCustomSet);
  registerEmailCatalog('account-email:en', ACCOUNT_EMAIL_COPY_EN);
  registerEmailCatalog('gift-share-card:en', enGiftShareCard);
  registerEmailCatalog('gift-notice:en', enGiftNotice);
  registerEmailCatalog('gift-select-reminder:en', enGiftSelectReminder);
  registerEmailCatalog('giver-promise:en', enGiverPromise);
  registerEmailCatalog('gift-share-card-pdf:en', enGiftShareCardPdf);

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
