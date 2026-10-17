import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

interface IosSheetTouchOptions {
  /** Only on iOS (see isIosTouchDevice in useLightboxSheet). */
  enabled: boolean;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  mobileCollapseRef: MutableRefObject<boolean>;
  sheetExpandedRef: MutableRefObject<boolean>;
  /** useLightboxSheet's one-step sheet driver (grow/shrink + content scroll). */
  driveSheet: (deltaY: number) => void;
}

/** The iOS-only Touch Events path of the product sheet, split out of
 * useLightboxSheet for size; behaviour unchanged. */
export function useIosSheetTouch({
  enabled,
  scrollAreaRef,
  mobileCollapseRef,
  sheetExpandedRef,
  driveSheet,
}: IosSheetTouchOptions) {
  const iosSheetDragRef = useRef<{ touchId: number; lastY: number; ownsSheet: boolean } | null>(null);

  // iOS Safari occasionally hands a drag on this transformed sheet to the
  // document before React's Pointer Events capture has a chance to own it.
  // Use direct, non-passive touch listeners there so `preventDefault` reaches
  // Safari in time. They are intentionally absent from Android: keeping its
  // expanded product body entirely native is what keeps that scroll smooth.
  useEffect(() => {
    if (!enabled) return;
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    const activeScrollArea = scrollArea;

    function touchWithId(touches: TouchList, touchId: number) {
      for (let i = 0; i < touches.length; i += 1) {
        const touch = touches[i];
        if (touch?.identifier === touchId) return touch;
      }
      return null;
    }

    function clearTouchDrag() {
      iosSheetDragRef.current = null;
    }

    function onTouchStart(event: TouchEvent) {
      if (!mobileCollapseRef.current || event.touches.length !== 1) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('a, button, input, select, textarea, [role="button"]')
      ) {
        return;
      }
      // The expanded body remains a normal native scroller except for a
      // downward pull from its own top edge, which is the collapse gesture —
      // tracked from any start point, so a touch that scrolls back to the top
      // can carry on into it.
      const touch = event.touches[0];
      if (!touch) return;
      // A drag that begins with the panel collapsed keeps control for its
      // entire lifetime. That is what lets one finger reach the grow limit
      // then immediately reverse and shrink the panel again.
      iosSheetDragRef.current = {
        touchId: touch.identifier,
        lastY: touch.clientY,
        ownsSheet: !sheetExpandedRef.current,
      };
    }

    function onTouchMove(event: TouchEvent) {
      const drag = iosSheetDragRef.current;
      if (!drag || !mobileCollapseRef.current || event.touches.length !== 1) return;
      const touch = touchWithId(event.touches, drag.touchId);
      if (!touch) {
        clearTouchDrag();
        return;
      }
      const deltaY = drag.lastY - touch.clientY;
      drag.lastY = touch.clientY;
      if (deltaY === 0) return;

      // A gesture which begins on an already-open body still gets native
      // scrolling. Once it has become a downward top-edge pull, or began on
      // the collapsed sheet, it stays a sheet gesture until touchend.
      // Not the sheet's yet: native scroll, until this same touch pulls down
      // with the content at its top.
      if (!drag.ownsSheet && (deltaY > 0 || activeScrollArea.scrollTop > 1)) return;
      drag.ownsSheet = true;

      if (event.cancelable) event.preventDefault();
      driveSheet(deltaY);
    }

    activeScrollArea.addEventListener('touchstart', onTouchStart, { passive: true });
    activeScrollArea.addEventListener('touchmove', onTouchMove, { passive: false });
    activeScrollArea.addEventListener('touchend', clearTouchDrag);
    activeScrollArea.addEventListener('touchcancel', clearTouchDrag);
    return () => {
      activeScrollArea.removeEventListener('touchstart', onTouchStart);
      activeScrollArea.removeEventListener('touchmove', onTouchMove);
      activeScrollArea.removeEventListener('touchend', clearTouchDrag);
      activeScrollArea.removeEventListener('touchcancel', clearTouchDrag);
      clearTouchDrag();
    };
    // Gesture state and geometry are held in refs so this is installed once,
    // rather than being rebound as the panel transforms every frame.
  }, [driveSheet, enabled, mobileCollapseRef, scrollAreaRef, sheetExpandedRef]);
}
