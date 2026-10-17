import type { Lang, Strings } from '../../assets/i18n/types';
import type { OrderItem } from '../../api/orders';
import { PluginOrderLines } from '../../plugins/PluginHost';
import { usesSingularItemCount } from '../../utils/cartDisplayName';
import { groupOrderItemsByShape, type OrderShapeGroup } from '../../utils/groupOrderItems';
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

function isExtraSetLine(item: OrderItem): boolean {
  return Array.isArray(item.nails) && item.nails.length > 0;
}

/**
 * Extra-set rows (plugin), then nails, then paid accessories, then gifts —
 * each present block gets its own labeled divider (singular/plural picked by
 * that block's own total quantity) instead of the usual inset between-card
 * hairline, so the kinds of lines never blur together in one undifferentiated
 * list.
 */
export function OrderItemSections({ items, t, lang, hideMoney, renderGroup }: OrderItemSectionsProps) {
  const extraItems = items.filter(isExtraSetLine);
  const catalogItems = items.filter((item) => !isExtraSetLine(item));
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
  const extraQuantity = extraItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {(extraItems.length > 0 || nailGroups.length > 0) && (
        <li className={styles.itemGroupLabel}>
          <span>
            {sectionLabel(
              sectionQuantity(nailGroups) + extraQuantity,
              t.ordersPage.itemGroupNailsOne,
              t.ordersPage.itemGroupNailsOther,
            )}
          </span>
        </li>
      )}
      <PluginOrderLines items={items} hideMoney={hideMoney} />
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
