import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import {
  frGiftNotice,
  frGiftSelectReminder,
  frGiftShareCard,
  frGiftShareCardPdf,
  frGiverPromise,
} from './mailFr.js';

const register: PluginRegisterFn = async (api) => {
  api.registerEmailCatalog('gift-share-card:fr', frGiftShareCard);
  api.registerEmailCatalog('gift-notice:fr', frGiftNotice);
  api.registerEmailCatalog('gift-select-reminder:fr', frGiftSelectReminder);
  api.registerEmailCatalog('giver-promise:fr', frGiverPromise);
  api.registerEmailCatalog('gift-share-card-pdf:fr', frGiftShareCardPdf);
};

export { register };
export default register;
