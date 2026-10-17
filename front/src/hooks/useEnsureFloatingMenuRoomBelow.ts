import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import {
  ensureFloatingMenuRoomBelow,
  measureFloatingMenuOverflowAbove,
} from '../utils/ensureFloatingMenuRoomBelow';

/** Once per open: make room for the floating list.
 *  - `below` (desktop): scroll the nearest scrollport so the list fits under.
 *  - `above` (mobile zoom): always call `onNeedRoomAbove` so the lightbox can
 *    snap the product sheet back to origin (full photo); overflow px is still
 *    passed for callers that want a partial adjust. */
export function useEnsureFloatingMenuRoomBelow(
  open: boolean,
  menuPlacement: 'above' | 'below',
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  anchorRect: DOMRect | null,
  onNeedRoomAbove?: ((overflowPx: number) => void) | undefined,
): void {
  const didScrollRef = useRef(false);

  useEffect(() => {
    if (!open) didScrollRef.current = false;
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchorRect || didScrollRef.current) return;
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    if (menuPlacement === 'below') {
      ensureFloatingMenuRoomBelow(anchor, menu);
      didScrollRef.current = true;
      return;
    }

    if (menuPlacement === 'above' && onNeedRoomAbove) {
      onNeedRoomAbove(measureFloatingMenuOverflowAbove(anchor, menu));
      didScrollRef.current = true;
    }
  }, [open, menuPlacement, anchorRect, anchorRef, menuRef, onNeedRoomAbove]);
}
