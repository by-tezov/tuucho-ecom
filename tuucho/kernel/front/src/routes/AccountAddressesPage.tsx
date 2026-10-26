import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import type { Strings } from '../assets/i18n/types';
import { shopConfig } from '../config/env';
import { useAuthSession } from '../state/AuthContext';
import { invalidateCartBootstrapCache, markCheckoutEntityDeleted } from '../state/cartBootstrapCache';
import { Seo } from '../components/seo/Seo';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { AccountShell } from '../components/account/AccountShell';
import * as authApi from '../api/account';
import type { Address, AddressInput, AddressKind, Country, Courier } from '../api/account';
import { AddressFormModal } from '../components/address/AddressFormModal';
import type { PickupPoint } from '../components/address/pickupPoint';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { courierCompatible } from '../utils/courierMatch';
import { identityName } from '../utils/customerIdentity';
import { toFlagEmoji } from '../utils/countryFlag';
import { pickupPointName } from '../utils/pickupPoint';
import { CourierLogo, CourierLogos } from '../components/ui/CourierLogo';
import styles from './AccountAddressesPage.module.css';

export function AccountAddressesPage() {
  const { t, lang } = useLang();
  const { authedRequest, user } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [defaultCourierCode, setDefaultCourierCode] = useState<string | null>(null);
  const [disabledCourierCodes, setDisabledCourierCodes] = useState<string[]>([]);
  // Set when turning a courier tile's toggle off — enabling is instant, only
  // disabling gets a confirmation step (same asymmetry as the PayPal toggle
  // on the payment-methods page).
  const [confirmDisableCourier, setConfirmDisableCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestKey = `${user?.id ?? ''}:${lang}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [addressModal, setAddressModal] = useState<{
    kind: AddressKind;
    initial?: Partial<Address>;
    id?: string;
  } | null>(null);
  // Set when trying to make a livraison address default while it doesn't
  // fit the current default courier (or the reverse) — see
  // handleSetDefault/handleSetDefaultCourier below for the compatibility
  // check itself. Confirming clears the *other* default and proceeds;
  // cancelling leaves both defaults untouched.
  const [addressCourierConflict, setAddressCourierConflict] = useState<{ addressId: string } | null>(null);
  const [courierAddressConflict, setCourierAddressConflict] = useState<{ courierCode: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // The default-address flag is mutable, but the visual order must not jump
  // when it changes. Sort by the name shown on the card instead. Livraison
  // and facturation addresses each get their own section and their own
  // default, per the backend's per-(user, kind) default uniqueness.
  const sortByLabel = useCallback(
    (list: Address[]) =>
      [...list].sort((a, b) =>
        (a.label || identityName(a.recipientName, a.companyName)).localeCompare(
          b.label || identityName(b.recipientName, b.companyName),
          lang,
          { sensitivity: 'base' },
        ),
      ),
    [lang],
  );
  const livraisonAddresses = useMemo(
    () => sortByLabel(addresses.filter((address) => address.kind === 'livraison')),
    [addresses, sortByLabel],
  );
  const facturationAddresses = useMemo(
    () => sortByLabel(addresses.filter((address) => address.kind === 'facturation')),
    [addresses, sortByLabel],
  );
  // A carrier the customer turned off can't serve any address, so it never
  // appears on an address card either.
  const enabledCouriers = useMemo(
    () => couriers.filter((courier) => !disabledCourierCodes.includes(courier.code)),
    [couriers, disabledCourierCodes],
  );
  /** Home-delivery add path stays available while any enabled courier still
   * serves the shared `home` network. */
  const homeDeliveryAvailable = useMemo(
    () => enabledCouriers.some((courier) => courier.networks.includes('home')),
    [enabledCouriers],
  );
  /** Mondial Relay Point Relais add path — gated on the picker courier being
   * left enabled by the customer (shop-disabled couriers are already absent
   * from `couriers`). */
  const pickupPointAvailable = useMemo(
    () =>
      enabledCouriers.some((courier) => courier.networks.includes(shopConfig.mondialRelayPickerNetworkCode)),
    [enabledCouriers],
  );
  const canAddLivraison = homeDeliveryAvailable || pickupPointAvailable;

  /** Livraison address that no longer matches any enabled courier (e.g. the
   * only compatible method was user-disabled): keep it listed so it can be
   * deleted, but block edit / default changes / add flows for that method. */
  function isLivraisonDeleteOnly(address: Address): boolean {
    if (address.kind !== 'livraison') return false;
    return !enabledCouriers.some((courier) => courierCompatible(courier, address));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    (async () => {
      try {
        const [
          addressesResult,
          countriesResult,
          couriersResult,
          defaultCourierResult,
          disabledCouriersResult,
        ] = await Promise.all([
          authedRequest((token) => authApi.listAddresses(token)),
          authApi.listCountries(),
          authApi.listCouriers(),
          authedRequest((token) => authApi.getDefaultCourier(token)),
          authedRequest((token) => authApi.listDisabledCouriers(token)),
        ]);
        if (cancelled) return;
        setAddresses(addressesResult.addresses);
        setCountries(countriesResult.countries);
        setCouriers([...couriersResult.couriers].sort((a, b) => a.sortOrder - b.sortOrder));
        setDefaultCourierCode(defaultCourierResult.courierCode);
        setDisabledCourierCodes(disabledCouriersResult.courierCodes);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) {
          setLoadedKey(requestKey);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, lang, requestKey, user?.id]);

  async function refreshAddresses() {
    const result = await authedRequest((token) => authApi.listAddresses(token));
    setAddresses(result.addresses);
  }

  async function handleSubmit(input: AddressInput) {
    const addressId = addressModal?.id;
    if (!addressId) {
      await authedRequest((token) => authApi.createAddress(token, input));
    } else {
      await authedRequest((token) => authApi.updateAddress(token, addressId, input));
    }
    // Profile edits must not let /cart paint its pre-profile snapshot.
    invalidateCartBootstrapCache();
    await refreshAddresses();
    setAddressModal(null);
  }

  function selectMondialRelayPoint(point: PickupPoint) {
    setAddressModal({
      kind: 'livraison',
      initial: {
        // The point's name is the point's, not the customer's: it travels
        // with the pickup reference and is displayed as the address's first
        // line. `label` stays empty so the customer can name this address
        // whatever they like, exactly as for a home address.
        line1: point.line1,
        line2: point.line2 || null,
        postalCode: point.postalCode,
        city: point.city,
        countryCode: point.countryCode,
        networkCodes: [shopConfig.mondialRelayPickerNetworkCode],
        pickupPoints: {
          [shopConfig.mondialRelayPickerNetworkCode]: { id: point.id, name: point.name },
        },
      },
    });
  }

  useEffect(() => {
    const point = (location.state as { mondialRelayPoint?: PickupPoint } | null)?.mondialRelayPoint;
    if (!point) return;
    selectMondialRelayPoint(point);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  function handleDelete(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await authedRequest((token) => authApi.deleteAddress(token, id));
    markCheckoutEntityDeleted(id);
    invalidateCartBootstrapCache();
    await refreshAddresses();
  }

  async function handleSetDefault(id: string) {
    const address = addresses.find((a) => a.id === id);
    const defaultCourier = defaultCourierCode
      ? couriers.find((c) => c.code === defaultCourierCode)
      : undefined;
    if (address?.kind === 'livraison' && defaultCourier && !courierCompatible(defaultCourier, address)) {
      setAddressCourierConflict({ addressId: id });
      return;
    }
    await authedRequest((token) => authApi.setDefaultAddress(token, id));
    invalidateCartBootstrapCache();
    await refreshAddresses();
  }

  async function handleUnsetDefault(id: string) {
    await authedRequest((token) => authApi.unsetDefaultAddress(token, id));
    invalidateCartBootstrapCache();
    await refreshAddresses();
  }

  /** Confirming the address/courier conflict modal always wins for the
   * side the customer just clicked — clears the other, conflicting
   * default, then applies this one. */
  async function confirmAddressCourierConflict() {
    if (!addressCourierConflict) return;
    const { addressId } = addressCourierConflict;
    setAddressCourierConflict(null);
    await authedRequest((token) => authApi.unsetDefaultCourier(token));
    setDefaultCourierCode(null);
    await authedRequest((token) => authApi.setDefaultAddress(token, addressId));
    invalidateCartBootstrapCache();
    await refreshAddresses();
  }

  async function handleSetDefaultCourier(code: string) {
    const courier = couriers.find((c) => c.code === code);
    const defaultAddress = livraisonAddresses.find((a) => a.isDefault);
    if (courier && defaultAddress && !courierCompatible(courier, defaultAddress)) {
      setCourierAddressConflict({ courierCode: code });
      return;
    }
    const result = await authedRequest((token) => authApi.setDefaultCourier(token, code));
    setDefaultCourierCode(result.courierCode);
  }

  async function handleUnsetDefaultCourier() {
    await authedRequest((token) => authApi.unsetDefaultCourier(token));
    setDefaultCourierCode(null);
  }

  async function applyCourierEnabled(courier: Courier, enabled: boolean) {
    if (enabled) {
      await authedRequest((token) => authApi.enableCourier(token, courier.code));
      setDisabledCourierCodes((codes) => codes.filter((code) => code !== courier.code));
      return;
    }
    await authedRequest((token) => authApi.disableCourier(token, courier.code));
    setDisabledCourierCodes((codes) => [...codes, courier.code]);
    // Mirrors the backend clearing the default courier when it's the one
    // just disabled (see POST /account/disabled-couriers).
    setDefaultCourierCode((current) => (current === courier.code ? null : current));
  }

  function handleToggleCourierEnabled(courier: Courier, enabled: boolean) {
    if (enabled) {
      void applyCourierEnabled(courier, true);
    } else {
      setConfirmDisableCourier(courier);
    }
  }

  async function confirmCourierAddressConflict() {
    if (!courierAddressConflict) return;
    const { courierCode } = courierAddressConflict;
    setCourierAddressConflict(null);
    const defaultAddress = livraisonAddresses.find((a) => a.isDefault);
    if (defaultAddress) {
      await authedRequest((token) => authApi.unsetDefaultAddress(token, defaultAddress.id));
      await refreshAddresses();
    }
    const result = await authedRequest((token) => authApi.setDefaultCourier(token, courierCode));
    setDefaultCourierCode(result.courierCode);
  }

  function openHomeAddressForm() {
    // A personal address uses the shared home-delivery network. The checkout
    // still selects and validates the actual carrier server-side.
    if (!homeDeliveryAvailable) return;
    setAddressModal({
      kind: 'livraison',
      initial: {
        networkCodes: ['home'],
      },
    });
  }

  function openFacturationAddressForm() {
    setAddressModal({ kind: 'facturation' });
  }

  function openPickupPointPicker() {
    if (!pickupPointAvailable) return;
    setAddressModal(null);
    navigate(localizedPath('/account/addresses/mondial-relay', lang), {
      state: { returnTo: localizedPath('/account/addresses', lang) },
    });
  }

  function openAddLivraison() {
    if (homeDeliveryAvailable) {
      openHomeAddressForm();
      return;
    }
    openPickupPointPicker();
  }

  const pendingDeleteAddress = pendingDeleteId ? addresses.find((a) => a.id === pendingDeleteId) : undefined;
  const pendingDeleteCountryLabel = pendingDeleteAddress
    ? (countries.find((c) => c.code === pendingDeleteAddress.countryCode)?.label ??
      pendingDeleteAddress.countryCode)
    : '';
  const pendingDeleteCountryFlag = pendingDeleteAddress
    ? toFlagEmoji(pendingDeleteAddress.countryCode)
    : null;
  // Label only — company/recipient are printed on their own lines just
  // below, so the fallback used to repeat one of them as a heading.
  const pendingDeleteName = pendingDeleteAddress?.label?.trim() || null;
  const pendingDeleteMessage = pendingDeleteAddress ? (
    <div className={styles.deletePreview}>
      {pendingDeleteName && <div className={styles.deletePreviewName}>{pendingDeleteName}</div>}
      {pendingDeleteAddress.companyName && <div>{pendingDeleteAddress.companyName}</div>}
      {pendingDeleteAddress.recipientName && <div>{pendingDeleteAddress.recipientName}</div>}
      <div>{pendingDeleteAddress.line1}</div>
      {pendingDeleteAddress.line2 && <div>{pendingDeleteAddress.line2}</div>}
      <div>
        {pendingDeleteAddress.postalCode} {pendingDeleteAddress.city}
      </div>
      <div className={styles.countryLine}>
        {pendingDeleteCountryFlag && (
          <span className={styles.countryFlag} aria-hidden="true">
            {pendingDeleteCountryFlag}
          </span>
        )}
        {pendingDeleteCountryLabel}
      </div>
      {pendingDeleteAddress.deliveryNotes && <div>{pendingDeleteAddress.deliveryNotes}</div>}
      {pendingDeleteAddress.phone && (
        <div className={styles.deletePreviewPhone}>
          <PhoneIcon />
          {pendingDeleteAddress.phone}
        </div>
      )}
    </div>
  ) : null;

  return (
    <AccountShell loading={loading || loadedKey !== requestKey}>
      <section aria-labelledby="addresses-h" className={styles.section} data-testid="account-addresses">
        <Seo
          title={t.address.pageTitle}
          description={t.address.pageSubtitle}
          path="/account/addresses"
          noindex
        />
        <LegalPageBackLink placement="top" />
        <h1 id="addresses-h" className={`${styles.title} ${styles.hasSubtitle}`}>
          {t.address.pageTitle}
        </h1>
        <p className={styles.subtitle}>{t.address.pageSubtitle}</p>

        {loadFailed ? (
          <p className={styles.subtitle} role="alert">
            {t.auth.errorGeneric}
          </p>
        ) : (
          <>
            <h2 className={styles.sectionTitle}>{t.address.livraisonSectionTitle}</h2>
            <div className={styles.list}>
              {livraisonAddresses.map((address) => {
                const deleteOnly = isLivraisonDeleteOnly(address);
                return (
                  <AddressCard
                    key={address.id}
                    address={address}
                    t={t}
                    countries={countries}
                    // Include disabled couriers so orphaned addresses still
                    // show which method they belonged to.
                    couriers={couriers}
                    deleteOnly={deleteOnly}
                    {...(!deleteOnly
                      ? {
                          onEdit: () =>
                            setAddressModal({ kind: 'livraison', initial: address, id: address.id }),
                        }
                      : {})}
                    onDelete={() => handleDelete(address.id)}
                    {...(!deleteOnly ? { onSetDefault: () => handleSetDefault(address.id) } : {})}
                    {...(!deleteOnly ? { onUnsetDefault: () => handleUnsetDefault(address.id) } : {})}
                  />
                );
              })}
              {canAddLivraison && (
                <button
                  type="button"
                  className={styles.addCard}
                  data-testid="account-add-address"
                  onClick={openAddLivraison}
                >
                  <span className={styles.addCardIcon} aria-hidden="true">
                    +
                  </span>
                  <span>{t.address.addLivraisonButton}</span>
                </button>
              )}
            </div>

            <h2 className={styles.sectionTitle}>{t.address.facturationSectionTitle}</h2>
            <div className={styles.list}>
              {facturationAddresses.map((address) => (
                <AddressCard
                  key={address.id}
                  address={address}
                  t={t}
                  countries={countries}
                  couriers={couriers}
                  onEdit={() => setAddressModal({ kind: 'facturation', initial: address, id: address.id })}
                  onDelete={() => handleDelete(address.id)}
                  onSetDefault={() => handleSetDefault(address.id)}
                  onUnsetDefault={() => handleUnsetDefault(address.id)}
                />
              ))}
              <button type="button" className={styles.addCard} onClick={openFacturationAddressForm}>
                <span className={styles.addCardIcon} aria-hidden="true">
                  +
                </span>
                <span>{t.address.addFacturationButton}</span>
              </button>
            </div>

            <h2 className={styles.sectionTitle}>{t.address.courierSectionTitle}</h2>
            <p className={styles.subtitle}>{t.address.courierSectionHelp}</p>
            <div className={styles.courierTiles}>
              {couriers.map((courier) => {
                const isDefault = defaultCourierCode === courier.code;
                const isDisabled = disabledCourierCodes.includes(courier.code);
                return (
                  <div key={courier.code} className={styles.courierTile}>
                    <div className={styles.courierTileHead}>
                      <span className={styles.cardLabel}>{courier.name}</span>
                      {isDefault && (
                        <button
                          type="button"
                          className={`${styles.defaultBadge} ${styles.defaultBadgeButton}`}
                          onClick={() => void handleUnsetDefaultCourier()}
                        >
                          {t.address.defaultBadge}
                        </button>
                      )}
                    </div>
                    <CourierLogo courier={courier} className={styles.courierTileBadge} decorative />
                    <div className={styles.courierActions}>
                      {!isDefault && !isDisabled && (
                        <button
                          type="button"
                          className={styles.courierSetDefaultLink}
                          onClick={() => void handleSetDefaultCourier(courier.code)}
                        >
                          {t.address.courierSetDefaultLink}
                        </button>
                      )}
                      <div className={`${styles.toggleAction} ${styles.courierToggleRow}`}>
                        {/* The button's own name repeats this visible action. */}
                        <span aria-hidden="true">
                          {isDisabled ? t.address.courierEnableAction : t.address.courierDisableAction}
                        </span>
                        <ToggleSwitch
                          checked={!isDisabled}
                          labelIsAction
                          aria-label={`${
                            isDisabled ? t.address.courierEnableAction : t.address.courierDisableAction
                          } ${courier.name}`}
                          onChange={(enabled) => handleToggleCourierEnabled(courier, enabled)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {addressModal && (
          <AddressFormModal
            t={t}
            countries={countries}
            kind={addressModal.kind}
            profile={user}
            {...(addressModal.initial ? { initial: addressModal.initial } : {})}
            title={
              addressModal.id
                ? addressModal.kind === 'facturation'
                  ? t.address.editFacturationTitle
                  : t.address.editLivraisonTitle
                : addressModal.kind === 'facturation'
                  ? t.address.addFacturationButton
                  : t.address.addLivraisonButton
            }
            submitLabel={t.address.saveButton}
            onSubmit={handleSubmit}
            {...(addressModal.kind === 'livraison' && pickupPointAvailable
              ? { onChoosePickup: openPickupPointPicker }
              : {})}
            onClose={() => setAddressModal(null)}
          />
        )}

        {addressCourierConflict && (
          <ConfirmModal
            variant="dialog"
            title={t.address.addressCourierConflictTitle}
            message={t.address.addressCourierConflictMessage}
            confirmLabel={t.address.confirmButton}
            closeLabel={t.auth.closeAria}
            onConfirm={() => void confirmAddressCourierConflict()}
            onCancel={() => setAddressCourierConflict(null)}
          />
        )}

        {courierAddressConflict && (
          <ConfirmModal
            variant="dialog"
            title={t.address.courierAddressConflictTitle}
            message={t.address.courierAddressConflictMessage}
            confirmLabel={t.address.confirmButton}
            closeLabel={t.auth.closeAria}
            onConfirm={() => void confirmCourierAddressConflict()}
            onCancel={() => setCourierAddressConflict(null)}
          />
        )}

        {confirmDisableCourier && (
          <ConfirmModal
            variant="dialog"
            title={t.address.courierDisableConfirmTitle}
            message={t.address.courierDisableConfirmMessage}
            confirmLabel={t.address.courierDisableAction}
            closeLabel={t.auth.closeAria}
            onConfirm={() => {
              const courier = confirmDisableCourier;
              setConfirmDisableCourier(null);
              void applyCourierEnabled(courier, false);
            }}
            onCancel={() => setConfirmDisableCourier(null)}
          />
        )}

        {pendingDeleteId && pendingDeleteAddress && (
          <ConfirmModal
            variant="dialog"
            title={t.address.deleteConfirm}
            message={pendingDeleteMessage}
            confirmLabel={t.address.deleteButton}
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

/** Stroke handset matching ConfirmModal’s 16×16 close-icon style. */
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.25 1.75H3.7c-.85 0-1.52.68-1.42 1.52.35 3.05 1.95 5.85 4.4 7.95 2.1 1.8 4.7 3.05 7.55 3.45.85.1 1.52-.57 1.52-1.42v-1.45c0-.4-.27-.75-.65-.85l-2.4-.6a.9.9 0 00-.9.28l-.75 1a9.4 9.4 0 01-4.05-4.05l1-.75a.9.9 0 00.28-.9l-.6-2.4a.9.9 0 00-.85-.65z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface AddressCardProps {
  address: Address;
  t: Strings;
  countries: Country[];
  /** Shop couriers (enabled + user-disabled). Logos are filtered per card to
   * those that can serve this address (country + delivery network overlap). */
  couriers: Courier[];
  /** Livraison address orphaned onto disabled couriers: delete only. */
  deleteOnly?: boolean;
  onEdit?: () => void;
  onDelete: () => void;
  onSetDefault?: () => void;
  onUnsetDefault?: () => void;
}

function AddressCard({
  address,
  t,
  countries,
  couriers,
  deleteOnly = false,
  onEdit,
  onDelete,
  onSetDefault,
  onUnsetDefault,
}: AddressCardProps) {
  const countryLabel = countries.find((c) => c.code === address.countryCode)?.label ?? address.countryCode;
  const countryFlag = toFlagEmoji(address.countryCode);
  const pointName = pickupPointName(address.pickupPoints);
  const addressCouriers = couriers.filter((courier) => courierCompatible(courier, address));
  const label = address.label?.trim();
  return (
    <div className={styles.card}>
      {/* Head row: the customer's own name for this address — and nothing
          else, the recipient already has its own line in the body below, so
          falling back to it here would just print the same name twice —
          with the carriers that serve this address on the right. Rendered
          as soon as either side has something to show. */}
      {(label || addressCouriers.length > 0) && (
        <div className={styles.cardHead}>
          {label && <span className={styles.cardLabel}>{label}</span>}
          <CourierLogos
            couriers={addressCouriers}
            className={styles.cardCouriers}
            logoClassName={styles.cardCourierLogo}
          />
        </div>
      )}
      <div className={styles.cardBody}>
        {address.companyName && (
          <>
            {address.companyName}
            <br />
          </>
        )}
        {address.recipientName && (
          <>
            {address.recipientName}
            <br />
          </>
        )}
        {/* Below the recipient, above the street: the relay/locker is where
            the parcel waits, so it reads as part of the address itself. */}
        {pointName && (
          <>
            <span className={styles.cardPickupPoint}>{pointName}</span>
            <br />
          </>
        )}
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.postalCode} {address.city}
        <br />
        <span className={styles.countryLine}>
          {countryFlag && (
            <span className={styles.countryFlag} aria-hidden="true">
              {countryFlag}
            </span>
          )}
          {countryLabel}
        </span>
        {address.deliveryNotes && (
          <>
            <br />
            <span className={styles.cardNotes}>{address.deliveryNotes}</span>
          </>
        )}
        {address.phone && (
          <>
            <br />
            <span className={styles.cardPhone}>
              <PhoneIcon />
              {address.phone}
            </span>
          </>
        )}
        {deleteOnly && <p className={styles.deleteOnlyHint}>{t.address.deleteOnlyHint}</p>}
      </div>
      <div className={styles.cardActions}>
        {!deleteOnly && onEdit && (
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonEdit}`}
            onClick={onEdit}
          >
            {t.address.editButton}
          </button>
        )}
        <button
          type="button"
          className={`${styles.actionButton} ${styles.actionButtonDelete}`}
          onClick={onDelete}
        >
          {t.address.deleteButton}
        </button>
        {!deleteOnly && !address.isDefault && onSetDefault && (
          <button type="button" className={styles.actionButton} onClick={onSetDefault}>
            {t.address.setDefaultButton}
          </button>
        )}
        {address.isDefault &&
          (deleteOnly || !onUnsetDefault ? (
            <span className={styles.defaultBadge}>{t.address.defaultBadge}</span>
          ) : (
            <button
              type="button"
              className={`${styles.defaultBadge} ${styles.defaultBadgeButton}`}
              onClick={onUnsetDefault}
            >
              {t.address.defaultBadge}
            </button>
          ))}
      </div>
    </div>
  );
}
