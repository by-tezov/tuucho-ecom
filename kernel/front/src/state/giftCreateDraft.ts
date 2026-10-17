import { FIELD_GIFT_COMMENT_MAX } from '../utils/fieldLimits';
import { clampGiftComment } from '../utils/giftComment';

export const GIFT_CREATE_DRAFT_STORAGE_KEY = 'psn-gift-create-draft-v1';

export interface GiftCreateDraft {
  giverEmail: string;
  giverDisplayName: string;
  receiverName: string;
  maxBudget: string;
  giverComment: string;
  shareCardStyle: string;
  allowAccessories: boolean;
  maxAccessoryBudget: string;
  hidePrices: boolean;
  accessPin: string;
  accessPinConfirm: string;
  gdpr: boolean;
}

const EMPTY: GiftCreateDraft = {
  giverEmail: '',
  giverDisplayName: '',
  receiverName: '',
  maxBudget: '',
  giverComment: '',
  shareCardStyle: 'pamsurin',
  allowAccessories: false,
  maxAccessoryBudget: '',
  hidePrices: true,
  accessPin: '',
  accessPinConfirm: '',
  gdpr: false,
};

function asString(value: unknown, max = FIELD_GIFT_COMMENT_MAX): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

/** In-progress Offrir form for this tab. Survives refresh and in-app
 *  navigations (privacy, terms). Cleared after a successful create, or
 *  when the browser session ends. The 4-digit PIN is never persisted:
 *  only a hash is stored server-side, and it cannot be recovered. */
export function loadGiftCreateDraft(): GiftCreateDraft {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.sessionStorage.getItem(GIFT_CREATE_DRAFT_STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<GiftCreateDraft>;
    return {
      giverEmail: asString(parsed.giverEmail, 254),
      giverDisplayName: asString(parsed.giverDisplayName, 80),
      receiverName: asString(parsed.receiverName, 80),
      maxBudget: asString(parsed.maxBudget, 16),
      giverComment: clampGiftComment(asString(parsed.giverComment, FIELD_GIFT_COMMENT_MAX)),
      shareCardStyle: asString(parsed.shareCardStyle, 40) || 'pamsurin',
      allowAccessories: parsed.allowAccessories === true,
      maxAccessoryBudget: asString(parsed.maxAccessoryBudget, 16),
      hidePrices: parsed.hidePrices !== false,
      accessPin: '',
      accessPinConfirm: '',
      gdpr: parsed.gdpr === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveGiftCreateDraft(draft: GiftCreateDraft): void {
  if (typeof window === 'undefined') return;
  try {
    const persistable: GiftCreateDraft = { ...draft, accessPin: '', accessPinConfirm: '' };
    window.sessionStorage.setItem(GIFT_CREATE_DRAFT_STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // Private-mode / quota must not break the create form.
  }
}

export function clearGiftCreateDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(GIFT_CREATE_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
