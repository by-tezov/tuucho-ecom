import { useEffect, useState } from 'react';
import { Chip } from '../ui/Chip';
import { Figure } from '../ui/Figure';
import { useCartCommands, useCartData } from '../../hooks/useCart';
import type { ProductById } from '../../api/gallery';
import type { Size } from '../../api/cart';
import { formatPrice } from '../../utils/formatPrice';
import {
  accessoryLinePhoto,
  costFitsRemaining,
  defaultPackKey,
  packQtyMax,
  resolvePackPrice,
  sellablePackKeys,
  sellablePackKeysWithinBudget,
} from '../../utils/accessoryPacks';
import { useLang } from '../../assets/i18n';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import styles from './CartAccessoryCard.module.css';

interface CartAccessoryCardProps {
  product: ProductById;
}

export function CartAccessoryCard({ product }: CartAccessoryCardProps) {
  const { t } = useLang();
  const gift = useOptionalGiftReceiver();
  const hidePrices = gift.active && gift.hidePrices;
  const remainingAccessoryBudget = gift.active
    ? (gift.summary?.remaining?.remainingAccessoryBudget ?? null)
    : null;
  const { cartReady, getCartLine } = useCartData();
  const { addToCart } = useCartCommands();
  const cartLine = getCartLine(product.id);
  const sellable =
    typeof remainingAccessoryBudget === 'number'
      ? sellablePackKeysWithinBudget(product, remainingAccessoryBudget)
      : sellablePackKeys(product);
  const [packKey, setPackKey] = useState(() => defaultPackKey(product, cartLine?.packKey, sellable));
  // Guards against a double-submit only — the line itself lands optimistically,
  // so adding to the cart never blocks behind a dialog.
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const keys =
      typeof remainingAccessoryBudget === 'number'
        ? sellablePackKeysWithinBudget(product, remainingAccessoryBudget)
        : sellablePackKeys(product);
    setPackKey(defaultPackKey(product, cartLine?.packKey, keys));
  }, [cartLine?.packKey, product, remainingAccessoryBudget]);

  const photo = accessoryLinePhoto(product, packKey);
  const price = resolvePackPrice(product, packKey);
  const maxQuantity = packQtyMax(product, packKey);
  const packFitsBudget =
    typeof remainingAccessoryBudget !== 'number' ||
    (price !== undefined && costFitsRemaining(price, remainingAccessoryBudget));
  // Pack accessories need a selected pack; plain-quantity accessories
  // (sellable === [], packKey always '') just need stock.
  const canAdd = cartReady && (sellable.length === 0 || packKey !== '') && maxQuantity >= 1 && packFitsBudget;

  async function handleAdd() {
    if (!canAdd || adding) return;
    setAdding(true);
    try {
      await addToCart(
        product.id,
        '',
        '',
        '' as Size,
        { title: product.title, photo, price },
        1,
        maxQuantity,
        false,
        packKey,
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    // An article named by its title: the card holds controls and a price,
    // not an image and its caption.
    <article
      className={styles.card}
      aria-labelledby={`cart-accessory-${product.productUid}-title`}
      data-testid="cart-accessory-card"
      data-product-uid={product.productUid}
    >
      <div className={styles.photoWrap}>
        {photo ? (
          <Figure src={photo} alt={product.title} aspectRatio="3 / 2" bordered={false} draggable={false} />
        ) : null}
        <div className={styles.packBadges}>
          {sellable.map((key) => (
            <Chip key={key} active={key === packKey} onClick={() => setPackKey(key)}>
              {product.packLabels?.[key] ?? key}
            </Chip>
          ))}
        </div>
      </div>
      <div className={styles.caption}>
        <h3 id={`cart-accessory-${product.productUid}-title`} className={styles.title}>
          {product.title}
        </h3>
        {product.desc ? <p className={styles.desc}>{product.desc}</p> : null}
        <div className={styles.purchaseRow}>
          {price !== undefined && !hidePrices ? (
            <span className={styles.price}>{formatPrice(price)}</span>
          ) : null}
          {canAdd ? (
            <button
              type="button"
              className={styles.addButton}
              onClick={() => void handleAdd()}
              disabled={adding}
              aria-label={`${t.gallery.addToCartAria}, ${product.title}`}
            >
              <span className={styles.addButtonIcons}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M2 2h1.2l.9 8.1a1.4 1.4 0 0 0 1.4 1.25h6.2a1.4 1.4 0 0 0 1.38-1.16l.82-4.7H4.4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="6.2" cy="13.4" r="1" fill="currentColor" />
                  <circle cx="11" cy="13.4" r="1" fill="currentColor" />
                </svg>
                <span className={styles.plusBadge}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 1.5v6M1.5 4.5h6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
              <span className={styles.addButtonLabel}>{t.gallery.addCta}</span>
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
