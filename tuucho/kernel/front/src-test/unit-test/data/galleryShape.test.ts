import { describe, expect, it } from 'vitest';
import { lengthAfterShapeChange } from '@/data/galleryShape';

const item = {
  lengthsByShape: {
    almond: { medium: 'moyen', short: 'court' },
    coffin: { medium: 'moyen', short: 'court', long: 'long' },
    oval: { medium: 'moyen' },
  },
};

describe('lengthAfterShapeChange', () => {
  it('keeps the chosen length when the new shape is offered in it', () => {
    expect(lengthAfterShapeChange(item, 'coffin', 'short')).toBe('short');
  });

  it("falls back to the new shape's default when it is not", () => {
    expect(lengthAfterShapeChange(item, 'oval', 'short')).toBe('medium');
    expect(lengthAfterShapeChange(item, 'almond', 'long')).toBe('medium');
  });
});
