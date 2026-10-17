import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { ApiError } from '../api/errors';
import {
  getAdminPreferences,
  getAdminShippingCatalog,
  patchAdminAddressCountry,
  patchAdminCourier,
  patchAdminCourierCountry,
  patchAdminPreferences,
  type AdminPreferences,
  type AdminShippingCatalog,
} from '../api/admin/commerce';
import { useAuthSession } from '../state/AuthContext';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { invalidateFilterOptionsCache } from '../api/filterOptions';
import styles from './AdminPreferencesPage.module.css';
import { ToggleRow } from './adminPreferencesToggles';
import { SPY_GROUPS, spyLabel } from './adminPreferencesSpy';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { useLang } from '../assets/i18n';
import { AdminPreferencesCronLogToggles } from './adminPreferencesCronLogs';
import { AdminPreferencesCatalogue } from './adminPreferencesCatalogue';
import { AdminPreferenceOpenings } from './AdminPreferenceOpenings';
import { SIGN_IN_ROWS, type SignInPrefKey, type SignInVerbosePrefKey } from './adminPreferencesSignIn';
import { shopConfig } from '../config/env';

type PrefsTab = 'boutique' | 'livraison' | 'notifications' | 'technique';

function prefsTabs(a: AdminUiStrings): { id: PrefsTab; label: string }[] {
  return [
    { id: 'boutique', label: a.prefs.tabShop },
    { id: 'livraison', label: a.prefs.tabDelivery },
    { id: 'notifications', label: a.prefs.tabNotifications },
    { id: 'technique', label: a.prefs.tabTechnical },
  ];
}

type PaymentPrefKey =
  | 'paymentCardEnabled'
  | 'paymentPaypalEnabled'
  | 'paymentBancontactEnabled'
  | 'paymentGooglePayEnabled'
  | 'paymentApplePayEnabled';

const PAYMENT_COUNTRY_KEYS: Record<PaymentPrefKey, keyof AdminPreferences['paymentMethodCountries']> = {
  paymentCardEnabled: 'card',
  paymentPaypalEnabled: 'paypal',
  paymentBancontactEnabled: 'bancontact',
  paymentGooglePayEnabled: 'googlePay',
  paymentApplePayEnabled: 'applePay',
};

/** Brand names stay as they are; the card title and every hint follow the
 * admin language. */
function paymentRows(a: AdminUiStrings): { key: PaymentPrefKey; title: string; hint: string }[] {
  return [
    { key: 'paymentCardEnabled', title: a.prefs.cardTitle, hint: a.prefs.cardHint },
    { key: 'paymentPaypalEnabled', title: 'PayPal', hint: a.prefs.paypalHint },
    { key: 'paymentBancontactEnabled', title: 'Bancontact', hint: a.prefs.bancontactHint },
    { key: 'paymentGooglePayEnabled', title: 'Google Pay', hint: a.prefs.googlePayHint },
    { key: 'paymentApplePayEnabled', title: 'Apple Pay', hint: a.prefs.applePayHint },
  ];
}

const PAYMENT_ROW_COUNT = 5;

type PendingPaymentToggle = {
  key: PaymentPrefKey;
  title: string;
  next: boolean;
};

type PendingSignInToggle = {
  key: SignInPrefKey | SignInVerbosePrefKey;
  title: string;
  next: boolean;
};

type PendingFacebookFlowToggle = {
  next: boolean;
};

type PendingShippingToggle = { kind: 'courier'; code: string; title: string; next: boolean };

function addressAllCountriesEnabled(countries: AdminShippingCatalog['addressCountries']): boolean {
  return countries.length > 0 && countries.every((entry) => entry.enabled);
}

function courierAllCountriesEnabled(courier: AdminShippingCatalog['couriers'][number]): boolean {
  return courier.countries.length > 0 && courier.countries.every((entry) => entry.enabled);
}

