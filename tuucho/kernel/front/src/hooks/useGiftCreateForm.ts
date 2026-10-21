import { useEffect, useState, type FormEvent } from 'react';
import { useLang } from '../assets/i18n';
import type { AuthUser } from '../api/identity';
import { GIFT_SHARE_CARD_STYLES, type GiftShareCardStyle } from '../components/gift/GiftShareCardPreview';
import { useGiftPublicSettings } from './useGiftPublicSettings';
import { useIsDesktopNav } from './useIsDesktopNav';
import { useAuthSession } from '../state/AuthContext';
import { clearGiftCreateDraft, loadGiftCreateDraft, saveGiftCreateDraft } from '../state/giftCreateDraft';
import { FIELD_GIFT_COMMENT_MAX } from '../utils/fieldLimits';
import { giftCommentFits } from '../utils/giftComment';
import { ApiError } from '../api/errors';
import { isApiRequestTimeoutError, isBackendUnavailableError } from '../api/http';
import { createGiftOffer } from '../api/gift';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GIFT_CREATE_COMMENT_MAX = FIELD_GIFT_COMMENT_MAX;
const GIFT_CREATE_BUDGET_PRESETS = [15, 25, 40, 60, 90];
const GIFT_CREATE_ACCESSORY_BUDGET_PRESETS = [3, 5];

export type GiftCreateField =
  | 'giverEmail'
  | 'giverDisplayName'
  | 'receiverName'
  | 'giverComment'
  | 'shareCardStyle'
  | 'maxBudget'
  | 'maxAccessoryBudget'
  | 'accessPin'
  | 'accessPinConfirm'
  | 'gdpr';

export interface GiftCreatedOffer {
  email: string;
  receiverName: string;
  giverDisplayName: string;
  giverComment: string;
  shareCardStyle: GiftShareCardStyle;
  pin: string;
  guest: boolean;
}

function profileFirstName(user: AuthUser | null): string {
  return user?.firstName?.trim() ?? '';
}

export function withN(template: string, n: number): string {
  return template.replace('{n}', String(n));
}

export function parseRequiredBudget(raw: string): { value: number | null; empty: boolean; invalid: boolean } {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return { value: null, empty: true, invalid: false };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return { value: null, empty: false, invalid: true };
  const rounded = Math.round(value * 100) / 100;
  if (rounded <= 0) return { value: null, empty: false, invalid: true };
  return { value: rounded, empty: false, invalid: false };
}

function parseOptionalBudget(raw: string): { value: number | null; invalid: boolean } {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return { value: null, invalid: false };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return { value: null, invalid: true };
  return { value: Math.round(value * 100) / 100, invalid: false };
}

