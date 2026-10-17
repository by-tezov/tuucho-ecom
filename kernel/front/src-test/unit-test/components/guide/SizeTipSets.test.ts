import { describe, expect, it } from 'vitest';
import { tipForMm } from '@/components/guide/SizeTipSets';
import { sizeSets } from '@/data/sizeSets';

describe('size sets as tip numbers', () => {
  it('maps every standard width to its chart tip, thumb to little finger', () => {
    expect(sizeSets.find((set) => set.key === 'XS')?.mm.map(tipForMm)).toEqual(['3', '6', '5', '7', '9']);
    for (const set of sizeSets) expect(set.mm.map(tipForMm)).not.toContain('?');
    expect(tipForMm(99)).toBe('?');
  });
});
