import { useEffect, useState } from 'react';
import { useLang } from '../assets/i18n';
import { useAuthSession } from '../state/AuthContext';
import { markCheckoutEntityDeleted } from '../state/cartBootstrapCache';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import * as authApi from '../api/checkout';
import type { DefaultPaymentMethod, PaymentMethod, ShopPaymentMethods } from '../api/checkout';
import { AddCardModal } from '../components/account/AddCardModal';
import { AccountShell } from '../components/account/AccountShell';
import { CardBrandMark } from '../components/account/CardBrandMark';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { shopConfig } from '../config/env';
import { useWalletAvailability } from '../hooks/useWalletAvailability';
import { withMinDuration, withTimeout } from '../utils/withMinDuration';
import { PaymentBrandMark, type PaymentBrandKey } from '../components/checkout/PaymentBrandMark';
import styles from './AccountAddressesPage.module.css';

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

type PreferenceMethod =
  | Extract<
      DefaultPaymentMethod,
      { type: 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay' }
    >['type']
  | 'new_card';

const SHOP_ALL_OFF: ShopPaymentMethods = {
  card: false,
  paypal: false,
  bancontact: false,
  googlePay: false,
  applePay: false,
};

export function AccountPaymentMethodsPage() {
  const { t } = useLang();
  const { authedRequest, user } = useAuthSession();
  const walletAvailability = useWalletAvailability();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<DefaultPaymentMethod | null>(null);
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [bancontactEnabled, setBancontactEnabled] = useState(false);
  const [googlePayEnabled, setGooglePayEnabled] = useState(false);
  const [applePayEnabled, setApplePayEnabled] = useState(false);
  const [newCardEnabled, setNewCardEnabled] = useState(false);
  const [shopPaymentMethods, setShopPaymentMethods] = useState<ShopPaymentMethods>(SHOP_ALL_OFF);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [addCardSecret, setAddCardSecret] = useState<string | null>(null);
  const [openingAddCard, setOpeningAddCard] = useState(false);
  const [addCardError, setAddCardError] = useState(false);
  const [confirmDisablePreference, setConfirmDisablePreference] = useState<PreferenceMethod | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    (async () => {
      try {
        const result = await authedRequest((token) => authApi.listPaymentMethods(token));
        if (cancelled) return;
        setPaymentMethods(result.paymentMethods);
        setDefaultPaymentMethod(result.defaultPaymentMethod);
        setPaypalEnabled(result.paypalEnabled);
        setBancontactEnabled(result.bancontactEnabled);
        setGooglePayEnabled(result.googlePayEnabled);
        setApplePayEnabled(result.applePayEnabled);
        setNewCardEnabled(result.newCardEnabled);
        setShopPaymentMethods(result.shopPaymentMethods);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) {
          setLoadedAccountId(user?.id ?? null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, user?.id]);

  async function refreshPaymentMethods() {
    const result = await authedRequest((token) => authApi.listPaymentMethods(token));
    setPaymentMethods(result.paymentMethods);
    setDefaultPaymentMethod(result.defaultPaymentMethod);
    setPaypalEnabled(result.paypalEnabled);
    setBancontactEnabled(result.bancontactEnabled);
    setGooglePayEnabled(result.googlePayEnabled);
    setApplePayEnabled(result.applePayEnabled);
    setNewCardEnabled(result.newCardEnabled);
    setShopPaymentMethods(result.shopPaymentMethods);
  }

  // Disabling while a preference is the current default clears that default
  // too (see PUT /payment-methods/*-enabled) — refetch rather than just
  // flipping local state, so defaultPaymentMethod stays in sync with it.
  async function applyPreferenceToggle(method: PreferenceMethod, enabled: boolean) {
    if (method === 'paypal') setPaypalEnabled(enabled);
    else if (method === 'bancontact') setBancontactEnabled(enabled);
    else if (method === 'google_pay') setGooglePayEnabled(enabled);
    else if (method === 'apple_pay') setApplePayEnabled(enabled);
    else setNewCardEnabled(enabled);
    await authedRequest(async (token) => {
      if (method === 'paypal') await authApi.setPaypalEnabled(token, enabled);
      else if (method === 'bancontact') await authApi.setBancontactEnabled(token, enabled);
      else if (method === 'google_pay') await authApi.setGooglePayEnabled(token, enabled);
      else if (method === 'apple_pay') await authApi.setApplePayEnabled(token, enabled);
      else await authApi.setNewCardEnabled(token, enabled);
    });
    await refreshPaymentMethods();
  }

  // Enabling is a harmless, reversible click — only disabling (which stops
  // that method at checkout right away) gets a confirmation step.
  function handleTogglePreference(method: PreferenceMethod, enabled: boolean) {
    if (enabled) {
      void applyPreferenceToggle(method, true);
    } else {
      setConfirmDisablePreference(method);
    }
  }

  async function handleOpenAddCard() {
    if (openingAddCard) return;
    setOpeningAddCard(true);
    setAddCardError(false);
    try {
      const result = await withTimeout(
        withMinDuration(
          authedRequest((token) => authApi.createSetupIntent(token)),
          shopConfig.loadingMinMs.normal,
        ),
        shopConfig.paymentTimeoutMs,
      );
      setAddCardSecret(result.clientSecret);
    } catch {
      setAddCardError(true);
    } finally {
      setOpeningAddCard(false);
    }
  }

  async function handleCardAdded(paymentMethodId: string, savedForFuture: boolean) {
    await authedRequest((token) => authApi.registerPaymentMethod(token, paymentMethodId, savedForFuture));
    await refreshPaymentMethods();
    setAddCardSecret(null);
  }

  function handleDelete(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await authedRequest((token) => authApi.deletePaymentMethod(token, id));
    markCheckoutEntityDeleted(id);
    await refreshPaymentMethods();
  }

  async function handleSetDefault(paymentMethod: DefaultPaymentMethod) {
    const result = await authedRequest((token) => authApi.setDefaultPaymentMethod(token, paymentMethod));
    setDefaultPaymentMethod(result.defaultPaymentMethod);
  }

  async function handleUnsetDefault() {
    await authedRequest((token) => authApi.unsetDefaultPaymentMethod(token));
    setDefaultPaymentMethod(null);
  }

  const pendingDeleteCard = pendingDeleteId
    ? paymentMethods.find((pm) => pm.id === pendingDeleteId)
    : undefined;
  const pendingDeleteBrand = pendingDeleteCard
    ? (BRAND_LABELS[pendingDeleteCard.brand] ?? pendingDeleteCard.brand)
    : '';
  const pendingDeleteCardLine = pendingDeleteCard
    ? `${pendingDeleteBrand} •••• ${pendingDeleteCard.last4}`
    : '';
  const pendingDeleteMessage = pendingDeleteCard ? (
    <div className={styles.deletePreview}>
      {pendingDeleteCard.cardholderName && (
        <div className={styles.deletePreviewName}>{pendingDeleteCard.cardholderName}</div>
      )}
      <div className={pendingDeleteCard.cardholderName ? undefined : styles.deletePreviewName}>
        {pendingDeleteCardLine}
      </div>
      <div>
        {t.paymentMethods.expiresLabel} {String(pendingDeleteCard.expMonth).padStart(2, '0')}/
        {pendingDeleteCard.expYear}
      </div>
    </div>
  ) : null;

  // Cart order: Google Pay → Apple Pay → PayPal → Bancontact (then cards).
  const preferenceCards: {
    method: PreferenceMethod;
    label: string;
    description: string;
    enabled: boolean;
  }[] = [
    ...(shopPaymentMethods.googlePay && walletAvailability.ready && walletAvailability.googlePay
      ? [
          {
            method: 'google_pay' as const,
            label: 'Google Pay',
            description: t.paymentMethods.googlePayDescription,
            enabled: googlePayEnabled,
          },
        ]
      : []),
    ...(shopPaymentMethods.applePay && walletAvailability.ready && walletAvailability.applePay
      ? [
          {
            method: 'apple_pay' as const,
            label: 'Apple Pay',
            description: t.paymentMethods.applePayDescription,
            enabled: applePayEnabled,
          },
        ]
      : []),
    ...(shopPaymentMethods.paypal
      ? [
          {
            method: 'paypal' as const,
            label: 'PayPal',
            description: t.paymentMethods.paypalDescription,
            enabled: paypalEnabled,
          },
        ]
      : []),
    ...(shopPaymentMethods.bancontact
      ? [
          {
            method: 'bancontact' as const,
            label: 'Bancontact',
            description: t.paymentMethods.bancontactDescription,
            enabled: bancontactEnabled,
          },
        ]
      : []),
    ...(shopPaymentMethods.card
      ? [
          {
            method: 'new_card' as const,
            label: t.cart.newCardPaymentMethodLabel,
            description: t.paymentMethods.newCardDescription,
            enabled: newCardEnabled,
          },
        ]
      : []),
  ];

  const disableConfirmCopy =
    confirmDisablePreference === 'paypal'
      ? {
          title: t.paymentMethods.paypalDisableConfirmTitle,
          message: t.paymentMethods.paypalDisableConfirmMessage,
        }
      : confirmDisablePreference === 'bancontact'
        ? {
            title: t.paymentMethods.bancontactDisableConfirmTitle,
            message: t.paymentMethods.bancontactDisableConfirmMessage,
          }
        : confirmDisablePreference === 'google_pay'
          ? {
              title: t.paymentMethods.googlePayDisableConfirmTitle,
              message: t.paymentMethods.googlePayDisableConfirmMessage,
            }
          : confirmDisablePreference === 'apple_pay'
            ? {
                title: t.paymentMethods.applePayDisableConfirmTitle,
                message: t.paymentMethods.applePayDisableConfirmMessage,
              }
            : confirmDisablePreference === 'new_card'
              ? {
                  title: t.paymentMethods.newCardDisableConfirmTitle,
                  message: t.paymentMethods.newCardDisableConfirmMessage,
                }
              : null;

  function preferenceBrandMark(method: PreferenceMethod) {
    if (method === 'new_card') return null;
    const brand: PaymentBrandKey =
      method === 'paypal'
        ? 'paypal'
        : method === 'bancontact'
          ? 'bancontact'
          : method === 'google_pay'
            ? 'google_pay'
            : 'apple_pay';
    const className =
      brand === 'paypal'
        ? styles.paypalBrand
        : brand === 'bancontact'
          ? styles.bancontactBrand
          : brand === 'google_pay'
            ? styles.googlePayBrand
            : styles.applePayBrand;
    return <PaymentBrandMark brand={brand} className={className} />;
  }

  return (
    <AccountShell
      loading={
        loading || loadedAccountId !== (user?.id ?? null) || (!loadFailed && !walletAvailability.ready)
      }
    >
      <section aria-labelledby="payment-methods-h" className={styles.section} data-testid="account-payments">
        <Seo
          title={t.paymentMethods.pageTitle}
          description={t.paymentMethods.pageSubtitle}
          path="/account/payment-methods"
          noindex
        />
        <LegalPageBackLink placement="top" />
        <h1 id="payment-methods-h" className={`${styles.title} ${styles.hasSubtitle}`}>
          {t.paymentMethods.pageTitle}
        </h1>
        <p className={styles.subtitle}>{t.paymentMethods.pageSubtitle}</p>

        {loadFailed && (
          <p className={styles.subtitle} role="alert">
            {t.auth.errorGeneric}
          </p>
        )}

        {!loading && !loadFailed && (
          <div className={`${styles.list} ${styles.paymentMethodsList}`}>
            {preferenceCards.map(({ method, label, description, enabled }) => (
              <div key={method} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardLabel}>{label}</span>
                  <span className={styles.paymentBrandMark} aria-hidden="true">
                    {preferenceBrandMark(method)}
                  </span>
                </div>
                <div className={styles.cardBody}>{description}</div>
                <div className={styles.cardActions}>
                  <div className={`${styles.toggleAction} ${styles.courierToggleRow}`}>
                    {/* The button's own name repeats this visible action. */}
                    <span aria-hidden="true">
                      {enabled ? t.paymentMethods.paypalDisableAction : t.paymentMethods.paypalEnableAction}
                    </span>
                    <ToggleSwitch
                      checked={enabled}
                      labelIsAction
                      aria-label={`${
                        enabled ? t.paymentMethods.paypalDisableAction : t.paymentMethods.paypalEnableAction
                      } ${label}`}
                      onChange={(next) => handleTogglePreference(method, next)}
                    />
                  </div>
                  {enabled &&
                    method !== 'new_card' &&
                    (defaultPaymentMethod?.type === method ? (
                      <button
                        type="button"
                        className={`${styles.defaultBadge} ${styles.defaultBadgeButton}`}
                        onClick={handleUnsetDefault}
                      >
                        {t.address.defaultBadge}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() =>
                          handleSetDefault({
                            type: method as Exclude<PreferenceMethod, 'new_card'>,
                          })
                        }
                      >
                        {t.address.setDefaultButton}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {paymentMethods.map((pm) => (
              <div key={pm.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.cardLabel}>
                    {pm.cardholderName || `${BRAND_LABELS[pm.brand] ?? pm.brand} •••• ${pm.last4}`}
                  </span>
                  <span className={styles.paymentBrandMark}>
                    <CardBrandMark brand={pm.brand} />
                  </span>
                </div>
                <div className={styles.cardBody}>
                  {pm.cardholderName && (
                    <>
                      {BRAND_LABELS[pm.brand] ?? pm.brand} •••• {pm.last4}
                      <br />
                    </>
                  )}
                  {t.paymentMethods.expiresLabel} {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                </div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.actionButtonDelete}`}
                    onClick={() => handleDelete(pm.id)}
                  >
                    {t.paymentMethods.deleteButton}
                  </button>
                  {shopPaymentMethods.card &&
                    (defaultPaymentMethod?.type === 'card' && defaultPaymentMethod.id === pm.id ? (
                      <button
                        type="button"
                        className={`${styles.defaultBadge} ${styles.defaultBadgeButton}`}
                        onClick={handleUnsetDefault}
                      >
                        {t.address.defaultBadge}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => handleSetDefault({ type: 'card', id: pm.id })}
                      >
                        {t.address.setDefaultButton}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {shopPaymentMethods.card && (
              <button
                type="button"
                className={styles.addCard}
                data-testid="account-add-card"
                onClick={handleOpenAddCard}
                disabled={openingAddCard}
              >
                <span className={styles.addCardIcon} aria-hidden="true">
                  +
                </span>
                <span>{t.paymentMethods.addButton}</span>
              </button>
            )}
          </div>
        )}

        {!loading && !loadFailed && (
          <p className={styles.secureNotice}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="2.5" y="6" width="9" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {t.paymentMethods.secureDataNotice}
          </p>
        )}

        {addCardSecret && (
          <AddCardModal
            t={t}
            clientSecret={addCardSecret}
            onSuccess={handleCardAdded}
            onClose={() => setAddCardSecret(null)}
          />
        )}
        {openingAddCard && <LoadingModal message={t.paymentMethods.savingCardButton} />}
        {addCardError && (
          <ConfirmModal
            variant="dialog"
            title={t.paymentMethods.addCardModalTitle}
            message={t.paymentMethods.saveCardError}
            confirmLabel={t.address.confirmButton}
            closeLabel={t.auth.closeAria}
            onConfirm={() => setAddCardError(false)}
            onCancel={() => setAddCardError(false)}
          />
        )}
        {confirmDisablePreference && disableConfirmCopy && (
          <ConfirmModal
            variant="dialog"
            title={disableConfirmCopy.title}
            message={disableConfirmCopy.message}
            confirmLabel={t.paymentMethods.paypalDisableAction}
            closeLabel={t.auth.closeAria}
            onConfirm={() => {
              const method = confirmDisablePreference;
              setConfirmDisablePreference(null);
              void applyPreferenceToggle(method, false);
            }}
            onCancel={() => setConfirmDisablePreference(null)}
          />
        )}
        {pendingDeleteId && pendingDeleteCard && (
          <ConfirmModal
            variant="dialog"
            title={t.paymentMethods.deleteConfirm}
            message={pendingDeleteMessage}
            confirmLabel={t.paymentMethods.deleteButton}
            closeLabel={t.auth.closeAria}
            confirmDanger
            onConfirm={() => void confirmDelete()}
            onCancel={() => setPendingDeleteId(null)}
          />
        )}
        <LegalPageBackLink placement="bottom" />
      </section>
    </AccountShell>
  );
}
