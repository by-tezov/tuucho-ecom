import { useEffect, useState } from 'react';
import type { Labels } from 'react-phone-number-input';
import en from 'react-phone-number-input/locale/en';
import { useLang } from '../assets/i18n';
import type { Lang } from '../assets/i18n/types';

/** react-phone-number-input's own country names, one small chunk per locale
 * (English is already inside the library, it is its default). Extra language
 * codes fall back to English until a matching locale chunk is registered. */
const LOADERS: Partial<Record<string, () => Promise<{ default: Labels }>>> = {
  fr: () => import('react-phone-number-input/locale/fr'),
  en: () => Promise.resolve({ default: en }),
};

const loaded = new Map<Lang, Labels>([['en', en]]);

/** `labels` for PhoneInput in the page language. Without it the country
 * `<select>` keeps the library's English name ("Phone number country") and
 * English country names inside a French page (RGAA 8.7, 11.2). The select's
 * own name comes from our copy; English names show only while the locale
 * chunk loads. */
export function usePhoneInputLabels(): Labels {
  const { lang, t } = useLang();
  const [labels, setLabels] = useState<Labels>(() => loaded.get(lang) ?? en);

  useEffect(() => {
    const ready = loaded.get(lang);
    if (ready) {
      setLabels(ready);
      return;
    }
    const load = LOADERS[lang] ?? LOADERS.en;
    if (!load) return;
    let cancelled = false;
    void load()
      .then((module) => {
        loaded.set(lang, module.default);
        if (!cancelled) setLabels(module.default);
      })
      .catch(() => {
        // Keep the English names; the select's own label is still localized.
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return { ...labels, country: t.address.phoneCountryLabel };
}
