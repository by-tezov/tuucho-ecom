import type { InvoiceRenderState, PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { ACCOUNT_EMAIL_COPY_EN } from './accountEmailEn.js';
import { enCustomSet } from './customSetEn.js';
import { enEmail } from './emailEn.js';
import { enGiftReceiver } from './giftReceiverEn.js';
import { INVOICE_COPY_EN } from './invoiceEn.js';

type InvoiceCtx = { order?: { language?: string | null } };

const register: PluginRegisterFn = async (api) => {
  api.registerEmailCatalog('en', enEmail);
  api.registerEmailCatalog('gift-receiver:en', enGiftReceiver);
  api.registerEmailCatalog('custom-set:en', enCustomSet);
  api.registerEmailCatalog('account-email:en', ACCOUNT_EMAIL_COPY_EN);
  api.addFilter(CORE_OPENING_FILTERS.invoiceRender, (render: InvoiceRenderState, ctx: InvoiceCtx) => {
    const language = ctx?.order?.language ?? 'en';
    if (language !== 'en') return render;
    return {
      ...render,
      language: INVOICE_COPY_EN.language,
      copy: INVOICE_COPY_EN,
    };
  });
};

export { register };
export default register;
