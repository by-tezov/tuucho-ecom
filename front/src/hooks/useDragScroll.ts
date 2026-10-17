import { useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';

export interface DragScrollOptions {
  /** Targets matching this selector keep their own pointer path. */
  ignore?: string;
  /** Cancel text drag-selection on press (default). Off where text must stay selectable. */
  preventSelection?: boolean;
  enabled?: boolean;
}

/**
 * Mouse press-drag scrolling for hidden-scrollbar panels (docs/theming.md).
 * Under 4px it is still a click; past it the pointer is captured, and the
 * first trusted click after a drag is swallowed so a drag ending over a button
 * or label does not activate it. Spread the result on the scroll element.
 */
export function useDragScroll<T extends HTMLElement>(options: DragScrollOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const dragRef = useRef<{ startY: number; startScrollTop: number; captured: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  return useMemo(() => {
    const end = (e: PointerEvent<T>) => {
      if (dragRef.current?.captured && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
    };
    return {
      onPointerDown(e: PointerEvent<T>) {
        const { ignore, preventSelection = true, enabled = true } = optionsRef.current;
        if (!enabled || e.pointerType !== 'mouse') return;
        if (ignore && e.target instanceof Element && e.target.closest(ignore)) return;
        if (preventSelection) e.preventDefault();
        justDraggedRef.current = false;
        dragRef.current = { startY: e.clientY, startScrollTop: e.currentTarget.scrollTop, captured: false };
      },
      onPointerMove(e: PointerEvent<T>) {
        const drag = dragRef.current;
        if (!drag || optionsRef.current.enabled === false) return;
        const delta = e.clientY - drag.startY;
        if (!drag.captured) {
          if (Math.abs(delta) <= 4) return;
          drag.captured = justDraggedRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        e.currentTarget.scrollTop = drag.startScrollTop - delta;
      },
      onPointerUp: end,
      onPointerCancel: end,
      onPointerLeave: end,
      onClickCapture(e: MouseEvent<T>) {
        if (!e.isTrusted || !justDraggedRef.current) return;
        justDraggedRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    };
  }, []);
}
