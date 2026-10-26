import { beforeAll, describe, expect, it } from 'vitest';
import { isRuntimeDictionary } from '@/assets/i18n/dictionaryCache';
import { assembleDictionary, ensureLocaleCatalogsLoaded } from '@/plugins/localeCatalog';
import type { Strings } from '@/assets/i18n/types';

describe('isRuntimeDictionary', () => {
  let en: Strings;

  beforeAll(async () => {
    await ensureLocaleCatalogsLoaded();
    en = assembleDictionary('en', 'all');
  });

  it('accepts the live English locale pack', () => {
    expect(isRuntimeDictionary(en)).toBe(true);
  });

  it('rejects a JSON-cloned dictionary that lost function formatters', () => {
    const prerendered = JSON.parse(JSON.stringify(en)) as typeof en;
    expect(typeof prerendered.onboarding.stepAria).toBe('undefined');
    expect(isRuntimeDictionary(prerendered)).toBe(false);
  });
});
