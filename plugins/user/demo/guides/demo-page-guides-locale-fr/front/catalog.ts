import type { Strings } from '@kernel/front/assets/i18n/types';
import { capsules } from './strings/capsules';
import { pose } from './strings/pose';
import { poseVideoPage } from './strings/poseVideoPage';
import { guide } from './strings/guide';

/** French overlay. Merged onto kernel English when this locale plugin is on. */
export const catalog: Partial<Strings> = {
  capsules,
  pose,
  poseVideoPage,
  guide,
};
