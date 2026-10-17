import { setTimeout as delay } from 'node:timers/promises';
import type { CDPSession, Frame, Locator, Page } from 'patchright/test';
import { expect } from 'patchright/test';

/**
 * Headed Chrome runs on the nested test display. Nothing here activates a
 * host window. The page is told it has focus so fields and payment frames
 * accept input while the operator keeps the keyboard.
 *
 * The emulation flag lives on the CDP session. Detaching that session turns
 * the flag off again, and a payment iframe then reports its focused field as
 * inactive. Sessions stay open for the life of the page.
 */
function headed(): boolean {
  return process.env.PAM_TEST_HEADLESS !== '1';
}

const focusSessions = new WeakMap<object, CDPSession>();

async function emulateTarget(page: Page, target: Page | Frame): Promise<void> {
  const existing = focusSessions.get(target);
  if (existing) {
    try {
      await existing.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      return;
    } catch {
      focusSessions.delete(target);
    }
  }
  try {
    const session = await page.context().newCDPSession(target);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    focusSessions.set(target, session);
  } catch {
    // The target can still be attaching, or already closing.
  }
}

/** The page reports itself focused so fields accept input without an OS raise. */
export async function emulateFocusedPage(page: Page): Promise<void> {
  if (!headed()) return;
  await emulateTarget(page, page);
  await Promise.all(page.frames().map((frame) => emulateTarget(page, frame)));
}

export function watchFocusedPage(page: Page): void {
  if (!headed()) return;
  const apply = () => {
    void emulateFocusedPage(page);
  };
  apply();
  page.on('frameattached', apply);
}

/** Callers share one place. The host window is not raised. */
export async function withTestWindowFocus<T>(_page: Page, action: () => Promise<T>): Promise<T> {
  return action();
}

async function elementIsFocused(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((node) => {
      const root = node.getRootNode() as { activeElement?: unknown };
      const active = root.activeElement ?? null;
      const doc = node.ownerDocument;
      return active === node && doc !== null && doc.hasFocus();
    })
    .catch(() => false);
}

/** Focus a field inside the page. Does not activate the Chrome window. */
export async function ensureOsFocused(locator: Locator): Promise<void> {
  const page = locator.page();
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    await emulateFocusedPage(page);
    await locator.focus();
    if (await elementIsFocused(locator)) return;
    await delay(80);
  }
  await expect(locator).toBeFocused({ timeout: 2_000 });
}
