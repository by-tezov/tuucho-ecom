import { Link } from 'react-router-dom';
import { localizedPath } from '../../config/i18nRoutes';
import { CartLine } from '../../components/cart/CartLine';
import { CompositionCartBlock } from '../../components/cart/CompositionCartBlock';
import { AccessoryCartLine } from '../../components/cart/AccessoryCartLine';
import { CartAccessoryCarousel } from '../../components/cart/CartAccessoryCarousel';
import { CartRulesProgress } from '../../components/cart/CartRulesProgress';
import { type CartComposition, type CartItem, type Size } from '../../api/cart';
import type { ProductById } from '../../api/gallery';
import type { GalleryItem } from '../../data/types';
import type { useLang } from '../../assets/i18n';
import type { Lang } from '../../assets/i18n/types';
import { lengthAfterShapeChange } from '../../data/galleryShape';
import { packQtyMax } from '../../utils/accessoryPacks';
import { lastGiftUserLineRemoval } from '../../utils/giftCartEdit';
import type { previewNailQtyTier } from '../../utils/cartRulesPreview';
import cartFeatureStyles from '../../components/cart/CartFeature.module.css';
import pageStyles from '../CartPage.module.css';
import { CartComposeEditNotice } from './CartComposeEditNotice';
import { useCartCommands } from '../../hooks/useCart';

const styles = { ...pageStyles, ...cartFeatureStyles };

type T = ReturnType<typeof useLang>['t'];
type NailQtyTier = NonNullable<ReturnType<typeof previewNailQtyTier>>;

type LineGroup = {
  key: string;
  set: GalleryItem;
  shapeKey: string;
  lengthKey: string;
  variants: CartItem[];
};

