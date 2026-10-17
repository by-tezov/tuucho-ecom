import type { Strings } from '@kernel/front/assets/i18n/types';
import { newArrivals } from './strings/newArrivals';

/** French overlay. Merged onto kernel English when this locale plugin is on. */
export const catalog: Partial<Strings> = {
  newArrivals,
};
