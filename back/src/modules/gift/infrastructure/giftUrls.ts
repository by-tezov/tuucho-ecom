import type { Language } from '../../../utils/language.js';
import { config } from '../../../config/env.js';

export function giftFrontendPath(rest: string, language: Language): string {
  const path = rest.startsWith('/') ? rest : `/${rest}`;
  return `/${language}${path}`;
}

export function giftReceiverUrl(rawToken: string, language: Language): string {
  return `${config.frontendBaseUrl}${giftFrontendPath(`/gift/${rawToken}`, language)}`;
}

export function giftGiverUrl(rawToken: string, language: Language): string {
  return `${config.frontendBaseUrl}${giftFrontendPath(`/gift/giver/${rawToken}`, language)}`;
}

