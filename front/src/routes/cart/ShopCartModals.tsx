import { AddressFormModal } from '../../components/address/AddressFormModal';
import { FavoriteOrRemoveModal } from '../../components/cart/FavoriteOrRemoveModal';
import { ItemPreviewRow } from '../../components/cart/ItemPreviewRow';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import type { Address, AddressInput, Country } from '../../api/account';
import type { Size } from '../../api/cart';
import type { ProductById } from '../../api/gallery';
import type { GalleryItem } from '../../data/types';
import type { useLang } from '../../assets/i18n';
import { identityName } from '../../utils/customerIdentity';
import { toFlagEmoji } from '../../utils/countryFlag';
import type { AuthSessionContextValue } from '../../state/AuthContext';
import cartFeatureStyles from '../../components/cart/CartFeature.module.css';
import pageStyles from '../CartPage.module.css';

const styles = { ...pageStyles, ...cartFeatureStyles };

type T = ReturnType<typeof useLang>['t'];

export function ShopCartModals(props: {
  t: T;
  user: AuthSessionContextValue['user'];
  countries: Country[];
  addresses: Address[];
  courierCode: string | null;
  addAddressOpen: boolean;
  pickupAddressInitial: Partial<Address> | undefined;
  editingAddress: Address | null;
  addBillingAddressOpen: boolean;
  editingBillingAddress: Address | null;
  pendingDeleteAddressId: string | null;
  removalTarget: {
    productId: string;
    shapeKey: string;
    lengthKey: string;
    size: Size | '';
  } | null;
  gallerySets: Record<string, GalleryItem>;
  productsById: Record<string, ProductById>;
  canMoveToWishlist: boolean;
  isWishlistCart: boolean;
  giftConfirm: 'cancel' | null;
  handleAddAddress: (input: AddressInput) => Promise<void>;
  handleEditAddress: (input: AddressInput) => Promise<void>;
  handleAddBillingAddress: (input: AddressInput) => Promise<void>;
  handleEditBillingAddress: (input: AddressInput) => Promise<void>;
  openPickupPointPickerFromCart: () => void;
  setAddAddressOpen: (open: boolean) => void;
  setPickupAddressInitial: (initial: Partial<Address> | undefined) => void;
  setEditingAddress: (address: Address | null) => void;
  setAddBillingAddressOpen: (open: boolean) => void;
  setEditingBillingAddress: (address: Address | null) => void;
  setPendingDeleteAddressId: (id: string | null) => void;
  confirmDeleteAddress: () => Promise<void>;
  confirmMoveToWishlist: () => void;
  confirmDeleteFromCart: () => void;
  closeRemovalDialog: () => void;
  setGiftConfirm: (value: 'cancel' | null) => void;
  onConfirmGiftCancel: () => void;
}) {
  const {
    t,
    user,
    countries,
    addresses,
    courierCode,
    addAddressOpen,
    pickupAddressInitial,
    editingAddress,
    addBillingAddressOpen,
    editingBillingAddress,
    pendingDeleteAddressId,
    removalTarget,
    gallerySets,
    productsById,
    canMoveToWishlist,
    isWishlistCart,
    giftConfirm,
    handleAddAddress,
    handleEditAddress,
    handleAddBillingAddress,
    handleEditBillingAddress,
    openPickupPointPickerFromCart,
    setAddAddressOpen,
    setPickupAddressInitial,
    setEditingAddress,
    setAddBillingAddressOpen,
    setEditingBillingAddress,
    setPendingDeleteAddressId,
    confirmDeleteAddress,
    confirmMoveToWishlist,
    confirmDeleteFromCart,
    closeRemovalDialog,
    setGiftConfirm,
    onConfirmGiftCancel,
  } = props;

  const pendingDeleteAddress = pendingDeleteAddressId
    ? addresses.find((a) => a.id === pendingDeleteAddressId)
    : undefined;
  const pendingDeleteCountryLabel = pendingDeleteAddress
    ? (countries.find((c) => c.code === pendingDeleteAddress.countryCode)?.label ??
      pendingDeleteAddress.countryCode)
    : '';
  const pendingDeleteCountryFlag = pendingDeleteAddress
    ? toFlagEmoji(pendingDeleteAddress.countryCode)
    : null;
  const pendingDeleteName = pendingDeleteAddress
    ? pendingDeleteAddress.label ||
      identityName(pendingDeleteAddress.recipientName, pendingDeleteAddress.companyName) ||
      null
    : null;
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
          <DeleteAddressPhoneIcon />
          {pendingDeleteAddress.phone}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      {addAddressOpen && (
        <AddressFormModal
          t={t}
          countries={countries}
          kind="livraison"
          profile={user}
          {...(pickupAddressInitial ? { initial: pickupAddressInitial } : {})}
          allowOneTimeUse
          title={t.address.addLivraisonButton}
          submitLabel={t.address.saveButton}
          onSubmit={handleAddAddress}
          {...(!courierCode ? { onChoosePickup: openPickupPointPickerFromCart } : {})}
          onClose={() => {
            setAddAddressOpen(false);
            setPickupAddressInitial(undefined);
          }}
        />
      )}

      {editingAddress && (
        <AddressFormModal
          t={t}
          countries={countries}
          kind="livraison"
          profile={user}
          initial={editingAddress}
          title={t.address.editLivraisonTitle}
          submitLabel={t.address.saveButton}
          onSubmit={handleEditAddress}
          onClose={() => setEditingAddress(null)}
        />
      )}

      {addBillingAddressOpen && (
        <AddressFormModal
          t={t}
          countries={countries}
          kind="facturation"
          profile={user}
          allowOneTimeUse
          title={t.address.addFacturationButton}
          submitLabel={t.address.saveButton}
          onSubmit={handleAddBillingAddress}
          onClose={() => setAddBillingAddressOpen(false)}
        />
      )}

      {editingBillingAddress && (
        <AddressFormModal
          t={t}
          countries={countries}
          kind="facturation"
          profile={user}
          initial={editingBillingAddress}
          title={t.address.editFacturationTitle}
          submitLabel={t.address.saveButton}
          onSubmit={handleEditBillingAddress}
          onClose={() => setEditingBillingAddress(null)}
        />
      )}

      {removalTarget && (
        <FavoriteOrRemoveModal
          t={t}
          title={t.cart.lastUnitTitle}
          text={t.cart.lastUnitText}
          preview={
            <ItemPreviewRow
              photo={
                gallerySets[removalTarget.productId]?.photosByShapeLength[removalTarget.shapeKey]?.[
                  removalTarget.lengthKey
                ]?.[0]?.small ?? productsById[removalTarget.productId]?.photo
              }
              alt={
                gallerySets[removalTarget.productId]?.title ??
                productsById[removalTarget.productId]?.title ??
                ''
              }
              title={
                gallerySets[removalTarget.productId]?.title ??
                productsById[removalTarget.productId]?.title ??
                ''
              }
              shapeLabel={gallerySets[removalTarget.productId]?.shape[removalTarget.shapeKey] ?? ''}
              lengthLabel={
                gallerySets[removalTarget.productId]?.lengthsByShape[removalTarget.shapeKey]?.[
                  removalTarget.lengthKey
                ] ?? removalTarget.lengthKey
              }
              sizeLabels={removalTarget.size ? [removalTarget.size] : []}
              enlarged
            />
          }
          {...(canMoveToWishlist && !isWishlistCart ? { onMoveToWishlist: confirmMoveToWishlist } : {})}
          onRemove={confirmDeleteFromCart}
          onCancel={closeRemovalDialog}
        />
      )}

      {pendingDeleteAddressId && pendingDeleteAddress && (
        <ConfirmModal
          variant="dialog"
          title={t.address.deleteConfirm}
          message={pendingDeleteMessage}
          confirmLabel={t.address.deleteButton}
          closeLabel={t.auth.closeAria}
          confirmDanger
          onConfirm={() => void confirmDeleteAddress()}
          onCancel={() => setPendingDeleteAddressId(null)}
        />
      )}

      {giftConfirm === 'cancel' && (
        <ConfirmModal
          title={t.gift.cancelConfirmTitle}
          message={t.gift.cancelConfirmBody}
          confirmLabel={t.gift.cancelCta}
          closeLabel={t.auth.closeAria}
          confirmDanger
          onConfirm={onConfirmGiftCancel}
          onCancel={() => setGiftConfirm(null)}
        />
      )}
    </>
  );
}

/** Stroke handset matching ConfirmModal's 16×16 close-icon style. */
function DeleteAddressPhoneIcon() {
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
