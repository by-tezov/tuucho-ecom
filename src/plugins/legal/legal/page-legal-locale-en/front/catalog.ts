import type { Strings } from '@kernel/front/assets/i18n/types';
import { legalNotice } from './strings/legalNotice';
import { privacy } from './strings/privacy';
import { terms } from './strings/terms';
import { salesTerms } from './strings/salesTerms';

/** English values for legal page keys. */
export const catalog: Partial<Strings> = {
  legalNotice,
  privacy,
  terms,
  salesTerms,
};
