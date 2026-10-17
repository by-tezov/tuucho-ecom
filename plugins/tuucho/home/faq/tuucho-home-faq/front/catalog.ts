import type { Strings } from '@kernel/front/assets/i18n/types';
import { FAQ_ITEMS } from './faqItems';

/** English overlay. Merged onto kernel English when this plugin is on. */
export const catalog: Partial<Strings> = {
  faq: {
    title: 'Frequently asked questions',
    items: FAQ_ITEMS,
  },
};
