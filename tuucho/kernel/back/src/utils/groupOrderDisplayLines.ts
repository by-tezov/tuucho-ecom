/** Display aggregation for confirmation emails and invoice PDFs: one block
 * per ref+shape+length, with size-only sublines. Flat order_items storage
 * stays (set, shape, length, size) — this is presentation only. Length is
 * part of the grouping key so two lengths of one shape stay separate
 * blocks, and `lengthLabel` is rendered next to `shapeLabel` everywhere this
 * grouping feeds (order emails, invoice PDF).
 *
 * Groups are always returned ordered catalogue sets first, then extra sets,
 * then paid accessories, then gifts — never interleaved, regardless of the
 * input items' own order (see `section`/`sectionStart` below). */

export interface OrderDisplaySizeLine {
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type OrderDisplaySection = 'nail' | 'customSet' | 'accessory' | 'gift';

export interface OrderDisplayNailLine {
  title: string;
  /** Catalogue reference of that single nail ('' when unknown). */
  productUid: string;
  shapeLabel: string;
  lengthLabel: string;
  finger: string;
  photo: string | null;
  /** "Couleur : Rose"; empty for a nail without variations. */
  variationLabel: string;
}

export interface OrderDisplayGroup {
  key: string;
  title: string;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  lengthLabel: string;
  /** Accessory pack key ('' for nails and non-pack accessories). */
  packKey: string;
  /** Resolved pack label (e.g. "x2"); '' when the line has no pack. */
  packLabel: string;
  productUid: string | null;
  photo: string | null;
  /** Representative unit price (same product/shape priced identically). */
  unitPrice: number;
  sizes: OrderDisplaySizeLine[];
  groupTotal: number;
  /** True when every line in the group is a cart-rule gift (free add-on). */
  isGift: boolean;
  /** Extra-set children when section is customSet. */
  nails: OrderDisplayNailLine[];
  /** Customer note from the cart card: first non-empty note among the
   * group's lines (they all carry the same one); null when none. */
  comment: string | null;
  /** 'gift' when isGift; otherwise product-type driven. */
  section: OrderDisplaySection;
  /** True only on the first group of its section — callers render a
   * section-header divider right before any group with this set. */
  sectionStart: boolean;
}

export interface OrderDisplayLineInput {
  /** Prefer gallery set id when present; orphans fall back to id/productUid. */
  productId?: string | null;
  id?: string | null;
  productUid?: string | null;
  productType?: string | null;
  title: string | { fr: string };
  shapeKey: string;
  shapeLabel?: string;
  lengthKey?: string;
  lengthLabel?: string;
  /** Accessory pack key — part of the grouping key so two different packs
   * of the same accessory (e.g. "x2" and "x4") never merge into one block,
   * the way two different shapes of the same product never do either. */
  packKey?: string;
  packLabel?: string;
  photo?: string | null;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  origin?: 'user' | 'rule' | string | null;
  locked?: boolean;
  comment?: string | null;
  nails?: Array<{
    title: string | { fr: string };
    productUid?: string | null;
    shapeLabel?: string;
    lengthLabel?: string;
    finger: string;
    photo?: string | null;
    variationLabel?: string;
    variationAxisLabel?: string;
  }>;
}

function titleText(title: string | { fr: string }): string {
  return typeof title === 'string' ? title : title.fr;
}

export function groupOrderDisplayLines(items: OrderDisplayLineInput[]): OrderDisplayGroup[] {
  const groups: OrderDisplayGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    const isCustomSet = (item.nails?.length ?? 0) > 0;
    const variant = `${item.shapeKey}::${item.lengthKey ?? ''}::${item.packKey ?? ''}`;
    const key = isCustomSet
      ? `customSet::${item.id ?? item.productUid ?? groups.length}`
      : item.productId
        ? `${item.productId}::${variant}`
        : item.productUid
          ? `${item.productUid}::${variant}`
          : `${item.id ?? 'line'}::${variant}`;
    const existing = isCustomSet ? undefined : indexByKey.get(key);
    const sizeLine: OrderDisplaySizeLine = {
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    };
    if (existing === undefined) {
      if (!isCustomSet) indexByKey.set(key, groups.length);
      groups.push({
        key,
        title: titleText(item.title),
        shapeKey: item.shapeKey,
        shapeLabel: item.shapeLabel ?? item.shapeKey,
        lengthKey: item.lengthKey ?? '',
        lengthLabel: item.lengthLabel ?? item.lengthKey ?? '',
        packKey: item.packKey ?? '',
        packLabel: item.packLabel ?? item.packKey ?? '',
        productUid: isCustomSet ? null : (item.productUid ?? null),
        photo: item.photo ?? null,
        unitPrice: item.unitPrice,
        sizes: [sizeLine],
        groupTotal: item.lineTotal,
        isGift: item.origin === 'rule',
        nails: (item.nails ?? []).map((nail) => ({
          title: titleText(nail.title),
          productUid: nail.productUid ?? '',
          shapeLabel: nail.shapeLabel ?? '',
          lengthLabel: nail.lengthLabel ?? '',
          finger: nail.finger,
          photo: nail.photo ?? null,
          variationLabel:
            nail.variationLabel && nail.variationAxisLabel
              ? `${nail.variationAxisLabel} : ${nail.variationLabel}`
              : (nail.variationLabel ?? ''),
        })),
        comment: item.comment || null,
        section: 'nail',
        sectionStart: false,
      });
    } else {
      const group = groups[existing]!;
      group.sizes.push(sizeLine);
      group.groupTotal += item.lineTotal;
      group.isGift = group.isGift && item.origin === 'rule';
      group.comment = group.comment ?? (item.comment || null);
    }
  }

  const sectionOf = (group: OrderDisplayGroup): OrderDisplaySection => {
    if (group.isGift) return 'gift';
    if (group.nails.length > 0) return 'customSet';
    return group.shapeKey ? 'nail' : 'accessory';
  };
  const sectionOrder: Record<OrderDisplaySection, number> = {
    nail: 0,
    customSet: 1,
    accessory: 2,
    gift: 3,
  };
  for (const group of groups) group.section = sectionOf(group);
  groups.sort((a, b) => sectionOrder[a.section] - sectionOrder[b.section]);
  let lastSection: OrderDisplaySection | undefined;
  for (const group of groups) {
    group.sectionStart = group.section !== lastSection;
    lastSection = group.section;
  }
  return groups;
}
