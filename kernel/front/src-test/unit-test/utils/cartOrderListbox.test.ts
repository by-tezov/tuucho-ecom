import { describe, expect, it } from 'vitest';
import {
  cartDisplayName,
  formatCartItemCount,
  isSystemCartKind,
  limitedCartCount,
  sortCartsByCreatedAtDesc,
  usesSingularItemCount,
} from '@/utils/cartDisplayName';
import { groupOrderItemsByShape } from '@/utils/groupOrderItems';
import { focusSelectedOrFirstOption, handleListboxKeyDown } from '@/utils/listboxKeyboard';
import type { OrderItem } from '@/api/orders';
import type { Strings } from '@/assets/i18n/types';

const t = {
  cart: {
    cartItemCount: '{count} item',
    cartItemsCount: '{count} items',
    guestCartName: 'Unconnected cart',
    defaultCartName: 'Default cart',
    wishlistCartName: 'Wishlist',
    createCartDialogTitle: 'New cart',
  },
  gift: {
    cartTileName: 'Gift for {name}',
    cartTileFallback: 'Gift',
  },
} as Strings;

describe('cartDisplayName helpers', () => {
  it('localizes counts and system cart labels', () => {
    expect(usesSingularItemCount(0, 'fr')).toBe(true);
    expect(usesSingularItemCount(0, 'en')).toBe(false);
    expect(formatCartItemCount(2, t, 'en')).toBe('2 items');
    expect(isSystemCartKind('default')).toBe(true);
    expect(limitedCartCount([{ kind: 'default' }, { kind: 'custom' }])).toBe(1);
    expect(
      sortCartsByCreatedAtDesc([
        { createdAt: '2026-01-01T00:00:00.000Z', id: 'a' },
        { createdAt: '2026-02-01T00:00:00.000Z', id: 'b' },
      ]).map((c) => c.id),
    ).toEqual(['b', 'a']);
    expect(cartDisplayName({ kind: 'default', name: 'default cart' }, t)).toBe('Default cart');
    expect(cartDisplayName({ kind: 'gift', name: '', gift: { receiverName: 'Ada' } }, t)).toBe(
      'Gift for Ada',
    );
  });
});

describe('groupOrderItemsByShape', () => {
  it('merges size variants and keeps gifts last', () => {
    const paid = {
      id: '1',
      productId: 'p',
      productUid: 'u',
      title: 'Set',
      desc: null,
      shapeKey: 'almond',
      shapeLabel: 'Amande',
      lengthKey: 'medium',
      lengthLabel: 'Moyen',
      packKey: '',
      packLabel: '',
      photo: null,
      unitPrice: 10,
      size: 'M',
      origin: 'user',
      locked: false,
    } as OrderItem;
    const gift = {
      ...paid,
      id: '2',
      size: 'S',
      origin: 'rule',
      locked: true,
      productId: 'g',
    } as OrderItem;
    const groups = groupOrderItemsByShape([
      paid,
      { ...paid, id: '3', size: 'S' } as OrderItem,
      gift,
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.variants).toHaveLength(2);
    expect(groups[1]?.variants[0]?.origin).toBe('rule');
  });
});

describe('listboxKeyboard', () => {
  it('moves focus with arrows and Escape', () => {
    const a = document.createElement('button');
    const b = document.createElement('button');
    document.body.append(a, b);
    a.focus();
    const preventDefault = () => undefined;
    handleListboxKeyDown(
      { key: 'ArrowDown', preventDefault, shiftKey: false } as KeyboardEvent,
      [a, b],
      { onEscape: () => undefined },
    );
    expect(document.activeElement).toBe(b);
    let escaped = false;
    handleListboxKeyDown(
      { key: 'Escape', preventDefault, shiftKey: false } as KeyboardEvent,
      [a, b],
      { onEscape: () => {
        escaped = true;
      } },
    );
    expect(escaped).toBe(true);
    a.remove();
    b.remove();
  });

  it('focuses the selected option when present', () => {
    const root = document.createElement('div');
    const first = document.createElement('button');
    first.setAttribute('role', 'option');
    const selected = document.createElement('button');
    selected.setAttribute('role', 'option');
    selected.setAttribute('aria-selected', 'true');
    root.append(first, selected);
    document.body.append(root);
    focusSelectedOrFirstOption(root);
    expect(document.activeElement).toBe(selected);
    root.remove();
  });
});
