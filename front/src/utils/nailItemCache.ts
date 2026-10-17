import type { GalleryItem } from '../data/types';

/**
 * Every single-nail catalogue entry this tab has fetched, per language, by
 * product id.
 *
 * A guest cart stores only ids plus shape, length and finger, so each time
 * it is rebuilt (after any write, on every refresh) the nail titles, photos
 * and prices have to come from somewhere. Keyed by language because titles
 * and labels are localized: a language switch must not show the previous
 * one's copy. Memory-only like state/productCache.ts, so a reload is the
 * refresh point. Filled by the API layer (api/gallery.ts), never by a
 * component, so it is always the latest server copy.
 */
const itemsByLang = new Map<string, Map<string, GalleryItem>>();

export function rememberNailItems(items: readonly GalleryItem[], lang: string): void {
  let byId = itemsByLang.get(lang);
  if (!byId) itemsByLang.set(lang, (byId = new Map()));
  for (const item of items) byId.set(item.id, item);
}

export function cachedNailItem(id: string, lang: string): GalleryItem | undefined {
  return itemsByLang.get(lang)?.get(id);
}
