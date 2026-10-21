import type { Strings } from '@kernel/front/assets/i18n/types';
import { hero } from './strings/hero';
import { values } from './strings/values';
import { atelier } from './strings/atelier';
import { customDesign } from './strings/customDesign';
import { platforms } from './strings/platforms';

/** French overlay. Merged onto kernel English when this locale plugin is on. */
export const catalog: Partial<Strings> = {
  hero,
  values,
  atelier,
  customDesign,
  platforms,
};
