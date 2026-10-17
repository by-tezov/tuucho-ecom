import type { Strings } from '@kernel/front/assets/i18n/types';
import { about } from './strings/about';

/** French overlay. Merged onto kernel English when this locale plugin is on. */
export const catalog: Partial<Strings> = {
  about,
};