export function budgetInt(raw: string): number {
  const value = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function focusField(id: string) {
  const field = document.getElementById(id);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (field instanceof HTMLElement) field.focus();
}

function asShareCardStyle(value: string): GiftShareCardStyle {
  return (GIFT_SHARE_CARD_STYLES as readonly string[]).includes(value)
    ? (value as GiftShareCardStyle)
    : 'classic';
}

/** Form state + validation for GiftCreatePage (keeps the route focused on layout). */
export function useGiftCreateForm() {
  const { t, lang } = useLang();
  const settings = useGiftPublicSettings();
  const isDesktopNav = useIsDesktopNav();
  const { status, user, authedRequest } = useAuthSession();
  const signedIn = status === 'authenticated';
  const [draft] = useState(loadGiftCreateDraft);
  const [giverEmail, setGiverEmail] = useState(draft.giverEmail);
  const [giverDisplayName, setGiverDisplayName] = useState(draft.giverDisplayName);
  const [receiverName, setReceiverName] = useState(draft.receiverName);
  const [maxBudget, setMaxBudget] = useState(draft.maxBudget);
  const [giverComment, setGiverComment] = useState(draft.giverComment);
  const [shareCardStyle, setShareCardStyle] = useState<GiftShareCardStyle>(
    asShareCardStyle(draft.shareCardStyle),
  );
  const [allowAccessories, setAllowAccessories] = useState(draft.allowAccessories);
  const [maxAccessoryBudget, setMaxAccessoryBudget] = useState(draft.maxAccessoryBudget);
  const [hidePrices, setHidePrices] = useState(draft.hidePrices);
  const [accessPin, setAccessPin] = useState('');
  const [accessPinConfirm, setAccessPinConfirm] = useState('');
  const [gdpr, setGdpr] = useState(draft.gdpr);
  const [errors, setErrors] = useState<Partial<Record<GiftCreateField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<GiftCreatedOffer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [budgetSheet, setBudgetSheet] = useState<'sets' | 'accessories' | null>(null);

  useEffect(() => {
    if (isDesktopNav) setBudgetSheet(null);
  }, [isDesktopNav]);

  useEffect(() => {
    if (created) return;
    saveGiftCreateDraft({
      giverEmail,
      giverDisplayName,
      receiverName,
      maxBudget,
      giverComment,
      shareCardStyle,
      allowAccessories,
      maxAccessoryBudget,
      hidePrices,
      accessPin: '',
      accessPinConfirm: '',
      gdpr,
    });
  }, [
    created,
    giverEmail,
    giverDisplayName,
    receiverName,
    maxBudget,
    giverComment,
    shareCardStyle,
    allowAccessories,
    maxAccessoryBudget,
    hidePrices,
    gdpr,
  ]);

  useEffect(() => {
    if (!signedIn || !user) return;
    setGiverEmail(user.email);
    const fromProfile = profileFirstName(user);
    if (fromProfile) {
      setGiverDisplayName((current) => (current.trim() ? current : fromProfile));
    }
  }, [signedIn, user]);

  function clearError(field: GiftCreateField) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function resetOfferFields() {
    setReceiverName('');
    setMaxBudget('');
    setGiverComment('');
    setShareCardStyle('classic');
    setAllowAccessories(false);
    setMaxAccessoryBudget('');
    setHidePrices(true);
    setAccessPin('');
    setAccessPinConfirm('');
    setGdpr(false);
    setErrors({});
    setFormError(null);
  }

  function resetAllFormFields() {
    resetOfferFields();
    setGiverEmail('');
    setGiverDisplayName('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const email = signedIn ? (user?.email ?? '').trim() : giverEmail.trim();
    const budget = parseRequiredBudget(maxBudget);
    const accessoryBudget = parseOptionalBudget(maxAccessoryBudget);
    const comment = giverComment.trim();
    const next: Partial<Record<GiftCreateField, string>> = {};
    if (!signedIn) {
      if (!email) next.giverEmail = t.gift.fieldRequired;
      else if (!EMAIL_PATTERN.test(email)) next.giverEmail = t.gift.fieldEmailInvalid;
    }
    if (!giverDisplayName.trim()) next.giverDisplayName = t.gift.fieldRequired;
    if (!receiverName.trim()) next.receiverName = t.gift.fieldRequired;
    if (!comment) next.giverComment = t.gift.fieldRequired;
    else if (!giftCommentFits(comment)) next.giverComment = t.gift.fieldCommentTooLong;
    if (!/^\d{4}$/.test(accessPin)) next.accessPin = t.gift.pinInvalid;
    else if (accessPin !== accessPinConfirm) next.accessPinConfirm = t.gift.pinMismatch;
    const budgetFloor = settings?.minBudget ?? 0;
    const budgetCeiling = settings?.maxBudgetCeiling ?? 0;
    const accessoryCeiling = settings?.maxAccessoryBudgetCeiling ?? 0;
    if (budget.empty) next.maxBudget = t.gift.fieldRequired;
    else if (budget.invalid) next.maxBudget = t.gift.fieldBudgetInvalid;
    else if (budget.value != null && budgetFloor > 0 && budget.value < budgetFloor) {
      next.maxBudget = withN(t.gift.fieldBudgetMin, budgetFloor);
    } else if (budget.value != null && budgetCeiling > 0 && budget.value > budgetCeiling) {
      next.maxBudget = withN(t.gift.fieldBudgetCeiling, budgetCeiling);
    }
    if (allowAccessories) {
      if (!maxAccessoryBudget.trim()) next.maxAccessoryBudget = t.gift.fieldAccessoryBudgetRequired;
      else if (accessoryBudget.invalid) next.maxAccessoryBudget = t.gift.fieldBudgetInvalid;
      else if (
        accessoryBudget.value != null &&
        accessoryCeiling > 0 &&
        accessoryBudget.value > accessoryCeiling
      ) {
        next.maxAccessoryBudget = withN(t.gift.fieldBudgetCeiling, accessoryCeiling);
      }
    }
    if (!gdpr) next.gdpr = t.cart.guestPromptConsentRequiredError;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstId =
        next.giverEmail != null
          ? 'gift-giver-email'
          : next.giverDisplayName != null
            ? 'gift-giver-name'
            : next.receiverName != null
              ? 'gift-receiver-name'
              : next.giverComment != null
                ? 'gift-giver-comment'
                : next.maxBudget != null
                  ? 'gift-max-budget'
                  : next.maxAccessoryBudget != null
                    ? 'gift-max-accessory-budget'
                    : next.gdpr != null
                      ? 'gift-gdpr'
                      : next.accessPin != null
                        ? 'gift-access-pin'
                        : next.accessPinConfirm != null
                          ? 'gift-access-pin-confirm'
                          : null;
      if (firstId) queueMicrotask(() => focusField(firstId));
      return;
    }
    if (budget.value == null) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        giverEmail: email,
        giverDisplayName: giverDisplayName.trim(),
        receiverName: receiverName.trim(),
        giverComment: comment,
        shareCardStyle,
        maxBudget: budget.value,
        ...(allowAccessories ? { allowAccessories: true, maxAccessoryBudget: accessoryBudget.value } : {}),
        hideReceiverPrices: hidePrices,
        language: lang,
        accessPin,
        gdprConsent: { accepted: true },
      };
      const result = signedIn
        ? await authedRequest((token) => createGiftOffer(payload, token))
        : await createGiftOffer(payload);
      const snapshot: GiftCreatedOffer = {
        email,
        receiverName: receiverName.trim(),
        giverDisplayName: giverDisplayName.trim(),
        giverComment: comment,
        shareCardStyle,
        pin: accessPin,
        guest: Boolean(result.checkEmail),
      };
      clearGiftCreateDraft();
      if (signedIn) resetOfferFields();
      else resetAllFormFields();
      setCreated(snapshot);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (isBackendUnavailableError(error)) return;
      if (isApiRequestTimeoutError(error)) {
        setFormError(t.gift.timeoutError);
      } else if (error instanceof ApiError && error.code === 'rate_limited') {
        setFormError(t.gift.rateLimitedError);
      } else if (error instanceof ApiError && error.code === 'gift_budget_floor') {
        const n = error.min ?? settings?.minBudget;
        if (n != null && n > 0) {
          setErrors((current) => ({ ...current, maxBudget: withN(t.gift.fieldBudgetMin, n) }));
          queueMicrotask(() => focusField('gift-max-budget'));
        } else {
          setFormError(t.gift.genericError);
        }
      } else if (error instanceof ApiError && error.code === 'gift_budget_ceiling') {
        const accessoryField = error.field === 'maxAccessoryBudget';
        const n =
          error.max ?? (accessoryField ? settings?.maxAccessoryBudgetCeiling : settings?.maxBudgetCeiling);
        if (n != null && n > 0) {
          setErrors((current) => ({
            ...current,
            [accessoryField ? 'maxAccessoryBudget' : 'maxBudget']: withN(t.gift.fieldBudgetCeiling, n),
          }));
          queueMicrotask(() => focusField(accessoryField ? 'gift-max-accessory-budget' : 'gift-max-budget'));
        } else {
          setFormError(t.gift.genericError);
        }
      } else if (error instanceof ApiError && error.code === 'invalid_request') {
        setFormError(t.gift.invalidRequestError);
      } else if (
        error instanceof ApiError &&
        (error.code === 'unauthorized' || error.code === 'csrf_rejected')
      ) {
        setFormError(t.gift.sessionExpiredError);
      } else if (error instanceof ApiError && error.code === 'internal_error') {
        setFormError(t.gift.serverError);
      } else {
        setFormError(t.gift.genericError);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const budgetFloor = settings?.minBudget ?? 0;
  const budgetCeiling = settings?.maxBudgetCeiling ?? 0;
  const accessoryCeiling = settings?.maxAccessoryBudgetCeiling ?? 0;
  const presets = GIFT_CREATE_BUDGET_PRESETS.filter(
    (value) => value >= budgetFloor && (budgetCeiling <= 0 || value <= budgetCeiling),
  );
  const accessoryPresets = GIFT_CREATE_ACCESSORY_BUDGET_PRESETS.filter(
    (value) => accessoryCeiling <= 0 || value <= accessoryCeiling,
  );

  return {
    t,
    lang,
    settings,
    isDesktopNav,
    signedIn,
    user,
    giverEmail,
    setGiverEmail,
    giverDisplayName,
    setGiverDisplayName,
    receiverName,
    setReceiverName,
    maxBudget,
    setMaxBudget,
    giverComment,
    setGiverComment,
    shareCardStyle,
    setShareCardStyle,
    allowAccessories,
    setAllowAccessories,
    maxAccessoryBudget,
    setMaxAccessoryBudget,
    hidePrices,
    setHidePrices,
    accessPin,
    setAccessPin,
    accessPinConfirm,
    setAccessPinConfirm,
    gdpr,
    setGdpr,
    errors,
    clearError,
    submitting,
    created,
    setCreated,
    formError,
    budgetSheet,
    setBudgetSheet,
    onSubmit,
    budgetFloor,
    budgetCeiling,
    accessoryCeiling,
    presets,
    accessoryPresets,
    resetOfferFields,
    resetAllFormFields,
  };
}
