import type { Lang, Strings } from '../../assets/i18n/types';
import type { OrderItem } from '../../api/orders';
import { usesSingularItemCount } from '../../utils/cartDisplayName';
import { groupOrderItemsByShape, type OrderShapeGroup } from '../../utils/groupOrderItems';
import { splitOrderItemsByComposition } from '../../utils/orderComposition';
import { OrderCompositionBlock } from './OrderCompositionBlock';
import styles from './OrdersList.module.css';

interface OrderItemSectionsProps {
  items: OrderItem[];
  t: Strings;
  lang: Lang;
  hideMoney: boolean;
  /** One grouped catalogue card — passed in so this file stays about the
   * sectioning and OrdersList keeps owning the card itself. */
  renderGroup: (group: OrderShapeGroup) => React.ReactNode;
}

/**
 * Nails, then paid accessories, then gifts — each present block gets its own
 * labeled "cut line" divider (singular/plural picked by that block's own
 * total quantity) instead of the usual inset between-card hairline, so the
 * three kinds of lines never blur together in one undifferentiated list.
 *
 * Composed sets sit at the head of the nail block: one card per set, never
 * one order line per nail.
 */
export function OrderItemSections({ items, t, lang, hideMoney, renderGroup }: OrderItemSectionsProps) {
  const { compositionItems, catalogItems } = splitOrderItemsByComposition(items);
  const allGroups = groupOrderItemsByShape(catalogItems);
  const isGiftGroup = (group: OrderShapeGroup) =>
    group.variants.every((item) => item.origin === 'rule' || item.locked);
  const nailGroups = allGroups.filter((group) => group.shapeKey !== '' && !isGiftGroup(group));
  const accessoryGroups = allGroups.filter((group) => group.shapeKey === '' && !isGiftGroup(group));
  const giftGroups = allGroups.filter(isGiftGroup);
  const sectionQuantity = (groups: OrderShapeGroup[]) =>
    groups.reduce((sum, group) => sum + group.variants.reduce((s, v) => s + v.quantity, 0), 0);
  const sectionLabel = (quantity: number, singular: string, plural: string) =>
    usesSingularItemCount(quantity, lang) ? singular : plural;
  const compositionQuantity = compositionItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {(compositionItems.length > 0 || nailGroups.length > 0) && (
        <li className={styles.itemGroupLabel}>
          <span>
            {sectionLabel(
              sectionQuantity(nailGroups) + compositionQuantity,
              t.ordersPage.itemGroupNailsOne,
              t.ordersPage.itemGroupNailsOther,
            )}
          </span>
        </li>
      )}
      {compositionItems.map((item) => (
        <OrderCompositionBlock
          key={item.id}
          title={item.title || t.galleryNail.compositionTitle}
          size={item.size || 'M'}
          quantity={item.quantity}
          lineTotal={item.lineTotal}
          nails={item.nails ?? []}
          t={t}
          hideMoney={hideMoney}
          comment={item.comment}
        />
      ))}
      {nailGroups.map((group) => renderGroup(group))}
      {accessoryGroups.length > 0 && (
        <li className={styles.itemGroupLabel}>
          <span>
            {sectionLabel(
              sectionQuantity(accessoryGroups),
              t.ordersPage.itemGroupAccessoriesOne,
              t.ordersPage.itemGroupAccessoriesOther,
            )}
          </span>
        </li>
      )}
      {accessoryGroups.map((group) => renderGroup(group))}
      {giftGroups.length > 0 && (
        <li className={styles.itemGroupLabel}>
          <span>
            {sectionLabel(
              sectionQuantity(giftGroups),
              t.ordersPage.itemGroupGiftsOne,
              t.ordersPage.itemGroupGiftsOther,
            )}
          </span>
        </li>
      )}
      {giftGroups.map((group) => renderGroup(group))}
    </>
  );
}
