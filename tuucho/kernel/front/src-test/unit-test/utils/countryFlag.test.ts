import { describe, expect, it } from 'vitest';
import { toFlagEmoji } from '@/utils/countryFlag';

describe('toFlagEmoji', () => {
  it('converts ISO alpha-2 codes and rejects anything else', () => {
    expect(toFlagEmoji('fr')).toBe('🇫🇷');
    expect(toFlagEmoji(' BE ')).toBe('🇧🇪');
    expect(toFlagEmoji('FRA')).toBeNull();
    expect(toFlagEmoji('F1')).toBeNull();
    expect(toFlagEmoji(null)).toBeNull();
  });
});
