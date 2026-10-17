import { describe, expect, it } from 'vitest';
import { en } from '@/assets/i18n/strings.en';
import { isRuntimeDictionary } from '@/assets/i18n/dictionaryCache';

describe('isRuntimeDictionary', () => {
  it('accepts the live English module', () => {
    expect(isRuntimeDictionary(en)).toBe(true);
  });

  it('rejects a JSON-cloned dictionary that lost function formatters', () => {
    const prerendered = JSON.parse(JSON.stringify(en)) as typeof en;
    expect(typeof prerendered.onboarding.stepAria).toBe('undefined');
    expect(isRuntimeDictionary(prerendered)).toBe(false);
  });
});
