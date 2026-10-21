import {
  useCallback,
  useRef,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  captured: boolean;
};

/**
 * Adds desktop press-drag scrolling to a native horizontal scroller without
 * interfering with its touch scrolling or the links/buttons inside it.
 *
 * React handlers are returned instead of attaching listeners in an effect:
 * data-backed carousels often render no track until their first request has
 * settled, so render-bound handlers cannot miss a track that mounts later.
 */
export function useHorizontalDragScroll<T extends HTMLElement>() {
  const dragStateRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return;
    justDraggedRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      captured: false,
    };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const delta = event.clientX - state.startX;
    if (!state.captured) {
      // Capturing a stationary click would retarget it to the track and make
      // cards/buttons stop working, so wait for a deliberate horizontal drag.
      if (Math.abs(delta) <= 4) return;
      state.captured = true;
      justDraggedRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    event.currentTarget.scrollLeft = state.startScrollLeft - delta;
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<T>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (state.captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onLostPointerCapture = useCallback((event: ReactPointerEvent<T>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) dragStateRef.current = null;
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent<T>) => {
    if (!justDraggedRef.current) return;
    justDraggedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onDragStart = useCallback((event: ReactDragEvent<T>) => event.preventDefault(), []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onLostPointerCapture,
    onClickCapture,
    onDragStart,
  };
}
