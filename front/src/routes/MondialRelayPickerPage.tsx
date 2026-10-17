import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import type { Strings } from '../assets/i18n/types';
import { localizedPath } from '../config/i18nRoutes';
import { Seo } from '../components/seo/Seo';
import {
  MondialRelayPicker,
  type MondialRelayCity,
  type MondialRelayPoint,
} from '../components/address/MondialRelayPickerModal';
import { shopConfig } from '../config/env';
import { listCouriers } from '../api/account';
import { isCompletePostalCode } from '../utils/postalCode';
import { toFlagEmoji } from '../utils/countryFlag';
import { Button } from '../components/ui/Button';
import styles from './MondialRelayPickerPage.module.css';

const mondialRelayLogoUrl =
  'https://widget.mondialrelay.com/parcelshop-picker/v4_0/css/themes/mondialrelay/imgs/mr-64.png';
const ORDER_ADDRESS_PICKER_RESULT_KEY = 'psn-order-address-picker-result';

interface PickerLocationState {
  /** Already locale-prefixed by the caller (see e.g. CartPage.tsx,
   * AccountAddressesPage.tsx, EditOrderBillingModal.tsx) — navigated to
   * as-is, never re-localized here. */
  returnTo?: string;
  orderId?: string;
  country?: string;
}

/** Country labels for the picker's own select. Kept keyed by ISO code
 * rather than read from `GET /account/address-countries`: searchable
 * countries come from the Point Relais courier's enabled `countries` on
 * `GET /account/couriers`. */
const COUNTRY_LABEL: Record<string, (t: Strings) => string> = {
  FR: (t) => t.address.mondialRelayCountryFrance,
  BE: (t) => t.address.mondialRelayCountryBelgium,
  LU: (t) => t.address.mondialRelayCountryLuxembourg,
  NL: (t) => t.address.mondialRelayCountryNetherlands,
  ES: (t) => t.address.mondialRelayCountrySpain,
  PT: (t) => t.address.mondialRelayCountryPortugal,
  IT: (t) => t.address.mondialRelayCountryItaly,
};

function countryLabel(code: string, t: Strings): string {
  return COUNTRY_LABEL[code]?.(t) ?? code;
}

/** Prefer a carried-over country when the Point Relais courier still
 * serves it; otherwise open on the first enabled country. */
function resolvePickerCountry(code: string | null | undefined, enabled: string[]): string {
  const upper = code?.trim().toUpperCase();
  return enabled.find((country) => country === upper) ?? enabled[0] ?? 'FR';
}

