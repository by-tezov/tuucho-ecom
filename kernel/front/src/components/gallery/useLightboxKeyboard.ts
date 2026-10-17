import { useEffect, type RefObject } from 'react';
import { isTopmostTrap } from '../../hooks/useFocusTrap';
import { KEY_PAN_STEP, KEY_ZOOM_STEP, type useLightboxGestures } from '../../hooks/useLightboxGestures';

type LightboxZoom = Pick<ReturnType<typeof useLightboxGestures>, 'scale' | 'zoomBy' | 'panBy' | 'resetZoom'>;

interface LightboxPhotos {
  multi: boolean;
  count: number;
  index: number;
  onIndexChange: (next: number) => void;
}

/** The product lightbox's keyboard: arrows change photo, or pan while zoomed;
 * + / - / 0 zoom in, out and back (RGAA 7.3, the alternative to pinch, wheel
 * and drag). Single-key shortcuts act only while focus is inside the dialog
 * and not in a field or option list (RGAA 12.10). */
export function useLightboxKeyboard(
  dialogRef: RefObject<HTMLElement | null>,
  { scale, zoomBy, panBy, resetZoom }: LightboxZoom,
  { multi, count, index, onIndexChange }: LightboxPhotos,
): void {
  const isZoomed = scale > 1;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // A dialog opened over the zoom (size request, add-to-cart) owns the
      // keyboard: its arrow keys must not turn the photo behind it.
      if (!isTopmostTrap(dialogRef.current)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const inDialog = target != null && dialogRef.current?.contains(target) === true;
      const inField = target?.closest('input, textarea, select, [role="listbox"], [role="option"]') != null;
      if (inDialog && !inField && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const zoomAction =
          e.key === '+' || e.key === '='
            ? () => zoomBy(KEY_ZOOM_STEP)
            : e.key === '-' || e.key === '_'
              ? () => zoomBy(1 / KEY_ZOOM_STEP)
              : e.key === '0'
                ? resetZoom
                : null;
        const pan: Record<string, [number, number]> = {
          ArrowLeft: [KEY_PAN_STEP, 0],
          ArrowRight: [-KEY_PAN_STEP, 0],
          ArrowUp: [0, KEY_PAN_STEP],
          ArrowDown: [0, -KEY_PAN_STEP],
        };
        const step = isZoomed ? pan[e.key] : undefined;
        if (zoomAction || step) {
          e.preventDefault();
          if (zoomAction) zoomAction();
          else if (step) panBy(step[0], step[1]);
          return;
        }
      }
      if (multi && e.key === 'ArrowLeft') onIndexChange(Math.max(0, index - 1));
      if (multi && e.key === 'ArrowRight') onIndexChange(Math.min(count - 1, index + 1));
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogRef, multi, count, index, onIndexChange, isZoomed, zoomBy, panBy, resetZoom]);
}