function parseTab(value: string | null): PrefsTab {
  if (value === 'boutique' || value === 'livraison' || value === 'notifications' || value === 'technique') {
    return value;
  }
  return 'boutique';
}

function shippingErrorMessage(error: unknown, a: AdminUiStrings): string {
  if (error instanceof ApiError) {
    if (error.code === 'packet_price_missing') return a.prefs.errPacketPriceMissing;
    if (error.code === 'not_found' || error.code === 'courier_not_found') return a.prefs.errNotFound;
  }
  return a.prefs.errSave;
}

export function AdminPreferencesPage() {
  const { authedRequest } = useAuthSession();
  const { t } = useLang();
  const a = useAdminStrings();
  const PAYMENT_ROWS = useMemo(() => paymentRows(a), [a]);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get('tab'));

  const [preferences, setPreferences] = useState<AdminPreferences | null>(null);
  const [shipping, setShipping] = useState<AdminShippingCatalog | null>(null);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentToggle | null>(null);
  const [pendingSignIn, setPendingSignIn] = useState<PendingSignInToggle | null>(null);
  const [pendingFacebookFlow, setPendingFacebookFlow] = useState<PendingFacebookFlowToggle | null>(null);
  const [pendingShipping, setPendingShipping] = useState<PendingShippingToggle | null>(null);

  const busy = loadingPrefs || loadingShipping || savingKey !== null;
  const loadingMessage = savingKey !== null ? t.admin.actionLoading : t.admin.contentLoading;

  const loadPreferences = useCallback(async () => {
    setLoadingPrefs(true);
    setError(null);
    try {
      const prefsResult = await withMinDuration(
        authedRequest((token) => getAdminPreferences(token)),
        shopConfig.loadingMinMs.short,
      );
      setPreferences(prefsResult.preferences);
    } catch {
      setError(a.prefs.loadError);
    } finally {
      setLoadingPrefs(false);
    }
  }, [authedRequest, a.prefs.loadError]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    if ((activeTab !== 'livraison' && activeTab !== 'boutique') || shipping) return;
    let cancelled = false;
    setLoadingShipping(true);
    setError(null);
    void (async () => {
      try {
        const shippingResult = await withMinDuration(
          authedRequest((token) => getAdminShippingCatalog(token)),
          shopConfig.loadingMinMs.short,
        );
        if (cancelled) return;
        setShipping({
          addressCountries: shippingResult.addressCountries,
          couriers: shippingResult.couriers,
        });
      } catch {
        if (!cancelled) setError(a.prefs.shippingLoadError);
      } finally {
        if (!cancelled) setLoadingShipping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, shipping, authedRequest, a.prefs.shippingLoadError]);

  function selectTab(tab: PrefsTab) {
    setNotice(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === 'boutique') {
          next.delete('tab');
        } else {
          next.set('tab', tab);
        }
        return next;
      },
      { replace: true },
    );
  }

  async function save(patch: Parameters<typeof patchAdminPreferences>[1], key: string) {
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => patchAdminPreferences(token, patch)),
        shopConfig.loadingMinMs.short,
      );
      setPreferences(result.preferences);
      if (
        Object.prototype.hasOwnProperty.call(patch, 'outOfStockEnabled') ||
        Object.prototype.hasOwnProperty.call(patch, 'outOfStockSizeRequestEnabled')
      ) {
        invalidateFilterOptionsCache();
      }
      setNotice(a.prefs.savedNotice);
    } catch {
      setError(a.prefs.errSave);
    } finally {
      setSavingKey(null);
    }
  }

  async function confirmPaymentToggle() {
    if (!pendingPayment) return;
    const { key, next } = pendingPayment;
    setPendingPayment(null);
    await save({ [key]: next }, key);
  }

  async function confirmSignInToggle() {
    if (!pendingSignIn) return;
    const { key, next } = pendingSignIn;
    setPendingSignIn(null);
    await save({ [key]: next }, key);
  }

  async function confirmFacebookFlowToggle() {
    if (!pendingFacebookFlow) return;
    const { next } = pendingFacebookFlow;
    setPendingFacebookFlow(null);
    await save({ facebookMobileDirectOAuthEnabled: next }, 'facebookMobileDirectOAuth');
  }

  async function confirmShippingToggle() {
    if (!pendingShipping) return;
    const pending = pendingShipping;
    setPendingShipping(null);
    const key = `courier.${pending.code}`;
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      await withMinDuration(
        authedRequest((token) => patchAdminCourier(token, pending.code, pending.next)),
        shopConfig.loadingMinMs.short,
      );
      setShipping((current) => {
        if (!current) return current;
        return {
          ...current,
          couriers: current.couriers.map((row) =>
            row.code === pending.code ? { ...row, enabled: pending.next } : row,
          ),
        };
      });
      setNotice(a.prefs.shippingSavedNotice);
    } catch (err) {
      setError(shippingErrorMessage(err, a));
    } finally {
      setSavingKey(null);
    }
  }

  async function saveAddressCountryInline(countryCode: string, enabled: boolean) {
    const key = `address.${countryCode}`;
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      await withMinDuration(
        authedRequest((token) => patchAdminAddressCountry(token, countryCode, enabled)),
        shopConfig.loadingMinMs.short,
      );
      setShipping((current) => {
        if (!current) return current;
        return {
          ...current,
          addressCountries: current.addressCountries.map((row) =>
            row.code === countryCode ? { ...row, enabled } : row,
          ),
        };
      });
      setNotice(a.prefs.shippingSavedNotice);
    } catch (err) {
      setError(shippingErrorMessage(err, a));
    } finally {
      setSavingKey(null);
    }
  }

  async function saveAllAddressCountries(enable: boolean) {
    if (!shipping) return;
    const key = 'address.countries-all';
    setSavingKey(key);
    setError(null);
    setNotice(null);
    const targets = shipping.addressCountries.filter((entry) => entry.enabled !== enable);
    try {
      await withMinDuration(
        authedRequest(async (token) => {
          for (const entry of targets) {
            await patchAdminAddressCountry(token, entry.code, enable);
          }
        }),
        shopConfig.loadingMinMs.short,
      );
      setShipping((current) => {
        if (!current) return current;
        return {
          ...current,
          addressCountries: current.addressCountries.map((entry) => ({ ...entry, enabled: enable })),
        };
      });
      setNotice(a.prefs.shippingSavedNotice);
    } catch (err) {
      setError(shippingErrorMessage(err, a));
    } finally {
      setSavingKey(null);
    }
  }

  async function saveCourierCountryInline(courierCode: string, countryCode: string, enabled: boolean) {
    const key = `courierCountry.${courierCode}.${countryCode}`;
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      await withMinDuration(
        authedRequest((token) => patchAdminCourierCountry(token, courierCode, countryCode, enabled)),
        shopConfig.loadingMinMs.short,
      );
      setShipping((current) => {
        if (!current) return current;
        return {
          ...current,
          couriers: current.couriers.map((row) =>
            row.code !== courierCode
              ? row
              : {
                  ...row,
                  countries: row.countries.map((entry) =>
                    entry.code === countryCode ? { ...entry, enabled } : entry,
                  ),
                },
          ),
        };
      });
      setNotice(a.prefs.shippingSavedNotice);
    } catch (err) {
      setError(shippingErrorMessage(err, a));
    } finally {
      setSavingKey(null);
    }
  }

  async function saveCourierAllCountries(courier: AdminShippingCatalog['couriers'][number], enable: boolean) {
    const key = `courier.${courier.code}.countries-all`;
    setSavingKey(key);
    setError(null);
    setNotice(null);
    const targets = courier.countries.filter((entry) => entry.enabled !== enable);
    try {
      await withMinDuration(
        authedRequest(async (token) => {
          for (const entry of targets) {
            await patchAdminCourierCountry(token, courier.code, entry.code, enable);
          }
        }),
        shopConfig.loadingMinMs.short,
      );
      setShipping((current) => {
        if (!current) return current;
        return {
          ...current,
          couriers: current.couriers.map((row) =>
            row.code !== courier.code
              ? row
              : {
                  ...row,
                  countries: row.countries.map((entry) => ({ ...entry, enabled: enable })),
                },
          ),
        };
      });
      setNotice(a.prefs.shippingSavedNotice);
    } catch (err) {
      setError(shippingErrorMessage(err, a));
    } finally {
      setSavingKey(null);
    }
  }

  const countryLabel = (code: string) =>
    shipping?.addressCountries.find((row) => row.code === code)?.label ?? code;

  const paymentActiveCount = useMemo(() => {
    if (!preferences) return 0;
    return PAYMENT_ROWS.filter((row) => preferences[row.key]).length;
  }, [preferences, PAYMENT_ROWS]);

  const signInActiveCount = useMemo(() => {
    if (!preferences) return 0;
    return SIGN_IN_ROWS.filter((row) => preferences[row.key]).length;
  }, [preferences]);

  const statusLine = useMemo(() => {
    if (!preferences) return null;
    if (activeTab === 'boutique') {
      return a.prefs.statusShop(
        paymentActiveCount,
        PAYMENT_ROW_COUNT,
        signInActiveCount,
        SIGN_IN_ROWS.length,
      );
    }
    if (activeTab === 'livraison' && shipping) {
      const formActive = shipping.addressCountries.filter((c) => c.enabled).length;
      const courierActive = shipping.couriers.filter((c) => c.enabled).length;
      return a.prefs.statusDelivery(
        formActive,
        shipping.addressCountries.length,
        courierActive,
        shipping.couriers.length,
      );
    }
    return null;
  }, [activeTab, paymentActiveCount, signInActiveCount, preferences, shipping, a.prefs]);

  return (
    <section className={styles.section}>
      <Seo
        title={a.prefs.title}
        description={a.prefs.seoDescription}
        path={adminPath('/preferences')}
        noindex
      />
      <h1 className={styles.title}>{a.prefs.title}</h1>

      <div className={styles.tabs} role="tablist" aria-label={a.prefs.tabsAria}>
        {prefsTabs(a).map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`prefs-tab-${tab.id}`}
              className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {statusLine && <p className={styles.statusLine}>{statusLine}</p>}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && <p className={styles.notice}>{notice}</p>}

      {preferences && (
        <div className={styles.groups} role="tabpanel" aria-labelledby={`prefs-tab-${activeTab}`}>
          {activeTab === 'boutique' && (
            <>
              <AdminPreferencesCatalogue preferences={preferences} busy={busy} save={save} />
              <AdminPreferenceOpenings slot="preferences" />

              <section className={styles.panel} aria-labelledby="prefs-payments">
                <h2 id="prefs-payments" className={styles.panelTitle}>
                  {a.prefs.paymentsTitle}
                </h2>
                <p className={styles.panelHint}>{a.prefs.paymentsHint}</p>
                {PAYMENT_ROWS.map((row) => (
                  <div key={row.key}>
                    <ToggleRow
                      title={row.title}
                      hint={row.hint}
                      checked={preferences[row.key]}
                      disabled={busy}
                      onChange={(checked) =>
                        setPendingPayment({ key: row.key, title: row.title, next: checked })
                      }
                    />
                    {preferences[row.key] && shipping && (
                      <div className={styles.paymentCountriesBlock}>
                        <p className={styles.hint}>{a.prefs.paymentCountriesHint}</p>
                        <div className={styles.paymentCountriesGrid}>
                          {(() => {
                            const field = PAYMENT_COUNTRY_KEYS[row.key];
                            const current = preferences.paymentMethodCountries?.[field] ?? [];
                            const worldwide = current.includes('ALL');
                            return (
                              <>
                                <label key={`${row.key}-ALL`} className={styles.paymentCountryChip}>
                                  <input
                                    type="checkbox"
                                    checked={worldwide}
                                    disabled={busy}
                                    onChange={() => {
                                      void save(
                                        {
                                          paymentMethodCountries: {
                                            [field]: worldwide ? [] : ['ALL'],
                                          },
                                        },
                                        `${row.key}-countries-all`,
                                      );
                                    }}
                                  />
                                  <span>{a.prefs.allCountries}</span>
                                </label>
                                {shipping.addressCountries.map((country) => {
                                  const selected = !worldwide && current.includes(country.code);
                                  return (
                                    <label
                                      key={`${row.key}-${country.code}`}
                                      className={styles.paymentCountryChip}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={busy || worldwide}
                                        onChange={() => {
                                          const next = selected
                                            ? current.filter((code) => code !== country.code)
                                            : [...current.filter((code) => code !== 'ALL'), country.code];
                                          void save(
                                            {
                                              paymentMethodCountries: {
                                                [field]: next,
                                              },
                                            },
                                            `${row.key}-countries`,
                                          );
                                        }}
                                      />
                                      <span>
                                        {country.label} ({country.code})
                                      </span>
                                    </label>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <section className={styles.panel} aria-labelledby="prefs-sign-in">
                <h2 id="prefs-sign-in" className={styles.panelTitle}>
                  {a.prefs.signInTitle}
                </h2>
                <p className={styles.panelHint}>{a.prefs.signInHint}</p>
                <div className={styles.cardGridWide}>
                  {SIGN_IN_ROWS.map((row) => {
                    const enabled = preferences[row.key];
                    return (
                      <article key={row.key} className={styles.shipCard}>
                        <header className={styles.shipCardHeader}>
                          <div className={styles.shipCardText}>
                            <strong className={styles.shipCardTitle}>{row.title}</strong>
                          </div>
                          <ToggleSwitch
                            checked={enabled}
                            disabled={busy}
                            onChange={(checked) =>
                              setPendingSignIn({ key: row.key, title: row.title, next: checked })
                            }
                            aria-label={a.prefs.signInAria(row.title)}
                          />
                        </header>
                        <ul className={styles.shipCardList}>
                          <li className={styles.shipCardRow}>
                            <div className={styles.shipCardText}>
                              <strong>{a.prefs.detailedSignIn}</strong>
                              <span className={styles.hint}>{a.prefs.detailedSignInHint}</span>
                            </div>
                            <ToggleSwitch
                              checked={preferences[row.verboseKey] === true}
                              disabled={busy || !enabled}
                              onChange={(checked) =>
                                setPendingSignIn({
                                  key: row.verboseKey,
                                  title: a.prefs.detailedSignInFor(row.title),
                                  next: checked,
                                })
                              }
                              aria-label={a.prefs.detailedSignInFor(row.title)}
                            />
                          </li>
                          {row.key === 'signInFacebookEnabled' && (
                            <li className={styles.shipCardRow}>
                              <div className={styles.shipCardText}>
                                <strong>{a.prefs.directOAuth}</strong>
                                <span className={styles.hint}>{a.prefs.directOAuthHint}</span>
                              </div>
                              <ToggleSwitch
                                checked={preferences.facebookMobileDirectOAuthEnabled === true}
                                disabled={busy || !enabled}
                                onChange={(checked) => setPendingFacebookFlow({ next: checked })}
                                aria-label={a.prefs.directOAuth}
                              />
                            </li>
                          )}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </section>
              <AdminPreferenceOpenings slot="signInMethods" />
            </>
          )}

          {activeTab === 'livraison' && shipping && (
            <>
              <section className={styles.panel} aria-labelledby="prefs-address-countries">
                <h2 id="prefs-address-countries" className={styles.panelTitle}>
                  {a.prefs.addressCountriesTitle}
                </h2>
                <p className={styles.panelHint}>{a.prefs.addressCountriesHint}</p>
                <div className={styles.paymentCountriesGrid}>
                  {(() => {
                    const worldwide = addressAllCountriesEnabled(shipping.addressCountries);
                    return (
                      <>
                        <label className={styles.paymentCountryChip}>
                          <input
                            type="checkbox"
                            checked={worldwide}
                            disabled={busy || shipping.addressCountries.length === 0}
                            onChange={() => {
                              void saveAllAddressCountries(!worldwide);
                            }}
                          />
                          <span>{a.prefs.allCountries}</span>
                        </label>
                        {shipping.addressCountries.map((country) => {
                          const selected = !worldwide && country.enabled;
                          return (
                            <label key={country.code} className={styles.paymentCountryChip}>
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={busy || worldwide}
                                onChange={() => {
                                  void saveAddressCountryInline(country.code, !selected);
                                }}
                              />
                              <span>
                                {country.label} ({country.code})
                              </span>
                            </label>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </section>

              <section className={styles.panel} aria-labelledby="prefs-couriers">
                <h2 id="prefs-couriers" className={styles.panelTitle}>
                  {a.prefs.couriersTitle}
                </h2>
                <p className={styles.panelHint}>{a.prefs.couriersHint}</p>
                {shipping.couriers.map((courier) => (
                  <div key={courier.code}>
                    <ToggleRow
                      title={courier.name}
                      hint={courier.code}
                      checked={courier.enabled}
                      disabled={busy}
                      onChange={(checked) =>
                        setPendingShipping({
                          kind: 'courier',
                          code: courier.code,
                          title: courier.name,
                          next: checked,
                        })
                      }
                    />
                    {courier.enabled && (
                      <div className={styles.paymentCountriesBlock}>
                        <p className={styles.hint}>{a.prefs.courierCountriesHint}</p>
                        <div className={styles.paymentCountriesGrid}>
                          {(() => {
                            const worldwide = courierAllCountriesEnabled(courier);
                            return (
                              <>
                                <label className={styles.paymentCountryChip}>
                                  <input
                                    type="checkbox"
                                    checked={worldwide}
                                    disabled={busy || courier.countries.length === 0}
                                    onChange={() => {
                                      void saveCourierAllCountries(courier, !worldwide);
                                    }}
                                  />
                                  <span>{a.prefs.allCountries}</span>
                                </label>
                                {courier.countries.map((entry) => {
                                  const selected = !worldwide && entry.enabled;
                                  return (
                                    <label key={entry.code} className={styles.paymentCountryChip}>
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={busy || worldwide}
                                        onChange={() => {
                                          void saveCourierCountryInline(courier.code, entry.code, !selected);
                                        }}
                                      />
                                      <span>
                                        {countryLabel(entry.code)} ({entry.code})
                                      </span>
                                    </label>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}

          {activeTab === 'notifications' && (
            <>
              <section className={styles.panel} aria-labelledby="prefs-contact">
                <h2 id="prefs-contact" className={styles.panelTitle}>
                  {a.prefs.contactEmailsTitle}
                </h2>
                <p className={styles.panelHint}>{a.prefs.contactEmailsHint}</p>
                <ToggleRow
                  title={a.prefs.guestForm}
                  hint={a.prefs.guestFormHint}
                  checked={preferences.contactEmailGuestEnabled}
                  disabled={busy}
                  onChange={(checked) => void save({ contactEmailGuestEnabled: checked }, 'contactGuest')}
                />
                <ToggleRow
                  title={a.prefs.accountChat}
                  hint={a.prefs.accountChatHint}
                  checked={preferences.contactEmailConnectedEnabled}
                  disabled={busy}
                  onChange={(checked) =>
                    void save({ contactEmailConnectedEnabled: checked }, 'contactConnected')
                  }
                />
              </section>

              {SPY_GROUPS.map((group) => (
                <section key={group.id} className={styles.panel} aria-labelledby={`prefs-spy-${group.id}`}>
                  <h2 id={`prefs-spy-${group.id}`} className={styles.panelTitle}>
                    {a.prefs.spyTitle(a.spy[group.title])}
                  </h2>
                  <p className={styles.panelHint}>{a.prefs.spyHint}</p>
                  {group.kinds.map((kind) => (
                    <ToggleRow
                      key={kind}
                      title={spyLabel(a, kind)}
                      hint={kind}
                      checked={preferences.spy[kind]}
                      disabled={busy}
                      onChange={(checked) => void save({ spy: { [kind]: checked } }, `spy.${kind}`)}
                    />
                  ))}
                </section>
              ))}
              <AdminPreferenceOpenings slot="notifications" />
            </>
          )}

          {activeTab === 'technique' && (
            <AdminPreferencesCronLogToggles preferences={preferences} busy={busy} save={save} />
          )}

          {preferences.updatedAt && (
            <p className={styles.meta}>{a.prefs.lastUpdate(preferences.updatedAt)}</p>
          )}
        </div>
      )}

      {pendingPayment && (
        <ConfirmModal
          title={
            pendingPayment.next
              ? a.prefs.turnOnTitle(pendingPayment.title)
              : a.prefs.turnOffTitle(pendingPayment.title)
          }
          message={
            pendingPayment.next
              ? a.prefs.paymentOnMessage(pendingPayment.title)
              : a.prefs.paymentOffMessage(pendingPayment.title)
          }
          confirmLabel={pendingPayment.next ? a.prefs.turnOn : a.prefs.turnOff}
          closeLabel={a.prefs.close}
          confirmDanger={!pendingPayment.next}
          onConfirm={() => void confirmPaymentToggle()}
          onCancel={() => setPendingPayment(null)}
        />
      )}

      {pendingSignIn && (
        <ConfirmModal
          title={
            pendingSignIn.next
              ? a.prefs.turnOnTitle(pendingSignIn.title)
              : a.prefs.turnOffTitle(pendingSignIn.title)
          }
          message={
            pendingSignIn.next
              ? a.prefs.signInOnMessage(pendingSignIn.title)
              : a.prefs.signInOffMessage(pendingSignIn.title)
          }
          confirmLabel={pendingSignIn.next ? a.prefs.turnOn : a.prefs.turnOff}
          closeLabel={a.prefs.close}
          confirmDanger={!pendingSignIn.next}
          onConfirm={() => void confirmSignInToggle()}
          onCancel={() => setPendingSignIn(null)}
        />
      )}

      {pendingFacebookFlow && (
        <ConfirmModal
          title={pendingFacebookFlow.next ? a.prefs.directOAuthOnTitle : a.prefs.directOAuthOffTitle}
          message={pendingFacebookFlow.next ? a.prefs.directOAuthOnMessage : a.prefs.directOAuthOffMessage}
          confirmLabel={a.prefs.save}
          closeLabel={a.prefs.close}
          onConfirm={() => void confirmFacebookFlowToggle()}
          onCancel={() => setPendingFacebookFlow(null)}
        />
      )}

      {pendingShipping && (
        <ConfirmModal
          title={
            pendingShipping.next
              ? a.prefs.turnOnTitle(pendingShipping.title)
              : a.prefs.turnOffTitle(pendingShipping.title)
          }
          message={
            pendingShipping.next
              ? a.prefs.courierOnMessage(pendingShipping.title)
              : a.prefs.courierOffMessage(pendingShipping.title)
          }
          confirmLabel={pendingShipping.next ? a.prefs.turnOn : a.prefs.turnOff}
          closeLabel={a.prefs.close}
          confirmDanger={!pendingShipping.next}
          onConfirm={() => void confirmShippingToggle()}
          onCancel={() => setPendingShipping(null)}
        />
      )}

      {busy && <LoadingModal message={loadingMessage} />}
    </section>
  );
}
