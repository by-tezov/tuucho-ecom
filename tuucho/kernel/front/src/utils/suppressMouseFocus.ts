import type { MouseEvent } from 'react';

/** Stop mouse/touch from focusing the control. Chromium paints a blinking
 * text caret on focused checkboxes/radios (and opacity:0 overlays), which
 * looks broken in custom UI. Keyboard Tab still focuses normally. */
export function suppressMouseFocus(event: MouseEvent): void {
  event.preventDefault();
}
