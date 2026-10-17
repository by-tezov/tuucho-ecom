import { useId, type ReactNode } from 'react';
import type { Address, Country, Courier } from '../../api/account';
import type { Strings } from '../../assets/i18n/types';
import { toFlagEmoji } from '../../utils/countryFlag';
import { courierCompatible, courierMatch } from '../../utils/courierMatch';
import { identityName } from '../../utils/customerIdentity';
import { pickupPointName } from '../../utils/pickupPoint';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { CourierLogos } from '../ui/CourierLogo';
import styles from './CartFeature.module.css';

interface CartAddressSectionProps {
  t: Strings;
  title: string;
  addresses: Address[];
  countries: Country[];
  couriers: Courier[];
  selectedAddressId: string | null;
  radioName: string;
  addTestId: string;
  optionTestId?: string | undefined;
  selectedCourier?: Courier | undefined;
  blockNotice: string | null;
  children?: ReactNode;
  onSelect: (addressId: string) => void;
  onEdit: (address: Address) => void;
  onDelete: (addressId: string) => void;
  onAdd: () => void;
  hideAdd?: boolean;
}

/** Shared delivery/billing address selector. Compatibility is only enforced
 * when a delivery courier is supplied; billing addresses stay unrestricted. */
export function CartAddressSection({
  t,
  title,
  addresses,
  countries,
  couriers,
  selectedAddressId,
  radioName,
  addTestId,
  optionTestId,
  selectedCourier,
  blockNotice,
  children,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
  hideAdd = false,
}: CartAddressSectionProps) {
  const headingId = useId();
  return (
    <div className={styles.addressSection}>
      <div className={styles.sectionHeader}>
        <h2 id={headingId} className={styles.sectionTitle}>
          {title}
        </h2>
      </div>
      {/* The address radios' group, named by the heading (RGAA 11.5). A group,
          not a radiogroup: it also holds each row's edit/delete buttons. */}
      <div className={styles.addressList} role="group" aria-labelledby={headingId}>
        {addresses.map((address) => {
          const compatibility = selectedCourier
            ? courierMatch(selectedCourier, address)
            : { countryOk: true, networkOk: true };
          const incompatible = !compatibility.countryOk || !compatibility.networkOk;
          const reason = !compatibility.countryOk
            ? t.cart.courierUnavailableCountry
            : !compatibility.networkOk
              ? t.cart.courierUnavailableNetwork
              : null;
          const selected = selectedAddressId === address.id;

          return (
            <div
              key={address.id}
              className={selected ? `${styles.addressRow} ${styles.addressRowSelected}` : styles.addressRow}
            >
              <div className={styles.addressRowMain}>
                <label
                  className={
                    incompatible
                      ? `${styles.addressOption} ${styles.addressOptionDisabled}`
                      : styles.addressOption
                  }
                >
                  <input
                    type="radio"
                    onMouseDown={suppressMouseFocus}
                    name={radioName}
                    data-testid={optionTestId}
                    checked={selected}
                    disabled={incompatible || hideAdd}
                    aria-describedby={
                      incompatible && reason ? `${headingId}-${address.id}-reason` : undefined
                    }
                    onChange={() => onSelect(address.id)}
                  />
                  <span className={styles.addressOptionBody}>
                    <AddressSummary
                      address={address}
                      countries={countries}
                      couriers={couriers}
                      defaultBadgeLabel={t.address.defaultBadge}
                    />
                  </span>
                </label>
              </div>
              {!hideAdd && (
                <AddressActions
                  editLabel={t.address.editButton}
                  deleteLabel={t.address.deleteButton}
                  onEdit={() => onEdit(address)}
                  onDelete={() => onDelete(address.id)}
                />
              )}
              {incompatible && reason && (
                <p id={`${headingId}-${address.id}-reason`} className={styles.addressCourierReason}>
                  {reason}
                </p>
              )}
            </div>
          );
        })}
        {!hideAdd && (
          <button type="button" className={styles.addAddressTile} data-testid={addTestId} onClick={onAdd}>
            <span className={styles.addAddressPlus} aria-hidden="true">
              +
            </span>
            <span>{t.cart.addAddressLink}</span>
          </button>
        )}
      </div>
      {blockNotice && <p className={styles.notice}>{blockNotice}</p>}
      {children}
    </div>
  );
}

function AddressSummary({
  address,
  countries,
  couriers,
  defaultBadgeLabel,
}: {
  address: Address;
  countries: Country[];
  couriers: Courier[];
  defaultBadgeLabel: string;
}) {
  const label = address.label?.trim();
  const identity = identityName(address.recipientName, address.companyName);
  const title = label && identity ? `${label} : ${identity}` : label || identity;
  const addressCouriers = couriers.filter((courier) => courierCompatible(courier, address));

  return (
    <>
      <span className={styles.addressName}>
        <CourierLogos
          couriers={addressCouriers}
          className={styles.addressCouriers}
          logoClassName={styles.addressCourierLogo}
        />
        {title}
      </span>
      <PostalAddressLines address={address} countries={countries} />
      {address.isDefault && (
        <span className={`${styles.defaultBadge} ${styles.addressDefaultBadge}`}>{defaultBadgeLabel}</span>
      )}
    </>
  );
}

function PostalAddressLines({ address, countries }: { address: Address; countries: Country[] }) {
  const country = countries.find((candidate) => candidate.code === address.countryCode);
  const countryFlag = toFlagEmoji(address.countryCode);
  const pointName = pickupPointName(address.pickupPoints);

  return (
    <span className={styles.addressDetail}>
      {pointName && <span className={styles.addressPickupPoint}>{pointName}</span>}
      <span>{address.line1}</span>
      {address.line2 && <span>{address.line2}</span>}
      <span>
        {address.postalCode} {address.city}
      </span>
      <span className={styles.countryLine}>
        {countryFlag && (
          <span className={styles.countryFlag} aria-hidden="true">
            {countryFlag}
          </span>
        )}
        {country?.label ?? address.countryCode}
      </span>
    </span>
  );
}

function AddressActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.addressRowActions}>
      <button
        type="button"
        className={styles.addressDeleteButton}
        aria-label={deleteLabel}
        onClick={onDelete}
      >
        <DeleteIcon />
      </button>
      <button
        type="button"
        className={`${styles.addressIconButton} ${styles.addressIconButtonEdit}`}
        aria-label={editLabel}
        onClick={onEdit}
      >
        <EditIcon />
      </button>
    </div>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.4 1.6 12.4 4.6 4.5 12.5H1.5V9.5L9.4 1.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
