import styles from './CardBrandMark.module.css';

/** Compact CSS brand mark for a Stripe card `brand` string (visa, mastercard,
 * amex, …). Same visual language as the cart add-card VISA / Mastercard
 * chips — no downloaded logo assets. */
export function CardBrandMark({ brand }: { brand: string }) {
  const key = brand.trim().toLowerCase();
  if (key === 'visa') {
    return (
      <span className={styles.visa} aria-hidden="true">
        VISA
      </span>
    );
  }
  if (key === 'mastercard') {
    return (
      <span className={styles.mastercard} aria-hidden="true">
        <i />
        <i />
      </span>
    );
  }
  if (key === 'amex' || key === 'american_express') {
    return (
      <span className={styles.amex} aria-hidden="true">
        AMEX
      </span>
    );
  }
  if (key === 'cartes_bancaires' || key === 'cb') {
    return (
      <span className={styles.cb} aria-hidden="true">
        CB
      </span>
    );
  }
  if (key === 'discover') {
    return (
      <span className={styles.discover} aria-hidden="true">
        DISCOVER
      </span>
    );
  }
  if (key === 'diners' || key === 'diners_club') {
    return (
      <span className={styles.diners} aria-hidden="true">
        DINERS
      </span>
    );
  }
  if (key === 'jcb') {
    return (
      <span className={styles.jcb} aria-hidden="true">
        JCB
      </span>
    );
  }
  if (key === 'unionpay') {
    return (
      <span className={styles.unionpay} aria-hidden="true">
        UnionPay
      </span>
    );
  }
  return (
    <span className={styles.fallback} aria-hidden="true">
      {brand.toUpperCase()}
    </span>
  );
}
