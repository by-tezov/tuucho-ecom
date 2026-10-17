import { CloseIcon } from '../ui/CloseIcon';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useAuthSession } from '../../state/AuthContext';
import * as accountApi from '../../api/account';
import * as ordersApi from '../../api/orders';
import type { Address, AddressInput, Country, Courier } from '../../api/account';
import type { Order } from '../../api/orders';
import { ApiError } from '../../api/errors';
import { isBackendUnavailableError } from '../../api/http';
import type { Strings } from '../../assets/i18n/types';
import { courierCompatible } from '../../utils/courierMatch';
import { Button } from '../ui/Button';
import { AddressFormModal } from '../address/AddressFormModal';
import styles from './EditOrderBillingModal.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { OrderAddressRadioList } from './OrderAddressRadioList';
import { shopConfig } from '../../config/env';
import { useScrollHint } from '../../hooks/useScrollHint';
import { ModalBackdrop } from '../ui/ModalBackdrop';

interface EditOrderAddressesModalProps {
  order: Order;
  t: Strings;
  onClose: () => void;
  onSaved: (order: Order) => void;
  initialShippingAddress?: Partial<Address>;
  onInitialShippingAddressHandled?: () => void;
}

function mapAcquireError(code: string, t: Strings): string {
  switch (code) {
    case 'invoice_already_issued':
      return t.ordersPage.editOrderInvoiceBlocked;
    case 'order_not_editable':
    case 'content_hash_missing':
      return t.ordersPage.editOrderNotEditable;
    case 'order_revision_locked':
      return t.ordersPage.editOrderConflict;
    case 'revision_limit_reached':
      return t.ordersPage.editOrderRevisionLimit;
    default:
      return t.ordersPage.editOrderError;
  }
}

function mapSaveError(code: string, t: Strings): string {
  switch (code) {
    case 'lock_invalid':
      return t.ordersPage.editOrderLockExpired;
    case 'order_changed':
      return t.ordersPage.editOrderConflict;
    case 'invoice_already_issued':
      return t.ordersPage.editOrderInvoiceBlocked;
    case 'revision_limit_reached':
      return t.ordersPage.editOrderRevisionLimit;
    case 'order_not_editable':
    case 'content_hash_missing':
      return t.ordersPage.editOrderNotEditable;
    case 'billing_address_not_found':
    case 'billing_address_required':
      return t.ordersPage.editOrderBillingRequired;
    case 'address_not_found':
      return t.ordersPage.editOrderShippingRequired;
    case 'courier_country_unavailable':
    case 'shipping_country_mismatch':
    case 'courier_network_unavailable':
    case 'courier_not_found':
      return t.ordersPage.editOrderCourierIncompatible;
    case 'price_would_change':
    case 'shipping_overflow':
    case 'express_unavailable':
      return t.ordersPage.editOrderPriceWouldChange;
    default:
      return t.ordersPage.editOrderError;
  }
}

