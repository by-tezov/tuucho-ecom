/**
 * Noto Thai faces cover glyphs Cormorant/Manrope lack. Load only when the UI
 * language is Thai (same lazy-chunk idea as dictionaryCache.ts).
 */
let loading: Promise<void> | null = null;
let loaded = false;

export function loadThaiFonts(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = Promise.all([
      import('@fontsource/noto-serif-thai/thai-500.css'),
      import('@fontsource/noto-serif-thai/thai-600.css'),
      import('@fontsource/noto-serif-thai/thai-700.css'),
      import('@fontsource/noto-sans-thai/thai-400.css'),
      import('@fontsource/noto-sans-thai/thai-500.css'),
      import('@fontsource/noto-sans-thai/thai-600.css'),
      import('@fontsource/noto-sans-thai/thai-700.css'),
    ]).then(() => {
      loaded = true;
    });
  }
  return loading;
}
