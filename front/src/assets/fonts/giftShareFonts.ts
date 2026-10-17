/**
 * Pinyon Script / Cinzel are only used on gift share cards. Keep them off the
 * main entry critical path; the share-card chunk pulls them in on first use.
 */
let loading: Promise<void> | null = null;

export function loadGiftShareFonts(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      import('@fontsource/pinyon-script/latin-400.css'),
      import('@fontsource/cinzel/latin-500.css'),
      import('@fontsource/cinzel/latin-600.css'),
    ]).then(() => undefined);
  }
  return loading;
}
