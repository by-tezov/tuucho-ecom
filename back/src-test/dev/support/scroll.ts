import type { Page } from 'patchright/test';
import { prepareHumanPointer, reveal } from './interact.js';

/** Scroll the document to the bottom (smoke / long content pages). */
export async function scrollToBottom(page: Page): Promise<void> {
  await prepareHumanPointer(page);
  await page.evaluate(async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.85));
    let y = window.scrollY;
    let guard = 0;
    while (guard < 80) {
      const max = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      const next = Math.min(y + step, max);
      if (next <= y + 1) break;
      y = next;
      window.scrollTo({ top: y, behavior: 'instant' });
      await delay(40);
      guard += 1;
    }
    window.scrollTo({
      top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      behavior: 'instant',
    });
  });
}

/** Scroll the virtualized gallery from the first row to the bottom.
 * Card nodes are recycled, so a saved index is not a stable target. */
export async function scrollGalleryCards(page: Page, cardTestId: string): Promise<void> {
  const cards = page.getByTestId(cardTestId);
  await reveal(cards.first());
  await scrollToBottom(page);
}
