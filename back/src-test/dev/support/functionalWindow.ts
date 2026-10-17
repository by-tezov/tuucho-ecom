export type FunctionalWindowPosition = { left: number; top: number };

/**
 * Origin on the display Chrome is attached to. The test runner reads the
 * operator value to place the nested display on the desktop, then gives Chrome
 * coordinates inside that display. A monitor left of the primary one may use
 * a negative X value.
 */
export function testWindowPosition(): FunctionalWindowPosition {
  const raw = process.env.PAM_TEST_WINDOW_POSITION ?? '0,0';
  const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(raw);
  if (!match) {
    throw new Error('PAM_TEST_WINDOW_POSITION must be two integer pixels, for example "1920,0".');
  }
  const left = Number(match[1]);
  const top = Number(match[2]);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(top)) {
    throw new Error('PAM_TEST_WINDOW_POSITION must contain safe integer pixel coordinates.');
  }
  return { left, top };
}

/** Outer `width,height` passed to Chrome for one lane. */
export function formatChromeOuterSize(surface: 'web' | 'mobile'): string {
  const size = functionalWindowSize(surface);
  return `${size.width},${size.windowHeight}`;
}

function chromeOuterSize(): { width: number; height: number } {
  const raw = process.env.PAM_TEST_CHROME_WINDOW;
  const match = raw ? /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(raw) : null;
  if (!match) return { width: FUNCTIONAL_WEB_WINDOW.width, height: FUNCTIONAL_WEB_WINDOW.height };
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Chrome flags that keep a headed window on `PAM_TEST_WINDOW_POSITION`.
 * GNOME Wayland otherwise picks the display under the pointer.
 * On the nested test display, GPU processes often paint nothing, so Chrome
 * draws through the nested server instead. */
export function functionalChromeArgs(): string[] {
  const { left, top } = testWindowPosition();
  const outer = chromeOuterSize();
  return [
    '--lang=fr-FR',
    `--window-size=${outer.width},${outer.height}`,
    `--window-position=${left},${top}`,
    '--ozone-platform=x11',
    '--disable-features=LocalNetworkAccessChecks,PasswordManagerEnabled',
    '--hide-crash-restore-bubble',
    '--disable-session-crashed-bubble',
    '--disable-blink-features=',
    '--disable-quic',
    ...(process.env.PAM_TEST_NESTED_DISPLAY === '1' ? ['--disable-gpu'] : []),
  ];
}

/** Outer size of the headed desktop window. The handset lane starts this many
 * pixels to the right when desktop and mobile run together. */
export const FUNCTIONAL_WEB_WINDOW = { width: 1280, height: 864 } as const;

export const FUNCTIONAL_MOBILE_WINDOW = { width: 390, height: 633 } as const;

export function functionalWindowSize(surface: 'web' | 'mobile'): {
  width: number;
  height: number;
  windowHeight: number;
} {
  const box = surface === 'mobile' ? FUNCTIONAL_MOBILE_WINDOW : FUNCTIONAL_WEB_WINDOW;
  const windowHeight =
    surface === 'mobile' ? box.height + 110 + Math.ceil(box.height * 0.05) : box.height;
  return { width: box.width, height: box.height, windowHeight };
}
