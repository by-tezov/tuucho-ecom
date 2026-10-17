import { CloseIcon } from '../ui/CloseIcon';
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { type Country as PhoneCountryCode } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import type { Address, AddressInput, AddressKind, Country } from '../../api/account';
import type { AuthUser } from '../../api/identity';
import type { Strings } from '../../assets/i18n/types';
import { Button } from '../ui/Button';
import { LoadingModal } from '../ui/LoadingModal';
import { RequiredFieldsNote, RequiredMark } from '../ui/RequiredMark';
import { DeliveryTypeChoice } from './DeliveryTypeChoice';
import authFormStyles from '../auth/AuthForm.module.css';
import { toFlagEmoji } from '../../utils/countryFlag';
import { POSTAL_CODE_DIGIT_LENGTH as POSTAL_CODE_LENGTH } from '../../utils/postalCode';
import { shopConfig } from '../../config/env';
import {
  FIELD_ADDRESS_LINE_MAX,
  FIELD_CITY_MAX,
  FIELD_COMPANY_NAME_MAX,
  FIELD_DELIVERY_NOTES_MAX,
  FIELD_POSTAL_CODE_MAX,
  FIELD_RECIPIENT_NAME_MAX,
} from '../../utils/fieldLimits';
import styles from './AddressFormModal.module.css';
import { pickupPointName } from '../../utils/pickupPoint';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { withTimeout } from '../../utils/withMinDuration';
import { isPhoneCountrySupported, isValidPhoneNumberForCountry, toPhoneCountries } from '../../utils/phone';
import { useScrollHint } from '../../hooks/useScrollHint';
import { AddressLabelField } from './AddressLabelField';
import { AddressPhoneField } from './AddressPhoneField';
import { useDragScroll } from '../../hooks/useDragScroll';

// Only countries whose postal code is a fixed run of digits are enforced
// here — anything else (NL's 1012 AB, PT's 1000-001, UK codes) stays free
// text. See utils/postalCode.ts for the list.
function sanitizePostalCodeInput(value: string, countryCode: string): string {
  const length = POSTAL_CODE_LENGTH[countryCode];
  if (!length) return value;
  return value.replace(/\D/g, '').slice(0, length);
}

/** Letters (any script), spaces, apostrophes, hyphens, and periods — covers
 * real city names like "Saint-Étienne" or "L'Isle-Adam" without assuming a
 * Latin-only alphabet. */
