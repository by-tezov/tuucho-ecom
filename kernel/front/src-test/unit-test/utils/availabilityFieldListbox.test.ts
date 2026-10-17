import { describe, expect, it, vi } from 'vitest';
import {
  availableQuantityFor,
  availableSizesFor,
  preferredAvailableSize,
  quantityAvailableToLine,
} from '@/utils/availability';
import { FIELD_CART_QUANTITY_MAX, FIELD_EMAIL_MAX } from '@/utils/fieldLimits';
import { focusSelectedOrFirstOption, handleListboxKeyDown } from '@/utils/listboxKeyboard';

describe('availability', () => {
  const available = {
    almond: { medium: { S: 2, M: 0, L: 1 } },
  } as const;

  it('treats missing stock as zero and credits holds', () => {
    expect(availableQuantityFor(available, 'almond', 'medium', 'S')).toBe(2);
    expect(availableQuantityFor(available, 'almond', 'medium', 'XL')).toBe(0);
    expect(quantityAvailableToLine(2, 3, false)).toBe(2);
    expect(quantityAvailableToLine(2, 3, true)).toBe(5);
    expect(availableSizesFor(available, 'almond', 'medium', ['S', 'M', 'L'] as const)).toEqual([
      'S',
      'L',
    ]);
    expect(
      preferredAvailableSize(available, 'almond', 'medium', ['M', 'S', 'L'] as const, ['M']),
    ).toBe('S');
  });
});

describe('fieldLimits', () => {
  it('exposes positive ceilings', () => {
    expect(FIELD_EMAIL_MAX).toBeGreaterThan(0);
    expect(FIELD_CART_QUANTITY_MAX).toBe(99);
  });
});

describe('listboxKeyboard', () => {
  it('cycles options and focuses the selected one', () => {
    const root = document.createElement('div');
    const a = document.createElement('button');
    const b = document.createElement('button');
    a.setAttribute('role', 'option');
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', 'true');
    root.append(a, b);
    document.body.append(root);
    const focusA = vi.spyOn(a, 'focus');
    const focusB = vi.spyOn(b, 'focus');
    focusSelectedOrFirstOption(root);
    expect(focusB).toHaveBeenCalled();

    a.focus();
    const onEscape = vi.fn();
    handleListboxKeyDown(
      { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent,
      [a, b],
      { onEscape },
    );
    expect(focusB).toHaveBeenCalled();
    handleListboxKeyDown(
      { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent,
      [a, b],
      { onEscape },
    );
    expect(onEscape).toHaveBeenCalled();
    expect(focusA).toHaveBeenCalled();
    root.remove();
  });
});
