import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import {
  enGiftNotice,
  enGiftSelectReminder,
  enGiftShareCard,
  enGiftShareCardPdf,
  enGiverPromise,
} from './mailEn.js';

const register: PluginRegisterFn = async (api) => {
  api.registerEmailCatalog('gift-share-card:en', enGiftShareCard);
  api.registerEmailCatalog('gift-notice:en', enGiftNotice);
  api.registerEmailCatalog('gift-select-reminder:en', enGiftSelectReminder);
  api.registerEmailCatalog('giver-promise:en', enGiverPromise);
  api.registerEmailCatalog('gift-share-card-pdf:en', enGiftShareCardPdf);
};

export { register };
export default register;
