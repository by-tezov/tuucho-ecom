import { describe, expect, it } from 'vitest';
import { resolveMenuPlacement } from '@/utils/resolveMenuPlacement';

describe('resolveMenuPlacement', () => {
  it('keeps an explicit side', () => {
    expect(resolveMenuPlacement('above', { top: 10, bottom: 40 }, 800)).toBe('above');
    expect(resolveMenuPlacement('below', { top: 700, bottom: 740 }, 800)).toBe('below');
  });

  it('picks the side with more viewport room in auto mode', () => {
    // Near the bottom of the viewport → open above.
    expect(resolveMenuPlacement('auto', { top: 700, bottom: 740 }, 800)).toBe('above');
    // Near the top → open below.
    expect(resolveMenuPlacement('auto', { top: 40, bottom: 80 }, 800)).toBe('below');
  });

  it('prefers above when both sides are equal', () => {
    expect(resolveMenuPlacement('auto', { top: 390, bottom: 410 }, 800)).toBe('above');
  });
});
