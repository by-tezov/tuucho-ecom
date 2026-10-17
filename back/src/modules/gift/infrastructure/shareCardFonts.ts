import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { loadShareKitFont, withFallbackFont, type ShareKitFont } from './shareCardOutlineText.js';

const require = createRequire(import.meta.url);

export interface ShareCardFontSet {
  serif: ShareKitFont;
  serifItalic: ShareKitFont;
  sans: ShareKitFont;
  sansBold: ShareKitFont;
  script: ShareKitFont;
  cinzel: ShareKitFont;
}

const SPECS = {
  serif: '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff',
  serifItalic: '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-italic.woff',
  sans: '@fontsource/manrope/files/manrope-latin-700-normal.woff',
  sansBold: '@fontsource/manrope/files/manrope-latin-800-normal.woff',
  script: '@fontsource/pinyon-script/files/pinyon-script-latin-400-normal.woff',
  cinzel: '@fontsource/cinzel/files/cinzel-latin-600-normal.woff',
} as const;

/** The faces above are Latin-only: Thai text on a card (a Thai giver's
 * message, the Thai "use before" date) is drawn in Noto Thai, serif or sans
 * to match, the same families the front uses for Thai. */
const THAI_SPECS = {
  serif: '@fontsource/noto-serif-thai/files/noto-serif-thai-thai-600-normal.woff',
  sans: '@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff',
  sansBold: '@fontsource/noto-sans-thai/files/noto-sans-thai-thai-800-normal.woff',
} as const;

/** Noto Sans Thai for the PDF's own text (the print hint), next to Helvetica. */
export const SHARE_CARD_THAI_TEXT_FONT =
  '@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff';

const resolvedFontPaths = new Map<string, string>();
let cachedFonts: ShareCardFontSet | null = null;

export function resolveFont(spec: string): string {
  const cached = resolvedFontPaths.get(spec);
  if (cached) return cached;
  try {
    const path = require.resolve(spec);
    if (existsSync(path)) {
      resolvedFontPaths.set(spec, path);
      return path;
    }
  } catch {
    // fall through
  }
  throw new Error(`share-card font missing: ${spec}`);
}

export function loadShareCardFonts(): ShareCardFontSet {
  if (cachedFonts) return cachedFonts;
  const load = (spec: string, thaiSpec: string) =>
    withFallbackFont(loadShareKitFont(resolveFont(spec)), loadShareKitFont(resolveFont(thaiSpec)));
  cachedFonts = {
    serif: load(SPECS.serif, THAI_SPECS.serif),
    serifItalic: load(SPECS.serifItalic, THAI_SPECS.serif),
    sans: load(SPECS.sans, THAI_SPECS.sans),
    sansBold: load(SPECS.sansBold, THAI_SPECS.sansBold),
    script: load(SPECS.script, THAI_SPECS.serif),
    cinzel: load(SPECS.cinzel, THAI_SPECS.serif),
  };
  return cachedFonts;
}
