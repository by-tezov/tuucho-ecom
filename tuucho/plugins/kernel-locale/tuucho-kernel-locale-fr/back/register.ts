import type { InvoiceRenderState, PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { ACCOUNT_EMAIL_COPY_FR } from './accountEmailFr.js';
import { frCustomSet } from './customSetFr.js';
import { frEmail } from './emailFr.js';
import { frGiftReceiver } from './giftReceiverFr.js';
import { INVOICE_COPY_FR } from './invoiceFr.js';

type InvoiceCtx = { order?: { language?: string | null } };

const register: PluginRegisterFn = async (api) => {
  api.registerLanguage({
    code: 'fr',
    nativeName: 'Français',
    ogLocale: 'fr_FR',
    dateLocale: 'fr-FR',
  });
  api.registerEmailCatalog('fr', frEmail);
  api.registerEmailCatalog('gift-receiver:fr', frGiftReceiver);
  api.registerEmailCatalog('custom-set:fr', frCustomSet);
  api.registerEmailCatalog('account-email:fr', ACCOUNT_EMAIL_COPY_FR);
  api.addFilter(CORE_OPENING_FILTERS.invoiceRender, (render: InvoiceRenderState, ctx: InvoiceCtx) => {
    const language = ctx?.order?.language ?? 'en';
    if (language !== 'fr') return render;
    return {
      ...render,
      language: INVOICE_COPY_FR.language,
      copy: INVOICE_COPY_FR,
    };
  });
};

export { register };
export default register;
