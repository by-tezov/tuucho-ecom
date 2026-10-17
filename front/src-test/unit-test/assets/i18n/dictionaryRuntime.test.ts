import { describe, expect, it } from 'vitest';
import { fr } from '../../../../src/assets/i18n/strings.fr';
import { isRuntimeDictionary } from '../../../../src/assets/i18n/dictionaryCache';

describe('isRuntimeDictionary', () => {
  it('accepts the live French module', () => {
    expect(isRuntimeDictionary(fr)).toBe(true);
  });

  it('rejects a JSON-cloned dictionary that lost function formatters', () => {
    const prerendered = JSON.parse(JSON.stringify(fr)) as typeof fr;
    expect(typeof prerendered.onboarding.stepAria).toBe('undefined');
    expect(isRuntimeDictionary(prerendered)).toBe(false);
  });
});
