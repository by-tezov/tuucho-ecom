import type { Strings } from '@kernel/front/assets/i18n/types';
import { legalNotice } from './strings/legalNotice';
import { privacy } from './strings/privacy';
import { terms } from './strings/terms';
import { salesTerms } from './strings/salesTerms';

/** French overlay. Merged onto kernel English when this locale plugin is on. */
export const catalog: Partial<Strings> = {
  legalNotice,
  privacy,
  terms,
  salesTerms,
};