function EditOrderAddressesModal({
  order,
  t,
  onClose,
  onSaved,
  initialShippingAddress,
  onInitialShippingAddressHandled,
}: EditOrderAddressesModalProps) {
  const { authedRequest, user } = useAuthSession();
  const { lang } = useLang();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLockBodyScroll();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockToken, setLockToken] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [orderCourier, setOrderCourier] = useState<Courier | null>(null);
  const [shippingAddressId, setShippingAddressId] = useState<string | null>(order.addressId);
  const [sameAsShipping, setSameAsShipping] = useState(order.billingSameAsShipping);
  const [billingAddressId, setBillingAddressId] = useState<string | null>(order.billingAddressId);
  const [addKind, setAddKind] = useState<'livraison' | 'facturation' | null>(null);
  const { scrollHint, updateScrollHint } = useScrollHint(panelRef);

  const refreshAddresses = useCallback(async () => {
    const result = await authedRequest((token) => accountApi.listAddresses(token));
    const listedIds = new Set(result.addresses.map((address) => address.id));
    const selectedIds = [shippingAddressId, billingAddressId].filter(
      (id): id is string => !!id && !listedIds.has(id),
    );
    const restored = await Promise.all(
      selectedIds.map(async (id) => {
        try {
          return (await authedRequest((token) => accountApi.getAddress(token, id))).address;
        } catch {
          return null;
        }
      }),
    );
    setAddresses([
      ...result.addresses,
      ...restored.filter((address): address is Address => address !== null),
    ]);
  }, [authedRequest, billingAddressId, shippingAddressId]);

  // The point picker returns a partial delivery address. It must still be
  // confirmed in AddressFormModal so the customer enters/edits their name
  // and telephone number before the address is created.
  useEffect(() => {
    if (initialShippingAddress) setAddKind('livraison');
  }, [initialShippingAddress]);

  useLayoutEffect(() => {
    updateScrollHint();
    const settle = window.setTimeout(updateScrollHint, 260);
    window.addEventListener('resize', updateScrollHint);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', updateScrollHint);
    };
  }, [addresses.length, loading, sameAsShipping, addKind, updateScrollHint]);

  const livraisonAddresses = useMemo(
    () =>
      addresses.filter((address) => {
        if (address.kind !== 'livraison') return false;
        // Country is fixed at confirm — only swap within the same country.
        if (address.countryCode !== order.countryCode) return false;
        // Keep the order's delivery mode (e.g. home vs point relais): an
        // address on another network must not appear even if the same
        // courier brand also offers that network.
        if (order.networkCode && !address.networkCodes.includes(order.networkCode)) {
          return false;
        }
        // A point-relay order must remain a point-relay order on the exact
        // network chosen at checkout; a home address on that courier is not
        // an interchangeable destination.
        if (order.pickupPoint && (!order.networkCode || !address.pickupPoints[order.networkCode])) {
          return false;
        }
        if (!order.pickupPoint && order.networkCode && address.pickupPoints[order.networkCode]) {
          return false;
        }
        // A payment-captured order cannot switch courier. If the courier
        // catalogue has not loaded yet, do not briefly expose addresses that
        // may belong to another delivery network.
        if (order.courierCode && (!orderCourier || !courierCompatible(orderCourier, address))) {
          return false;
        }
        return true;
      }),
    [addresses, order.countryCode, order.networkCode, order.courierCode, order.pickupPoint, orderCourier],
  );
  const facturationAddresses = useMemo(
    () => addresses.filter((address) => address.kind === 'facturation'),
    [addresses],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lockResult, addressResult, countryResult, courierResult] = await Promise.all([
          authedRequest((token) => ordersApi.acquireOrderRevisionLock(token, order.id)),
          authedRequest((token) => accountApi.listAddresses(token)),
          accountApi.listCountries(),
          accountApi.listCouriers(),
        ]);
        if (cancelled) return;
        const listedAddressIds = new Set(addressResult.addresses.map((address) => address.id));
        const addressIdsToRestore = [lockResult.order.addressId, lockResult.order.billingAddressId].filter(
          (id): id is string => !!id && !listedAddressIds.has(id),
        );
        const restoredAddresses = await Promise.all(
          addressIdsToRestore.map(async (id) => {
            try {
              return (await authedRequest((token) => accountApi.getAddress(token, id))).address;
            } catch {
              // The order snapshot remains usable if a legacy address was deleted.
              return null;
            }
          }),
        );
        setLockToken(lockResult.lock.lockToken);
        setAddresses([
          ...addressResult.addresses,
          ...restoredAddresses.filter((address): address is Address => address !== null),
        ]);
        setCountries(countryResult.countries);
        setOrderCourier(
          order.courierCode
            ? (courierResult.couriers.find((courier) => courier.code === order.courierCode) ?? null)
            : null,
        );
        setShippingAddressId(lockResult.order.addressId);
        setSameAsShipping(lockResult.order.billingSameAsShipping);
        setBillingAddressId(lockResult.order.billingAddressId);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (isBackendUnavailableError(err)) {
          setLoading(false);
          return;
        }
        const code = err instanceof ApiError ? err.code : 'unknown_error';
        setError(mapAcquireError(code, t));
        setBlocked(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedRequest, order.courierCode, order.id, t]);

  // Quiet auto-extend while the modal stays open — no "Prolonger" UX.
  useEffect(() => {
    if (!lockToken) return;
    const timer = window.setInterval(() => {
      void authedRequest((token) => ordersApi.extendOrderRevisionLock(token, order.id, lockToken))
        .then((result) => {
          setLockToken(result.lock.lockToken);
        })
        .catch(() => {
          // Save-after-TTL still works if status/hash remain valid.
        });
    }, 10 * 60_000);
    return () => window.clearInterval(timer);
  }, [authedRequest, lockToken, order.id]);

  async function handleClose() {
    if (lockToken) {
      try {
        await authedRequest((token) => ordersApi.releaseOrderRevisionLock(token, order.id, lockToken));
      } catch {
        // Best-effort unlock.
      }
    }
    onClose();
  }

  const requestClose = useHistoryBackClose(() => {
    void handleClose();
  });
  useFocusTrap(panelRef, { onEscape: requestClose, enabled: !addKind });

  function openDeliveryAddressPicker() {
    const isMondialRelayPoint =
      order.courierCode === shopConfig.mondialRelayPickerCourierCode ||
      order.networkCode === shopConfig.mondialRelayPickerNetworkCode;
    if (!order.pickupPoint) {
      setAddKind('livraison');
      return;
    }
    if (!isMondialRelayPoint) return;
    navigate(localizedPath('/account/addresses/mondial-relay', lang), {
      state: {
        returnTo: localizedPath('/orders', lang),
        orderId: order.id,
        country: order.countryCode,
      },
    });
  }

  async function handleAddAddress(input: AddressInput) {
    if (!addKind) return;
    const { address } = await authedRequest((token) => accountApi.createAddress(token, input));
    await refreshAddresses();
    // One-time addresses are deliberately absent from listAddresses(), but
    // must remain selectable in this modal immediately after creation.
    setAddresses((current) =>
      current.some((item) => item.id === address.id) ? current : [...current, address],
    );
    if (addKind === 'livraison') {
      setShippingAddressId(address.id);
    } else {
      setBillingAddressId(address.id);
      setSameAsShipping(false);
    }
    setAddKind(null);
    if (initialShippingAddress) onInitialShippingAddressHandled?.();
  }

  async function handleSave() {
    if (!lockToken) return;
    if (!shippingAddressId) {
      setError(t.ordersPage.editOrderShippingRequired);
      return;
    }
    if (!sameAsShipping && !billingAddressId) {
      setError(t.ordersPage.editOrderBillingRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let latestToken = lockToken;
      // Always re-snapshot shipping (same address id may have been edited).
      // Unchanged snapshots unlock; re-acquire below when billing still needs
      // a save.
      const shippingResult = await authedRequest((token) =>
        ordersApi.updateOrderShipping(token, order.id, {
          lockToken: latestToken,
          addressId: shippingAddressId,
        }),
      );
      const billingNeedsSave =
        sameAsShipping !== order.billingSameAsShipping ||
        (!sameAsShipping && billingAddressId !== order.billingAddressId);
      if (billingNeedsSave) {
        const lockResult = await authedRequest((token) =>
          ordersApi.acquireOrderRevisionLock(token, order.id),
        );
        latestToken = lockResult.lock.lockToken;
        setLockToken(latestToken);
        const billingResult = await authedRequest((token) =>
          ordersApi.updateOrderBilling(token, order.id, {
            lockToken: latestToken,
            sameAsShipping,
            ...(!sameAsShipping && billingAddressId ? { billingAddressId } : {}),
          }),
        );
        onSaved(billingResult.order);
        return;
      }
      onSaved(shippingResult.order);
    } catch (err) {
      if (isBackendUnavailableError(err)) {
        setSaving(false);
        return;
      }
      const code = err instanceof ApiError ? err.code : 'unknown_error';
      setError(mapSaveError(code, t));
      setSaving(false);
    }
  }

  const canSave = !loading && !!lockToken && !blocked && !saving;

  return createPortal(
    <>
      <ModalBackdrop
        className={styles.backdrop ?? ''}
        label={t.ordersPage.editOrderAddressesTitle}
        onClose={requestClose}
      >
        <div ref={panelRef} className={styles.dialog} onScroll={updateScrollHint}>
          <div className={styles.header}>
            <p className={styles.title}>{t.ordersPage.editOrderAddressesTitle}</p>
            <button
              type="button"
              className={styles.closeButton}
              onClick={requestClose}
              aria-label={t.gallery.close}
            >
              <CloseIcon size={14} />
            </button>
          </div>
          {order.courierName && (
            <p className={styles.notice}>
              {t.ordersPage.editOrderSameCourierNote.replace('{courier}', order.courierName)}
            </p>
          )}

          {loading && <p className={styles.loading}>{t.ordersPage.trackPackageLoading}</p>}

          {!loading && lockToken && (
            <>
              <div className={styles.sectionHeader}>
                <h2 id="edit-order-shipping-heading" className={styles.sectionTitle}>
                  {t.ordersPage.deliveryAddressLabel}
                </h2>
                {(!order.pickupPoint ||
                  order.courierCode === shopConfig.mondialRelayPickerCourierCode ||
                  order.networkCode === shopConfig.mondialRelayPickerNetworkCode) && (
                  <button type="button" className={styles.addButton} onClick={openDeliveryAddressPicker}>
                    + {t.cart.addAddressLink}
                  </button>
                )}
              </div>
              {livraisonAddresses.length === 0 && (
                <p className={styles.notice}>{t.ordersPage.editOrderNoShippingAddress}</p>
              )}
              {livraisonAddresses.length > 0 && (
                <OrderAddressRadioList
                  labelledBy="edit-order-shipping-heading"
                  name="editOrderShippingAddress"
                  addresses={livraisonAddresses}
                  countries={countries}
                  selectedId={shippingAddressId}
                  currentId={order.addressId}
                  onSelect={setShippingAddressId}
                />
              )}

              <label className={styles.sameAsRow}>
                <input
                  type="checkbox"
                  onMouseDown={suppressMouseFocus}
                  checked={sameAsShipping}
                  onChange={(e) => setSameAsShipping(e.target.checked)}
                />
                {t.ordersPage.editOrderSameAsShippingLabel}
              </label>

              {!sameAsShipping && (
                <>
                  <div className={styles.sectionHeader}>
                    <h2 id="edit-order-billing-heading" className={styles.sectionTitle}>
                      {t.ordersPage.editOrderBillingHeading}
                    </h2>
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={() => setAddKind('facturation')}
                    >
                      + {t.cart.addAddressLink}
                    </button>
                  </div>
                  {facturationAddresses.length === 0 && (
                    <p className={styles.notice}>{t.ordersPage.editOrderNoBillingAddress}</p>
                  )}
                  {facturationAddresses.length > 0 && (
                    <OrderAddressRadioList
                      labelledBy="edit-order-billing-heading"
                      name="editOrderBillingAddress"
                      addresses={facturationAddresses}
                      countries={countries}
                      selectedId={billingAddressId}
                      currentId={order.billingAddressId}
                      onSelect={setBillingAddressId}
                    />
                  )}
                </>
              )}

              <div className={styles.actions}>
                <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
                  {t.ordersPage.editOrderSaveButton}
                </Button>
              </div>
            </>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {scrollHint.up && (
            <span className={styles.scrollHintUp} aria-hidden="true">
              <span className={styles.chevronUp} />
            </span>
          )}
          {scrollHint.down && (
            <span className={styles.scrollHintDown} aria-hidden="true">
              <span className={styles.chevronDown} />
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
      </ModalBackdrop>

      {addKind && (
        <AddressFormModal
          t={t}
          countries={
            addKind === 'livraison'
              ? countries.filter((country) => country.code === order.countryCode)
              : countries
          }
          kind={addKind}
          profile={user}
          allowOneTimeUse
          {...(addKind === 'livraison'
            ? {
                initial: {
                  countryCode: order.countryCode,
                  ...initialShippingAddress,
                  ...(order.networkCode ? { networkCodes: [order.networkCode] } : {}),
                },
              }
            : {})}
          historyBackClose={false}
          title={addKind === 'livraison' ? t.address.addLivraisonButton : t.address.addFacturationButton}
          submitLabel={t.address.saveButton}
          onSubmit={handleAddAddress}
          onClose={() => {
            setAddKind(null);
            if (initialShippingAddress) onInitialShippingAddressHandled?.();
          }}
        />
      )}
    </>,
    document.body,
  );
}

/** @deprecated Use EditOrderAddressesModal — kept as alias for existing imports. */
export const EditOrderBillingModal = EditOrderAddressesModal;
