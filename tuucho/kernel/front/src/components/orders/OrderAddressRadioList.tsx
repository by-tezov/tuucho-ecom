import type { Address, Country } from '../../api/account';
import { useLang } from '../../assets/i18n';
import { identityName } from '../../utils/customerIdentity';
import { toFlagEmoji } from '../../utils/countryFlag';
import { pickupPointName } from '../../utils/pickupPoint';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import styles from './EditOrderBillingModal.module.css';

interface OrderAddressRadioListProps {
  /** Id of the section heading: names the radio group (RGAA 11.5). */
  labelledBy: string;
  name: string;
  addresses: Address[];
  countries: Country[];
  selectedId: string | null | undefined;
  /** The address the order currently uses: outlined and tagged in words, so
   * the tag is part of its radio's name (RGAA 3.1, 11.1). */
  currentId: string | null | undefined;
  onSelect: (addressId: string) => void;
}

/** One of EditOrderBillingModal's address choices (delivery or billing): a
 * radio group named by its section heading. */
export function OrderAddressRadioList({
  labelledBy,
  name,
  addresses,
  countries,
  selectedId,
  currentId,
  onSelect,
}: OrderAddressRadioListProps) {
  const { t } = useLang();
  return (
    <div className={styles.addressList} role="radiogroup" aria-labelledby={labelledBy}>
      {addresses.map((address) => {
        const selected = selectedId === address.id;
        const current = currentId === address.id;
        return (
          <div
            key={address.id}
            className={[
              styles.addressRow,
              current && styles.addressRowCurrent,
              selected && styles.addressRowSelected,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <label className={styles.addressOption}>
              <input
                type="radio"
                onMouseDown={suppressMouseFocus}
                name={name}
                checked={selected}
                onChange={() => onSelect(address.id)}
              />
              <span>
                <AddressHeading address={address} />
                {current && (
                  <span className={styles.addressCurrentTag}>{t.ordersPage.editOrderCurrentAddress}</span>
                )}
                <span className={styles.addressDetail}>
                  <AddressLines address={address} countries={countries} />
                </span>
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}

/** Customer's own name for the address on top when they gave one, the
 * recipient/company under it; otherwise the identity takes that top line
 * rather than leaving an empty one (same rule as cart and address book). */
function AddressHeading({ address }: { address: Address }) {
  const label = address.label?.trim();
  const identity = identityName(address.recipientName, address.companyName);
  return (
    <>
      <span className={styles.addressName}>{label || identity}</span>
      {label && identity && <span className={styles.addressIdentity}>{identity}</span>}
    </>
  );
}

function AddressLines({ address, countries }: { address: Address; countries: Country[] }) {
  const country = countries.find((candidate) => candidate.code === address.countryCode);
  const flag = toFlagEmoji(address.countryCode);
  const pointName = pickupPointName(address.pickupPoints);
  return (
    <span className={styles.addressDetail}>
      {/* A relay address is identified by the relay's own name first. */}
      {pointName && <span className={styles.addressPickupPoint}>{pointName}</span>}
      <span>{address.line1}</span>
      {address.line2 && <span>{address.line2}</span>}
      <span>
        {address.postalCode} {address.city}
      </span>
      <span className={styles.countryLine}>
        {flag && (
          <span className={styles.countryFlag} aria-hidden="true">
            {flag}
          </span>
        )}
        {country?.label ?? address.countryCode}
      </span>
    </span>
  );
}