function sanitizeCityInput(value: string): string {
  return value.replace(/[^\p{L}\s'’.-]/gu, '');
}

interface AddressFormModalProps {
  t: Strings;
  countries: Country[];
  /** Fixed for the lifetime of this modal instance — immutable server-side,
   * so an edit never changes it either. A 'facturation' address has no
   * network/pickup step at all: it's a plain billing address. */
  kind: AddressKind;
  profile?: Pick<AuthUser, 'firstName' | 'lastName' | 'phone'> | null;
  initial?: Partial<Address>;
  /** Shown while creating a livraison address with no delivery method
   * already chosen (account page, or cart before a courier is checked). */
  onChoosePickup?: () => void;
  /** Checkout: remember is optional (default unchecked). Account page /
   * edits: always saved (checkbox hidden). Same idea as AddCardModal. */
  allowOneTimeUse?: boolean;
  /** With `allowOneTimeUse`, the remember checkbox (and its libellé). Gift
   * destination is not the address book — pass false so both stay hidden
   * and the address is always one-time. */
  allowRemember?: boolean;
  /** Nested address flows must not add a second browser-history overlay entry. */
  historyBackClose?: boolean;
  title: string;
  submitLabel: string;
  onSubmit: (input: AddressInput) => Promise<void>;
  onClose: () => void;
}

type FieldKey = 'companyName' | 'recipientName' | 'phone' | 'line1' | 'postalCode' | 'city' | 'countryCode';

type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_ORDER: FieldKey[] = [
  'companyName',
  'recipientName',
  'line1',
  'postalCode',
  'city',
  'countryCode',
  'phone',
];

/** Dialog on desktop, bottom sheet on mobile (same CSS-breakpoint pattern as
 * gallery's ColorFilterModal) — the address add/edit
 * form, extracted so both AccountAddressesPage (management) and CartPage
 * (add-address-without-leaving-checkout) can open it in place instead of
 * navigating to a separate page. */
export function AddressFormModal({
  t,
  countries,
  kind,
  profile,
  initial,
  onChoosePickup,
  allowOneTimeUse = false,
  allowRemember = true,
  historyBackClose = true,
  title,
  submitLabel,
  onSubmit,
  onClose,
}: AddressFormModalProps) {
  const isFacturation = kind === 'facturation';
  const phoneRequired = !isFacturation;
  const isCreate = !initial?.id;
  const [remember, setRemember] = useState(false);
  const showRememberToggle = allowOneTimeUse && allowRemember && isCreate;
  const savedForFuture = !allowOneTimeUse ? true : showRememberToggle ? remember : false;
  // A Mondial Relay pickup point's address is the relay point's own address,
  // not the customer's — chosen on the map, never freely typed. Recipient
  // and phone stay editable; the libellé only appears when the address can
  // be remembered. The address itself is read-only both on create (fresh
  // from the picker) and on later edits.
  const isPickupPoint =
    !isFacturation && !!initial?.pickupPoints && Object.keys(initial.pickupPoints).length > 0;
  const pointName = isPickupPoint ? pickupPointName(initial?.pickupPoints) : null;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Most of this form is selectable label/hint text: the drag must not paint
  // a selection, and must not start on a real control.
  const bodyDragScroll = useDragScroll<HTMLDivElement>({ ignore: 'input, select, textarea, button, a' });
  const { scrollHint, updateScrollHint } = useScrollHint(bodyRef);
  const profileRecipientName = [profile?.firstName?.trim(), profile?.lastName?.trim()]
    .filter(Boolean)
    .join(' ');

  const [label, setLabel] = useState(initial?.label ?? '');
  // A fresh address prefills the customer's own name — including one
  // starting from partial data that isn't itself a saved address, like a
  // freshly chosen Mondial Relay pickup point (initial set, but no id and
  // no recipientName yet). Editing an *existing* address (initial.id set,
  // even a company-only one with no recipient) must never silently
  // substitute it back in — id is what actually distinguishes "editing" from
  // "creating with some prefilled fields", not just initial being present.
  const [recipientName, setRecipientName] = useState(
    initial?.id ? (initial.recipientName ?? '') : (initial?.recipientName ?? profileRecipientName),
  );
  const [companyMode, setCompanyMode] = useState(!!initial?.companyName);
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [line1, setLine1] = useState(initial?.line1 ?? '');
  const [line2Mode, setLine2Mode] = useState(!!initial?.line2);
  const [line2, setLine2] = useState(initial?.line2 ?? '');
  const [deliveryNotesMode, setDeliveryNotesMode] = useState(!!initial?.deliveryNotes);
  const [deliveryNotes, setDeliveryNotes] = useState(initial?.deliveryNotes ?? '');
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? countries[0]?.code ?? '');
  const [phone, setPhone] = useState(() => {
    if (!isCreate) return initial?.phone ?? profile?.phone ?? '';
    // Never carry a profile phone into a country it isn't valid for — the
    // customer re-enters it rather than submitting a mismatched number.
    const profilePhone = profile?.phone ?? '';
    return isValidPhoneNumberForCountry(profilePhone, countryCode) ? profilePhone : '';
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Delivery is selected before this form opens. It must stay fixed while a
  // customer edits their address, so it is never rendered as a form control.
  // A facturation address never carries a network at all.
  const networkCodes = isFacturation ? [] : (initial?.networkCodes ?? ['home']);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const countryLabel = countries.find((country) => country.code === countryCode)?.label ?? countryCode;
  const countryFlag = isPickupPoint ? toFlagEmoji(countryCode) : null;

  // The address decides the phone country, never the other way round: a
  // delivery to a French address cannot be reached on a Belgian number, and
  // Mondial Relay rejects a number that isn't valid for the delivery country
  // (see isValidPhoneNumberForCountry). So once the country is known — from
  // the chosen pickup point, or from the country select for a home address —
  // the phone field is pinned to it: one option in the list, and the country
  // select disabled so it reads as fixed rather than merely pre-filled.
  //
  // Never pass `countries={undefined}` or `countries={[]}` to PhoneInput —
  // react-phone-number-input treats both as the full ISO list. If the address
  // country is unset / unsupported, fall back to the address-country list only
  // when that list is non-empty; otherwise omit the restricted prop by not
  // mounting a free-world flag picker (keep the field usable with no select).
  const phoneCountryOptions = useMemo(
    () => toPhoneCountries(countries.map((country) => country.code)),
    [countries],
  );
  const phoneCountryLocked = isPhoneCountrySupported(countryCode);
  const phoneCountries: PhoneCountryCode[] | undefined = phoneCountryLocked
    ? ([countryCode] as PhoneCountryCode[])
    : phoneCountryOptions.length > 0
      ? phoneCountryOptions
      : undefined;

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateFields(): FieldErrors {
    const next: FieldErrors = {};
    if (companyMode && !companyName.trim()) {
      next.companyName = t.address.companyNameRequiredError;
    }
    if (!companyMode && !recipientName.trim()) {
      next.recipientName = t.address.recipientNameRequiredError;
    }
    if (phoneRequired && !phone.trim()) {
      next.phone = t.address.phoneRequiredError;
    } else if (phone.trim() && !isValidPhoneNumberForCountry(phone, countryCode)) {
      next.phone = t.address.phoneInvalidError(countryLabel);
    }
    if (!isPickupPoint) {
      if (!line1.trim()) next.line1 = t.address.line1RequiredError;
      if (!postalCode.trim()) next.postalCode = t.address.postalCodeRequiredError;
      if (!city.trim()) next.city = t.address.cityRequiredError;
      if (!countryCode.trim()) next.countryCode = t.address.countryRequiredError;
    }
    return next;
  }

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(() => {
    // A submitted address may trigger several sequential API calls in its
    // owner (create/update, then refresh). Do not discard the visible
    // in-flight state through Escape, the close button, or browser Back.
    if (!submitting) onClose();
  }, historyBackClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  // Same technique as FilterSheet / ColorFilterModal: hide the visual
  // scrollbar, show up/down chevrons + vertical track, mouse-drag to scroll.

  useLayoutEffect(() => {
    updateScrollHint();
    const el = bodyRef.current;
    window.addEventListener('resize', updateScrollHint);
    let observer: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateScrollHint);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener('resize', updateScrollHint);
      observer?.disconnect();
    };
    // companyMode / line2Mode / deliveryNotesMode / pickup / errors change scrollHeight.
  }, [companyMode, line2Mode, deliveryNotesMode, fieldErrors, isPickupPoint, updateScrollHint]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validateFields();
    setFieldErrors(nextErrors);
    const firstInvalid = FIELD_ORDER.find((key) => nextErrors[key]);
    if (firstInvalid) {
      // Defer focus until the error messages have painted — otherwise the
      // browser may scroll to a field that then shifts when errors appear.
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`);
        el?.focus();
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        updateScrollHint();
      });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input: AddressInput = {
        kind,
        ...(savedForFuture && label ? { label } : {}),
        // Always sent as a pair (even empty) so the backend can tell
        // "explicitly cleared" from "not touched" — see
        // addresses.service.ts's update() for why that matters here.
        ...(recipientName && { recipientName }),
        ...(companyMode && companyName && { companyName }),
        line1,
        // Explicit null clears on PATCH (JSON omits undefined).
        line2: line2Mode ? line2.trim() || null : null,
        deliveryNotes: isFacturation ? null : deliveryNotesMode ? deliveryNotes.trim() || null : null,
        postalCode,
        city,
        countryCode,
        ...(phone.trim() && { phone: phone.trim() }),
        savedForFuture,
      };
      // A new address receives the delivery chosen in this form (or the
      // point selected in the Mondial Relay picker). Edits omit it so the
      // API preserves the original delivery assignment. Never applies to a
      // facturation address, which has no network at all.
      if (isCreate && !isFacturation) {
        input.networkCodes = networkCodes;
        input.pickupPoints = Object.fromEntries(
          Object.entries(initial?.pickupPoints ?? {}).filter(([networkCode]) =>
            networkCodes.includes(networkCode),
          ),
        );
      }
      // The parent owns the actual endpoint(s), but this shared form owns
      // their UX everywhere it is used: cart, address book and order edit.
      // apiFetch itself aborts its request; this additional bound also covers
      // parent-side follow-up work such as refreshing the address list.
      await withTimeout(onSubmit(input), shopConfig.paymentTimeoutMs);
    } catch {
      // Keep every entered value intact so a transient network/API failure is
      // retryable. The caller only closes this form after a successful save.
      setSubmitError(t.address.saveError);
    } finally {
      setSubmitting(false);
    }
  }

  // Click-outside only closes the mobile bottom sheet — the desktop dialog
  // is deliberately close-button-only, so an accidental click just outside
  // the panel doesn't silently discard whatever's been typed. 1024px matches
  // this file's own CSS breakpoint (.module.css) between the two layouts.
  function handleBackdropClick() {
    if (window.innerWidth < 1024) requestClose();
  }

  // Only shop checkout (allowOneTimeUse && allowRemember && isCreate) offers
  // the "remember this address" checkbox. Account / edits always save, so
  // the libellé stays at the top. Gift destination cannot be remembered, so
  // both the checkbox and the libellé stay off — same one-time checkout
  // address, without the remember opt-in.
  const labelFieldBlock = <AddressLabelField strings={t.address} value={label} onChange={setLabel} />;

  const phoneField = (
    <AddressPhoneField
      strings={t.address}
      countryCode={countryCode}
      countries={phoneCountries}
      countryLocked={phoneCountryLocked}
      required={phoneRequired}
      value={phone}
      error={fieldErrors.phone}
      onChange={(value) => {
        setPhone(value);
        clearFieldError('phone');
      }}
    />
  );

  return createPortal(
    <>
      <ModalBackdrop className={styles.backdrop ?? ''} label={title} onClose={handleBackdropClick}>
        <div ref={panelRef} className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
            <button
              type="button"
              className={styles.closeButton}
              onClick={requestClose}
              aria-label={t.address.cancelButton}
              data-modal-close
            >
              <CloseIcon />
            </button>
          </div>

          <div className={styles.bodyWrap}>
            <form className={styles.form} noValidate onSubmit={handleSubmit} data-testid="address-form">
              <div className={styles.scrollArea}>
                <div ref={bodyRef} className={styles.body} onScroll={updateScrollHint} {...bodyDragScroll}>
                  <RequiredFieldsNote />
                  {!isFacturation && !initial?.id && !initial?.pickupPoints && onChoosePickup && (
                    <DeliveryTypeChoice t={t} onChoosePickup={onChoosePickup} />
                  )}
                  {!showRememberToggle && savedForFuture && labelFieldBlock}
                  {!companyMode && (
                    <button
                      type="button"
                      className={styles.textLink}
                      data-testid="address-add-company"
                      onClick={() => {
                        setCompanyMode(true);
                        clearFieldError('recipientName');
                      }}
                    >
                      + {t.address.addCompanyLink}
                    </button>
                  )}
                  {companyMode && (
                    <label className={`${authFormStyles.field} ${styles.field}`}>
                      <span className={styles.fieldHeader}>
                        <span className={authFormStyles.label}>
                          {t.address.companyNameField}
                          <RequiredMark />
                        </span>
                        <button
                          type="button"
                          className={styles.textLink}
                          onClick={() => {
                            setCompanyMode(false);
                            setCompanyName('');
                            clearFieldError('companyName');
                          }}
                        >
                          {t.address.removeCompanyLink}
                        </button>
                      </span>
                      <input
                        data-field="companyName"
                        data-testid="address-company"
                        className={authFormStyles.input}
                        name="organization"
                        autoComplete="organization"
                        maxLength={FIELD_COMPANY_NAME_MAX}
                        value={companyName}
                        aria-required="true"
                        aria-invalid={fieldErrors.companyName != null}
                        aria-describedby={fieldErrors.companyName ? 'address-companyName-error' : undefined}
                        onChange={(e) => {
                          setCompanyName(e.target.value);
                          clearFieldError('companyName');
                        }}
                      />
                      {fieldErrors.companyName && (
                        <p id="address-companyName-error" className={styles.fieldError} role="alert">
                          {fieldErrors.companyName}
                        </p>
                      )}
                    </label>
                  )}
                  <label className={`${authFormStyles.field} ${styles.field}`}>
                    <span className={authFormStyles.label}>
                      {t.address.recipientNameField}
                      {!companyMode && <RequiredMark />}
                    </span>
                    <input
                      data-field="recipientName"
                      data-testid="address-recipient"
                      className={authFormStyles.input}
                      name="name"
                      autoComplete="name"
                      maxLength={FIELD_RECIPIENT_NAME_MAX}
                      value={recipientName}
                      aria-required={companyMode ? undefined : 'true'}
                      aria-invalid={fieldErrors.recipientName != null}
                      aria-describedby={
                        fieldErrors.recipientName
                          ? 'address-recipientName-error'
                          : companyMode
                            ? 'address-recipientName-hint'
                            : undefined
                      }
                      onChange={(e) => {
                        setRecipientName(e.target.value);
                        clearFieldError('recipientName');
                      }}
                    />
                    {fieldErrors.recipientName ? (
                      <p id="address-recipientName-error" className={styles.fieldError} role="alert">
                        {fieldErrors.recipientName}
                      </p>
                    ) : (
                      companyMode && (
                        <p id="address-recipientName-hint" className={authFormStyles.hint}>
                          {t.address.recipientNameCompanyHint}
                        </p>
                      )
                    )}
                  </label>
                  {isPickupPoint ? (
                    <>
                      {/* Country is already fixed by the relay point chosen in a
                    prior step, so phone can validate against it here even
                    though the read-only country line below renders after. */}
                      {phoneField}
                      <div className={styles.field}>
                        <span className={authFormStyles.label}>{t.address.line1Field}</span>
                        <p className={styles.staticAddress} data-testid="address-static">
                          {/* The relay's own name heads its address, like the
                        company line of a business address — it identifies
                        the place the parcel waits at, so it is shown
                        rather than typed. */}
                          {pointName && (
                            <>
                              <span className={styles.pickupPointName}>{pointName}</span>
                              <br />
                            </>
                          )}
                          {line1}
                          {line2 ? (
                            <>
                              <br />
                              {line2}
                            </>
                          ) : null}
                          {(postalCode || city) && (
                            <>
                              <br />
                              {[postalCode, city].filter(Boolean).join(' ')}
                            </>
                          )}
                          {countryLabel ? (
                            <>
                              <br />
                              <span className={styles.countryLine}>
                                {countryFlag && (
                                  <span className={styles.countryFlag} aria-hidden="true">
                                    {countryFlag}
                                  </span>
                                )}
                                {countryLabel}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {!deliveryNotesMode && (
                        <button
                          type="button"
                          className={styles.textLink}
                          data-testid="address-add-notes"
                          onClick={() => setDeliveryNotesMode(true)}
                        >
                          + {t.address.addDeliveryNotesLink}
                        </button>
                      )}
                      {deliveryNotesMode && (
                        <label className={`${authFormStyles.field} ${styles.field}`}>
                          <span className={styles.fieldHeader}>
                            <span className={authFormStyles.label}>{t.address.deliveryNotesField}</span>
                            <button
                              type="button"
                              className={styles.textLink}
                              onClick={() => {
                                setDeliveryNotesMode(false);
                                setDeliveryNotes('');
                              }}
                            >
                              {t.address.removeCompanyLink}
                            </button>
                          </span>
                          <textarea
                            className={authFormStyles.input}
                            name="delivery-notes"
                            data-testid="address-notes"
                            autoComplete="off"
                            rows={3}
                            maxLength={FIELD_DELIVERY_NOTES_MAX}
                            value={deliveryNotes}
                            aria-describedby="address-deliveryNotes-hint"
                            onChange={(e) => setDeliveryNotes(e.target.value)}
                          />
                          <p id="address-deliveryNotes-hint" className={authFormStyles.hint}>
                            {t.address.deliveryNotesHint}
                          </p>
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <label className={`${authFormStyles.field} ${styles.field}`}>
                        <span className={authFormStyles.label}>
                          {t.address.line1Field}
                          <RequiredMark />
                        </span>
                        <input
                          data-field="line1"
                          data-testid="address-line1"
                          className={authFormStyles.input}
                          name="address-line1"
                          autoComplete="address-line1"
                          maxLength={FIELD_ADDRESS_LINE_MAX}
                          value={line1}
                          aria-required="true"
                          aria-invalid={fieldErrors.line1 != null}
                          aria-describedby={fieldErrors.line1 ? 'address-line1-error' : undefined}
                          onChange={(e) => {
                            setLine1(e.target.value);
                            clearFieldError('line1');
                          }}
                        />
                        {fieldErrors.line1 && (
                          <p id="address-line1-error" className={styles.fieldError} role="alert">
                            {fieldErrors.line1}
                          </p>
                        )}
                      </label>
                      {!line2Mode && (
                        <button
                          type="button"
                          className={styles.textLink}
                          data-testid="address-add-line2"
                          onClick={() => setLine2Mode(true)}
                        >
                          + {t.address.addLine2Link}
                        </button>
                      )}
                      {line2Mode && (
                        <div className={`${authFormStyles.field} ${styles.field}`}>
                          <span className={styles.fieldHeader}>
                            <label className={authFormStyles.label} htmlFor="address-line2">
                              {t.address.line2Field}
                            </label>
                            <button
                              type="button"
                              className={styles.textLink}
                              onClick={() => {
                                setLine2Mode(false);
                                setLine2('');
                              }}
                            >
                              {t.address.removeCompanyLink}
                            </button>
                          </span>
                          <input
                            id="address-line2"
                            className={authFormStyles.input}
                            name="address-line2"
                            data-testid="address-line2"
                            autoComplete="address-line2"
                            maxLength={FIELD_ADDRESS_LINE_MAX}
                            value={line2}
                            onChange={(e) => setLine2(e.target.value)}
                          />
                        </div>
                      )}
                      <div className={`${styles.formRow} ${styles.field}`}>
                        <label className={authFormStyles.field}>
                          <span className={authFormStyles.label}>
                            {t.address.postalCodeField}
                            <RequiredMark />
                          </span>
                          <input
                            data-field="postalCode"
                            data-testid="address-postal"
                            className={authFormStyles.input}
                            name="postal-code"
                            autoComplete="postal-code"
                            inputMode={POSTAL_CODE_LENGTH[countryCode] ? 'numeric' : 'text'}
                            maxLength={FIELD_POSTAL_CODE_MAX}
                            value={postalCode}
                            aria-required="true"
                            aria-invalid={fieldErrors.postalCode != null}
                            aria-describedby={fieldErrors.postalCode ? 'address-postalCode-error' : undefined}
                            onChange={(e) => {
                              setPostalCode(sanitizePostalCodeInput(e.target.value, countryCode));
                              clearFieldError('postalCode');
                            }}
                          />
                          {fieldErrors.postalCode && (
                            <p id="address-postalCode-error" className={styles.fieldError} role="alert">
                              {fieldErrors.postalCode}
                            </p>
                          )}
                        </label>
                        <label className={authFormStyles.field}>
                          <span className={authFormStyles.label}>
                            {t.address.cityField}
                            <RequiredMark />
                          </span>
                          <input
                            data-field="city"
                            data-testid="address-city"
                            className={authFormStyles.input}
                            name="address-level2"
                            autoComplete="address-level2"
                            maxLength={FIELD_CITY_MAX}
                            value={city}
                            aria-required="true"
                            aria-invalid={fieldErrors.city != null}
                            aria-describedby={fieldErrors.city ? 'address-city-error' : undefined}
                            onChange={(e) => {
                              setCity(sanitizeCityInput(e.target.value));
                              clearFieldError('city');
                            }}
                          />
                          {fieldErrors.city && (
                            <p id="address-city-error" className={styles.fieldError} role="alert">
                              {fieldErrors.city}
                            </p>
                          )}
                        </label>
                      </div>
                      <label className={`${authFormStyles.field} ${styles.field}`}>
                        <span className={authFormStyles.label}>
                          {t.address.countryField}
                          <RequiredMark />
                        </span>
                        <select
                          data-field="countryCode"
                          className={authFormStyles.input}
                          name="country"
                          autoComplete="country"
                          value={countryCode}
                          aria-required="true"
                          aria-invalid={fieldErrors.countryCode != null}
                          aria-describedby={fieldErrors.countryCode ? 'address-countryCode-error' : undefined}
                          onChange={(e) => {
                            const nextCountry = e.target.value;
                            setCountryCode(nextCountry);
                            clearFieldError('countryCode');
                            // A phone valid for the old country may not be for the
                            // new one. Flag it rather than wiping it: the customer
                            // typed that number deliberately, and silently emptying
                            // the field leaves them with no idea why. They can fix
                            // the number or change the country back.
                            if (phone.trim() && !isValidPhoneNumberForCountry(phone, nextCountry)) {
                              const nextCountryLabel =
                                countries.find((country) => country.code === nextCountry)?.label ??
                                nextCountry;
                              setFieldErrors((prev) => ({
                                ...prev,
                                phone: t.address.phoneInvalidError(nextCountryLabel),
                              }));
                            } else {
                              clearFieldError('phone');
                            }
                          }}
                        >
                          {countries.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.label}
                            </option>
                          ))}
                        </select>
                        {fieldErrors.countryCode && (
                          <p id="address-countryCode-error" className={styles.fieldError} role="alert">
                            {fieldErrors.countryCode}
                          </p>
                        )}
                      </label>
                      {/* After country, not before: phone validation depends on
                    which country is selected. */}
                      {phoneField}
                      {!isFacturation && !deliveryNotesMode && (
                        <button
                          type="button"
                          className={styles.textLink}
                          data-testid="address-add-notes"
                          onClick={() => setDeliveryNotesMode(true)}
                        >
                          + {t.address.addDeliveryNotesLink}
                        </button>
                      )}
                      {!isFacturation && deliveryNotesMode && (
                        <label className={`${authFormStyles.field} ${styles.field}`}>
                          <span className={styles.fieldHeader}>
                            <span className={authFormStyles.label}>{t.address.deliveryNotesField}</span>
                            <button
                              type="button"
                              className={styles.textLink}
                              onClick={() => {
                                setDeliveryNotesMode(false);
                                setDeliveryNotes('');
                              }}
                            >
                              {t.address.removeCompanyLink}
                            </button>
                          </span>
                          <textarea
                            className={authFormStyles.input}
                            name="delivery-notes"
                            data-testid="address-notes"
                            autoComplete="off"
                            rows={3}
                            maxLength={FIELD_DELIVERY_NOTES_MAX}
                            value={deliveryNotes}
                            aria-describedby="address-deliveryNotes-hint-home"
                            onChange={(e) => setDeliveryNotes(e.target.value)}
                          />
                          <p id="address-deliveryNotes-hint-home" className={authFormStyles.hint}>
                            {t.address.deliveryNotesHint}
                          </p>
                        </label>
                      )}
                    </>
                  )}
                </div>
                {scrollHint.up && (
                  <span className={styles.scrollHintUp} aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 7.5L6 4L9.5 7.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                {scrollHint.down && (
                  <span className={styles.scrollHintDown} aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 4.5L6 8L9.5 4.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
                {(scrollHint.up || scrollHint.down) && (
                  <span
                    className={[
                      styles.scrollHintBar,
                      scrollHint.up && styles.scrollHintBarFromUp,
                      scrollHint.down && styles.scrollHintBarToDown,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                )}
              </div>
              {showRememberToggle && (
                <div className={styles.rememberSection}>
                  {remember && labelFieldBlock}
                  <label className={styles.rememberRow}>
                    <input
                      type="checkbox"
                      onMouseDown={suppressMouseFocus}
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    {t.address.rememberAddressLabel}
                  </label>
                </div>
              )}
              {submitError && (
                <p className={styles.fieldError} role="alert">
                  {submitError}
                </p>
              )}
              <div className={styles.buttonRow}>
                <Button type="submit" disabled={submitting} data-testid="address-submit">
                  {submitting ? t.address.savingAddressButton : submitLabel}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </ModalBackdrop>
      {submitting && <LoadingModal message={t.address.savingAddressButton} />}
    </>,
    document.body,
  );
}