export function ShopCartLinesSection(props: {
  t: T;
  lang: Lang;
  compositions: CartComposition[];
  cartLocked?: boolean;
  hideCompositionMoney?: boolean;
  onUpdateComposition: (id: string, size: Size, quantity: number) => void;
  onAddCompositionAsNew: (id: string, size: Size, quantity: number) => void;
  onRemoveComposition: (id: string) => void;
  onMoveCompositionToWishlist: (id: string) => void;
  onStartCompositionEdit: (id: string) => void;
  status: string;
  giftLocked: boolean;
  giftPayable: boolean;
  isGiftCart: boolean;
  canMoveToWishlist: boolean;
  isWishlistCart: boolean;
  lineGroups: LineGroup[];
  giftLines: Array<{ item: CartItem; product: ProductById }>;
  userAccessoryLines: Array<{ item: CartItem; product: ProductById }>;
  carouselAccessories: ProductById[];
  showRulesBlock: boolean;
  nailQtyTier: NailQtyTier | null | undefined;
  hasNonRuleItems: boolean;
  restoreSizePicker: Parameters<typeof CartLine>[0]['restoreSizePicker'];
  onSizePickerRestored: () => void;
  updateCartLine: (
    productId: string,
    shapeKey: string,
    lengthKey: string,
    size: Size | '',
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number; packKey: string }>,
  ) => void | Promise<void>;
  removeFromCart: (
    productId: string,
    shapeKey: string,
    lengthKey: string,
    size: Size | '',
  ) => void | Promise<void>;
  moveToWishlist: (lines: CartItem[]) => void | Promise<void>;
  navigateToLogin: () => void;
  handleAddAsNewLine: (
    item: CartItem,
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
  ) => void;
  handleReplaceLine: (
    item: CartItem,
    patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number }>,
  ) => void;
  setRemovalTarget: (target: {
    productId: string;
    shapeKey: string;
    lengthKey: string;
    size: Size | '';
  }) => void;
  onCancelLastGiftItem: () => void;
}) {
  const {
    t,
    lang,
    compositions,
    cartLocked = false,
    hideCompositionMoney = false,
    onUpdateComposition,
    onAddCompositionAsNew,
    onRemoveComposition,
    onMoveCompositionToWishlist,
    onStartCompositionEdit,
    status,
    giftLocked,
    giftPayable,
    isGiftCart,
    canMoveToWishlist,
    isWishlistCart,
    lineGroups,
    giftLines,
    userAccessoryLines,
    carouselAccessories,
    showRulesBlock,
    nailQtyTier,
    hasNonRuleItems,
    restoreSizePicker,
    onSizePickerRestored,
    updateCartLine,
    removeFromCart,
    moveToWishlist,
    navigateToLogin,
    handleAddAsNewLine,
    handleReplaceLine,
    setRemovalTarget,
    onCancelLastGiftItem,
  } = props;

  const { setCardComment, setCompositionComment } = useCartCommands();

  const userItems = [
    ...lineGroups.flatMap((group) => group.variants),
    ...userAccessoryLines.map(({ item }) => item),
  ];

  function cancelIfLastUserLines(removing: CartItem[]): boolean {
    if (
      !lastGiftUserLineRemoval({
        isGiftCart,
        giftPayable,
        giftLocked,
        userItems,
        removing,
      })
    ) {
      return false;
    }
    onCancelLastGiftItem();
    return true;
  }

  return (
    <>
      <CartComposeEditNotice />
      <ul className={styles.list}>
        {compositions.map((composition) => (
          <CompositionCartBlock
            key={composition.id}
            composition={composition}
            t={t}
            lang={lang}
            cartLocked={cartLocked}
            hideMoney={hideCompositionMoney}
            canMoveToWishlist={canMoveToWishlist && !isGiftCart}
            readOnly={giftLocked}
            onUpdateQuantity={(quantity) => onUpdateComposition(composition.id, composition.size, quantity)}
            onUpdateSizeQuantity={(size, quantity) => onUpdateComposition(composition.id, size, quantity)}
            onAddCompositionAsNew={(size, quantity) => onAddCompositionAsNew(composition.id, size, quantity)}
            onRemove={() => onRemoveComposition(composition.id)}
            onMoveToWishlist={() => onMoveCompositionToWishlist(composition.id)}
            onStartEdit={() => onStartCompositionEdit(composition.id)}
            onSaveComment={(comment) => void setCompositionComment(composition.id, comment)}
          />
        ))}
        {lineGroups.map(({ key, set, shapeKey, lengthKey, variants }) => (
          <CartLine
            key={key}
            set={set}
            shapeKey={shapeKey}
            lengthKey={lengthKey}
            variants={variants}
            {...(restoreSizePicker !== undefined ? { restoreSizePicker } : {})}
            onSizePickerRestored={onSizePickerRestored}
            t={t}
            onUpdateQuantity={(item, quantity) =>
              updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, {
                quantity,
              })
            }
            onAddAsNewLine={handleAddAsNewLine}
            onReplaceLine={handleReplaceLine}
            onReplaceGroupVariant={(axis, newKey, mode, resolvedLines) => {
              const newShapeKey = axis === 'shape' ? newKey : shapeKey;
              const newLengthKey = axis === 'shape' ? lengthAfterShapeChange(set, newKey, lengthKey) : newKey;
              for (const item of variants) {
                const resolved = resolvedLines.find((line) => line.originalSize === item.size);
                if (!resolved) continue;
                const patch = {
                  shapeKey: newShapeKey,
                  lengthKey: newLengthKey,
                  size: resolved.newSize as Size,
                  quantity: resolved.quantity,
                };
                if (mode === 'new') handleAddAsNewLine(item, patch);
                else handleReplaceLine(item, patch);
              }
            }}
            onRequestRemoval={(item) => {
              if (cancelIfLastUserLines([item])) return;
              setRemovalTarget({
                productId: item.productId,
                shapeKey: item.shapeKey,
                lengthKey: item.lengthKey,
                size: item.size,
              });
            }}
            onRemoveVariant={(item) => {
              if (cancelIfLastUserLines([item])) return;
              void removeFromCart(item.productId, item.shapeKey, item.lengthKey, item.size);
            }}
            onRequestDeleteGroup={() => cancelIfLastUserLines(variants)}
            onDeleteGroup={() => {
              if (cancelIfLastUserLines(variants)) return;
              variants.forEach(
                (item) => void removeFromCart(item.productId, item.shapeKey, item.lengthKey, item.size),
              );
            }}
            onMoveGroupToWishlist={() => {
              if (status !== 'authenticated') {
                navigateToLogin();
                return;
              }
              void moveToWishlist(variants);
            }}
            canMoveToWishlist={canMoveToWishlist}
            isWishlistCart={isWishlistCart}
            readOnly={giftLocked || cartLocked}
            creditHeldStock={isGiftCart}
            onSaveComment={(comment) =>
              void setCardComment({ productId: set.id, shapeKey, lengthKey }, comment)
            }
          />
        ))}
      </ul>

      {showRulesBlock && (
        <div className={styles.rulesSection}>
          <ul className={styles.list}>
            {giftLines.map(({ item, product }) => (
              <AccessoryCartLine
                key={`gift-${item.productId}`}
                product={product}
                item={item}
                t={t}
                onUpdateQuantity={() => undefined}
                onRequestRemoval={() => undefined}
                onDelete={() => Promise.resolve()}
              />
            ))}
            {nailQtyTier && nailQtyTier.nailQty > 0 && <CartRulesProgress tier={nailQtyTier} t={t} />}
          </ul>
        </div>
      )}

      {hasNonRuleItems &&
        (userAccessoryLines.length > 0 || (!giftLocked && carouselAccessories.length > 0)) && (
          <section
            className={
              userAccessoryLines.length > 0
                ? styles.addAccessoriesSection
                : `${styles.addAccessoriesSection} ${styles.addAccessoriesSectionNoLines}`
            }
            aria-labelledby="cart-add-accessories-h"
          >
            {!giftLocked ? (
              <h2 id="cart-add-accessories-h" className={styles.sectionTitle}>
                {t.cart.addAccessoriesHeading}
              </h2>
            ) : null}
            {!giftLocked ? <CartAccessoryCarousel products={carouselAccessories} /> : null}
            {userAccessoryLines.length > 0 ? (
              <ul className={styles.addAccessoriesLines}>
                {userAccessoryLines.map(({ item, product }) => (
                  <AccessoryCartLine
                    key={`${item.productId}-${item.origin ?? 'user'}`}
                    product={product}
                    item={item}
                    t={t}
                    onUpdateQuantity={(quantity) =>
                      updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, {
                        quantity,
                      })
                    }
                    onChangePackKey={(packKey) => {
                      const max = packQtyMax(product, packKey);
                      updateCartLine(item.productId, item.shapeKey, item.lengthKey, item.size, {
                        packKey,
                        quantity: Math.min(item.quantity, max),
                      });
                    }}
                    onRequestRemoval={() => {
                      if (cancelIfLastUserLines([item])) return;
                      setRemovalTarget({
                        productId: item.productId,
                        shapeKey: item.shapeKey,
                        lengthKey: item.lengthKey,
                        size: item.size,
                      });
                    }}
                    onRequestDelete={() => cancelIfLastUserLines([item])}
                    onDelete={() => {
                      if (cancelIfLastUserLines([item])) return Promise.resolve();
                      return Promise.resolve(
                        removeFromCart(item.productId, item.shapeKey, item.lengthKey, item.size),
                      );
                    }}
                    readOnly={giftLocked}
                    creditHeldStock={isGiftCart}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        )}
    </>
  );
}

/** Empty cart message when there are no user-payable lines. */
export function ShopCartEmptyState(props: { t: T; lang: Lang; isGiftCart: boolean; giftPayable: boolean }) {
  const { t, lang, isGiftCart, giftPayable } = props;
  const giftEmpty = giftPayable ? t.gift.emptyWaitingGiverCleared : t.gift.emptyWaitingReceiver;
  return (
    <div className={styles.empty}>
      <p>{isGiftCart ? giftEmpty : t.cart.emptyState}</p>
      {!isGiftCart && (
        <Link to={localizedPath('/gallery', lang)} className={styles.emptyLink}>
          {t.cart.browseGalleryLink}
        </Link>
      )}
    </div>
  );
}