export function MondialRelayPickerPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const pickerState = location.state as PickerLocationState | null;
  const returnTo = pickerState?.returnTo ?? localizedPath('/account/addresses', lang);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState<string>();
  const [citySuggestions, setCitySuggestions] = useState<MondialRelayCity[]>([]);
  const [selectedCity, setSelectedCity] = useState<MondialRelayCity>();
  const [enabledCountries, setEnabledCountries] = useState<string[] | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MondialRelayPoint>();
  const [openingHoursExpanded, setOpeningHoursExpanded] = useState(false);
  const [openResultsRequest, setOpenResultsRequest] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const handleSelect = useCallback((point: MondialRelayPoint) => {
    setSelectedPoint(point);
    setOpeningHoursExpanded(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listCouriers();
        if (cancelled) return;
        const pickerCourier = result.couriers.find(
          (courier) => courier.code === shopConfig.mondialRelayPickerCourierCode,
        );
        const countries = pickerCourier?.countries ?? [];
        setEnabledCountries(countries);
        if (countries.length === 0) {
          setLoadError(true);
          return;
        }
        setCountry(resolvePickerCountry(pickerState?.country, countries));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickerState?.country]);

  function handleCancel() {
    navigate(returnTo, { replace: true });
  }

  function handleConfirm() {
    if (selectedPoint) {
      if (pickerState?.orderId) {
        window.sessionStorage.setItem(
          ORDER_ADDRESS_PICKER_RESULT_KEY,
          JSON.stringify({ orderId: pickerState.orderId, mondialRelayPoint: selectedPoint }),
        );
      }
      navigate(returnTo, {
        replace: true,
        state: { mondialRelayPoint: selectedPoint, orderId: pickerState?.orderId },
      });
    }
  }

  function runSearch(term: string, openResults = false) {
    // On mobile, the results arrive in a bottom sheet. Hide the virtual
    // keyboard before it opens so it cannot cover the newly available list.
    searchInputRef.current?.blur();
    setSelectedPoint(undefined);
    setSearchTerm(term);
    if (openResults) setOpenResultsRequest((request) => request + 1);
  }

  // Picking a city from the suggestions is already a deliberate, complete
  // choice — no reason to make the customer press "Rechercher" again
  // afterward. Same reasoning as the postal code auto-search below.
  function selectCity(city: MondialRelayCity) {
    setSearchInput(city.name);
    setSelectedCity(city);
    setCitySuggestions([]);
    runSearch(city.postalCode, true);
  }

  if (loadError) {
    return (
      <section aria-labelledby="mondial-relay-picker-h" className={styles.section}>
        <Seo
          title={t.address.mondialRelayPickerTitle}
          description={t.address.mondialRelayPickerTitle}
          path="/account/addresses/mondial-relay"
          noindex
        />
        <button type="button" className={styles.backButton} onClick={handleCancel}>
          ← {t.address.mondialRelayBackButton}
        </button>
        <h1 id="mondial-relay-picker-h" className={styles.title}>
          {t.address.mondialRelayPickerTitle}
        </h1>
        <p>{t.address.mondialRelayPickerError}</p>
      </section>
    );
  }

  if (!enabledCountries || !country) {
    return (
      <section aria-labelledby="mondial-relay-picker-h" className={styles.section}>
        <Seo
          title={t.address.mondialRelayPickerTitle}
          description={t.address.mondialRelayPickerTitle}
          path="/account/addresses/mondial-relay"
          noindex
        />
        <button type="button" className={styles.backButton} onClick={handleCancel}>
          ← {t.address.mondialRelayBackButton}
        </button>
        <h1 id="mondial-relay-picker-h" className={styles.title}>
          {t.address.mondialRelayPickerTitle}
        </h1>
        <p>{t.address.mondialRelayPickerLoading}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="mondial-relay-picker-h"
      className={styles.section}
      data-testid="mondial-relay-page"
    >
      <Seo
        title={t.address.mondialRelayPickerTitle}
        description={t.address.mondialRelayPickerTitle}
        path="/account/addresses/mondial-relay"
        noindex
      />
      <button
        type="button"
        className={styles.backButton}
        data-testid="mondial-relay-back"
        onClick={handleCancel}
      >
        ← {t.address.mondialRelayBackButton}
      </button>
      <h1 id="mondial-relay-picker-h" className={styles.title}>
        {t.address.mondialRelayPickerTitle}
      </h1>
      <div className={styles.searchForm} data-testid="mondial-relay-search-form">
        <img className={styles.searchLogo} src={mondialRelayLogoUrl} alt="Mondial Relay" />
        <div className={styles.locationField}>
          <label className={styles.searchLabel}>
            {t.address.mondialRelaySearchField}
            {/* This is a transient city-or-postal-code lookup, not a
                customer credential or payment field. Keep password-manager
                controls out of it. */}
            {/* A recognised lookup field prevents mobile browsers from
                classifying this as a credential or payment field. A city
                can still be typed normally; postal-code is the closest
                HTML autofill purpose for the values this field accepts. */}
            <input
              ref={searchInputRef}
              type="search"
              name="mondial-relay-parcel-shop-search"
              autoComplete="postal-code"
              enterKeyHint="search"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-testid="mondial-relay-search"
              value={searchInput}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedCity(undefined);
                setSearchInput(value);
                // A postal code needs no further confirmation once it's
                // the right length for the selected country — no reason
                // to also wait for the button.
                if (isCompletePostalCode(value, country)) runSearch(value.trim());
              }}
            />
          </label>
          {citySuggestions.length > 0 && (
            <div className={styles.citySuggestions} role="listbox">
              {citySuggestions.map((city) => (
                <button
                  key={`${city.name}-${city.postalCode}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => selectCity(city)}
                >
                  {city.name} ({city.postalCode})
                </button>
              ))}
            </div>
          )}
        </div>
        {/* A single enabled country is not a choice — the select would
            only be a dead control, so the picker just searches that one
            country. */}
        {enabledCountries.length > 1 && (
          <label className={`${styles.searchLabel} ${styles.countryField}`}>
            {t.address.countryField}
            <select
              data-testid="mondial-relay-country"
              value={country}
              onChange={(event) => {
                setSelectedPoint(undefined);
                setSelectedCity(undefined);
                setCitySuggestions([]);
                setCountry(event.target.value);
              }}
            >
              {enabledCountries.map((code) => (
                <option key={code} value={code}>
                  {toFlagEmoji(code)} {countryLabel(code, t)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {/* Map + list of points (see MondialRelayPicker's own responsive CSS
          for how those two arrange between mobile/desktop), then opening
          hours, then the confirm block — same relative order on every
          size; only the map/list's own internal arrangement changes by
          breakpoint. */}
      <MondialRelayPicker
        t={t}
        lang={lang}
        brand={shopConfig.mondialRelayBrand}
        {...(searchTerm !== undefined ? { searchTerm } : {})}
        openResultsRequest={openResultsRequest}
        {...(!selectedCity && searchInput !== undefined ? { cityQuery: searchInput } : {})}
        country={country}
        allowedCountries={enabledCountries}
        onSelect={handleSelect}
        onCitySuggestions={setCitySuggestions}
      />
      {selectedPoint && selectedPoint.openingHours.length > 0 && (
        <section className={styles.openingHours} aria-labelledby="mondial-relay-opening-hours">
          <h2 id="mondial-relay-opening-hours">{t.address.mondialRelayOpeningHoursTitle}</h2>
          {openingHoursExpanded && (
            <dl className={styles.openingHoursList}>
              {selectedPoint.openingHours.map(({ day, periods }) => (
                <div key={day} className={styles.openingHoursRow}>
                  <dt>{day}</dt>
                  <dd>
                    {periods.length > 0 ? (
                      <span className={styles.openingHoursPeriods}>{periods.join(' · ')}</span>
                    ) : (
                      <span className={styles.closed}>{t.address.mondialRelayClosed}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            className={styles.openingHoursToggle}
            aria-expanded={openingHoursExpanded}
            onClick={() => setOpeningHoursExpanded((expanded) => !expanded)}
          >
            {openingHoursExpanded
              ? t.address.mondialRelayShowLessHours
              : t.address.mondialRelayCheckOpeningHours}
          </button>
        </section>
      )}
      <div className={styles.selection} aria-live="polite">
        <h2 className={styles.selectionTitle}>{t.address.mondialRelayValidationTitle}</h2>
        <div className={styles.selectionBody}>
          {selectedPoint ? (
            <div className={styles.selectedPoint}>
              <span>{t.address.mondialRelaySelectedPoint}</span>
              <strong>{selectedPoint.name}</strong>
              <span>
                {selectedPoint.line1}, {selectedPoint.postalCode} {selectedPoint.city}
              </span>
            </div>
          ) : (
            <p className={styles.noSelection}>{t.address.mondialRelayNoSelectedPoint}</p>
          )}
          <div className={styles.selectionActions}>
            <Button
              className={styles.confirmButton}
              disabled={!selectedPoint}
              onClick={handleConfirm}
              data-testid="mondial-relay-confirm"
            >
              {t.address.mondialRelayConfirmButton}
            </Button>
            <button
              type="button"
              className={styles.cancelLink}
              data-testid="mondial-relay-cancel"
              onClick={handleCancel}
            >
              {t.address.cancelButton}
            </button>
          </div>
          {searchTerm && !selectedPoint && (
            <p className={styles.selectPointError}>{t.address.mondialRelaySelectPointError}</p>
          )}
        </div>
      </div>
    </section>
  );
}
