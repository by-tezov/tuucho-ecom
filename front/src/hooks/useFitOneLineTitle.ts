import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Titles never shrink below this to fit one line: past it they wrap. */
const DEFAULT_MIN_PX = 14;
const DEFAULT_MAX_PX = 18;

let measureCanvas: HTMLCanvasElement | null = null;

function measureTextWidth(text: string, fontWeight: string, fontSizePx: number, fontFamily: string): number {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

function measureWithTracking(
  text: string,
  fontWeight: string,
  fontSizePx: number,
  fontFamily: string,
  letterSpacing: number,
): number {
  if (!text) return 0;
  return (
    measureTextWidth(text, fontWeight, fontSizePx, fontFamily) + letterSpacing * Math.max(0, text.length - 1)
  );
}

/** Largest prefix of `text` that fits in `available` (at least 1 char when possible). */
function fitPrefixLength(
  text: string,
  fontWeight: string,
  fontSizePx: number,
  fontFamily: string,
  letterSpacing: number,
  available: number,
): number {
  if (!text) return 0;
  if (measureWithTracking(text, fontWeight, fontSizePx, fontFamily, letterSpacing) <= available + 0.5) {
    return text.length;
  }
  let lo = 1;
  let hi = text.length;
  let fit = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const width = measureWithTracking(text.slice(0, mid), fontWeight, fontSizePx, fontFamily, letterSpacing);
    if (width <= available + 0.5) {
      fit = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return fit;
}

/**
 * Approximate CSS `white-space: normal` + `overflow-wrap: break-word` line count
 * using canvas metrics (no live layout mutation).
 */
function countWrappedLines(
  text: string,
  fontWeight: string,
  fontSizePx: number,
  fontFamily: string,
  available: number,
  letterSpacing: number,
): number {
  const sample = text.trim();
  if (!sample) return 1;

  const words = sample.split(/\s+/);
  const spaceWidth = measureWithTracking(' ', fontWeight, fontSizePx, fontFamily, letterSpacing);
  let lines = 1;
  let lineWidth = 0;

  for (const word of words) {
    let remaining = word;
    while (remaining.length > 0) {
      const wordWidth = measureWithTracking(remaining, fontWeight, fontSizePx, fontFamily, letterSpacing);

      if (lineWidth === 0) {
        if (wordWidth <= available + 0.5) {
          lineWidth = wordWidth;
          remaining = '';
          continue;
        }
        // Word longer than the line: break-word across lines.
        const fit = fitPrefixLength(remaining, fontWeight, fontSizePx, fontFamily, letterSpacing, available);
        const placed = remaining.slice(0, fit);
        remaining = remaining.slice(fit);
        if (remaining.length > 0) {
          lines += 1;
          lineWidth = 0;
        } else {
          lineWidth = measureWithTracking(placed, fontWeight, fontSizePx, fontFamily, letterSpacing);
        }
        continue;
      }

      if (lineWidth + spaceWidth + wordWidth <= available + 0.5) {
        lineWidth += spaceWidth + wordWidth;
        remaining = '';
        continue;
      }

      // Wrap before this word; retry at the start of the next line.
      lines += 1;
      lineWidth = 0;
    }
  }

  return lines;
}

function textFits(
  text: string,
  fontWeight: string,
  fontSizePx: number,
  fontFamily: string,
  available: number,
  letterSpacing: number,
  maxLines: number,
): boolean {
  if (maxLines <= 1) {
    return measureWithTracking(text, fontWeight, fontSizePx, fontFamily, letterSpacing) <= available + 0.5;
  }
  return countWrappedLines(text, fontWeight, fontSizePx, fontFamily, available, letterSpacing) <= maxLines;
}

export type FitTitleOptions = {
  /** When set, fitting runs only while the query matches; otherwise always. */
  mediaQuery?: string;
  minFont?: number;
  maxFont?: number;
  /** Soft line budget before the title is allowed to wrap freely. */
  maxLines?: number;
};

/**
 * Pick the largest font size in [minFont, maxFont] that still keeps the title
 * within `maxLines` (default 1). If even minFont overflows (a long title, a
 * zoomed page, user text spacing), the title goes back to its stylesheet size
 * and wraps instead: it is never cut with an ellipsis, since hidden text is
 * lost information (RGAA 10.4 resize, 10.12 text spacing).
 *
 * Measures against the width-constraining ancestor (not the title's own
 * clientWidth) — a shrink-to-fit / auto-sized title reports a box as wide
 * as its text, so the binary search would never shrink and you'd get a big
 * title with ellipsis instead.
 *
 * Uses canvas text metrics (not live layout mutation) so ResizeObserver
 * doesn't see width:max-content probes and oscillate between shrink and
 * ellipsis while the viewport is resized.
 */
export function useFitTitle(
  titleRef: RefObject<HTMLElement | null>,
  text: string,
  { mediaQuery, minFont = DEFAULT_MIN_PX, maxFont = DEFAULT_MAX_PX, maxLines = 1 }: FitTitleOptions = {},
) {
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    let observeTarget: HTMLElement = (el.parentElement as HTMLElement | null) ?? el;
    // display:contents wrappers have no layout box — ResizeObserver / width
    // need a real box (e.g. CartLine's .lineTitleRow → .lineBody).
    while (observeTarget !== document.body && getComputedStyle(observeTarget).display === 'contents') {
      observeTarget = (observeTarget.parentElement as HTMLElement | null) ?? el;
    }

    const contentWidth = (box: HTMLElement) => {
      const cs = getComputedStyle(box);
      return box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    };

    let raf = 0;
    let lastApplied = '';
    /** Width at which real layout overflowed a size the canvas said fits
     * (user word-spacing, say). Wrapping sticks at that width; re-fitting
     * there would only flip back and forth with every resize callback. */
    let layoutWrapWidth: number | null = null;

    /** The title's inline overrides. A fitted size keeps one line with the
     * ellipsis as last resort; `wrap` puts the font back to the stylesheet's
     * size with free wrapping and nothing clipped; `''` clears them all. */
    const setInline = (fontSize: string, wrap = false) => {
      Object.assign(el.style, {
        fontSize,
        textOverflow: wrap ? 'clip' : fontSize && 'ellipsis',
        whiteSpace: wrap ? 'normal' : '',
        overflow: wrap ? 'visible' : '',
        overflowWrap: wrap ? 'anywhere' : '',
      });
    };

    const fitTitle = () => {
      if (mediaQuery && !window.matchMedia(mediaQuery).matches) {
        layoutWrapWidth = null;
        if (lastApplied !== '') {
          setInline('');
          lastApplied = '';
        }
        return;
      }

      // Ancestor content box, minus the title's own horizontal padding
      // (e.g. cart mobile trash clearance on .lineTitle / CartSwitcher .tileName).
      const elCs = getComputedStyle(el);
      const available =
        contentWidth(observeTarget) -
        (parseFloat(elCs.paddingLeft) || 0) -
        (parseFloat(elCs.paddingRight) || 0);
      if (available <= 0) return;

      const sample = text || el.textContent || '';
      const weight = elCs.fontWeight || '700';
      const family = elCs.fontFamily || 'sans-serif';
      const tracking = parseFloat(elCs.letterSpacing) || 0;

      if (layoutWrapWidth !== null && Math.abs(layoutWrapWidth - available) < 1) return;
      layoutWrapWidth = null;

      if (!textFits(sample, weight, minFont, family, available, tracking, maxLines)) {
        if (lastApplied === 'wrap') return;
        lastApplied = 'wrap';
        setInline('', true);
        return;
      }

      let low = minFont;
      let high = maxFont;
      let best = minFont;
      while (high - low > 0.25) {
        const mid = (low + high) / 2;
        if (textFits(sample, weight, mid, family, available, tracking, maxLines)) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }

      const next = `${best}px`;
      if (next === lastApplied) return;
      lastApplied = next;
      setInline(next);
      // Canvas metrics ignore user word-spacing overrides: if the laid-out
      // text still overflows, wrap rather than clip it.
      if (el.scrollWidth > el.clientWidth + 1) {
        lastApplied = 'wrap';
        layoutWrapWidth = available;
        setInline('', true);
      }
    };

    const scheduleFit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitTitle);
    };

    fitTitle();
    void document.fonts?.ready.then(scheduleFit);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleFit) : null;
    ro?.observe(observeTarget);
    window.addEventListener('resize', scheduleFit);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', scheduleFit);
      setInline('');
    };
  }, [titleRef, text, mediaQuery, minFont, maxFont, maxLines]);
}

/**
 * Mobile-only one-line fit — thin wrapper over {@link useFitTitle}.
 * Gallery / cart line / orders keep calling this unchanged.
 */
export function useFitOneLineTitle(
  titleRef: RefObject<HTMLElement | null>,
  text: string,
  mediaQuery: string,
  minPx = DEFAULT_MIN_PX,
  maxPx = DEFAULT_MAX_PX,
) {
  useFitTitle(titleRef, text, {
    mediaQuery,
    minFont: minPx,
    maxFont: maxPx,
    maxLines: 1,
  });
}

/** Label width at `fontSizePx`, plus border and margin. Horizontal padding is separate. */
function entryCoreWidth(el: HTMLElement, fontSizePx: number): number {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const cs = getComputedStyle(el);
  const margin = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
  const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  if (!text) return el.offsetWidth + margin;
  const family = cs.fontFamily || 'sans-serif';
  const weight = cs.fontWeight || '500';
  const tracking = parseFloat(cs.letterSpacing) || 0;
  let width = 0;
  let parts = 0;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.textContent ?? '').trim();
      if (!value) continue;
      width += measureWithTracking(value, weight, fontSizePx, family, tracking);
      parts += 1;
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const value = (node.textContent ?? '').trim();
    if (!value) continue;
    const child = getComputedStyle(node);
    const childSize = parseFloat(child.fontSize) || fontSizePx;
    width += measureWithTracking(
      value,
      child.fontWeight || weight,
      childSize,
      child.fontFamily || family,
      parseFloat(child.letterSpacing) || 0,
    );
    parts += 1;
  }
  const gap = parseFloat(cs.columnGap || cs.gap) || 0;
  if (parts > 1 && gap > 0) width += gap * (parts - 1);
  return width + border + margin;
}

export type FitGroupOptions = {
  mediaQuery?: string;
  minFont?: number;
  maxFont?: number;
  /** Horizontal padding per side. Shrinks before the font does. */
  minPad?: number;
  maxPad?: number;
  /** Entries to scale together. Defaults to `[data-nav-fit]`. */
  itemSelector?: string;
  /**
   * Expanded row, measured even when the rendered menu has already collapsed
   * some entries. `onTight` stays true until this row fits at `minFont`.
   */
  tightProbe?: {
    enabled: boolean;
    entries: Array<{ text: string; dropdown?: boolean; bordered?: boolean; weight?: string }>;
    onTight: (tight: boolean) => void;
  };
};

/**
 * Shared font size and horizontal padding for a row of labels.
 * Padding tracks the menu slot: full spacing when the header bar is at its
 * max width, then a continuous drop toward `minPad` as that slot narrows.
 * The font stays at `maxFont` until padding is already at its floor.
 * Canvas metrics, so the row's own width never feeds the next measurement.
 */
export function useFitGroupFont(
  containerRef: RefObject<HTMLElement | null>,
  textKey: string,
  {
    mediaQuery,
    minFont = DEFAULT_MIN_PX,
    maxFont = DEFAULT_MAX_PX,
    minPad = 2,
    maxPad = 12,
    itemSelector = '[data-nav-fit]',
    tightProbe,
  }: FitGroupOptions = {},
) {
  const tightProbeRef = useRef(tightProbe);
  tightProbeRef.current = tightProbe;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf = 0;
    let lastApplied = '';

    const clear = (items: HTMLElement[]) => {
      container.style.removeProperty('--nav-font');
      container.style.removeProperty('--nav-pad');
      for (const el of items) {
        el.style.fontSize = '';
        el.style.paddingLeft = '';
        el.style.paddingRight = '';
      }
      lastApplied = '';
    };

    const fit = () => {
      const items = [...container.querySelectorAll<HTMLElement>(itemSelector)];
      if (mediaQuery && !window.matchMedia(mediaQuery).matches) {
        if (lastApplied !== '') clear(items);
        tightProbeRef.current?.onTight(false);
        return;
      }
      const cs = getComputedStyle(container);
      const available =
        container.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (available <= 0 || items.length === 0) return;

      const count = items.length;
      const sample = items[0];
      const sampleCs = sample ? getComputedStyle(sample) : null;
      const dot = container.querySelector<HTMLElement>('[data-nav-dot]');
      const dotWidth = dot ? parseFloat(getComputedStyle(dot, '::before').width) || 0 : 0;
      // One space glyph of clear room on each side of the dot, plus half the
      // dot so the mark itself does not eat that space.
      const padFloor = (font: number) => {
        const space = sampleCs
          ? measureWithTracking(
              ' ',
              sampleCs.fontWeight || '500',
              font,
              sampleCs.fontFamily || 'sans-serif',
              parseFloat(sampleCs.letterSpacing) || 0,
            )
          : 0;
        return Math.max(minPad, space + dotWidth / 2);
      };
      const coreAt = (font: number) => items.reduce((sum, el) => sum + entryCoreWidth(el, font), 0);
      const coreMax = coreAt(maxFont);
      const floorMax = Math.min(maxPad, padFloor(maxFont));
      // Width of the menu slot when the header bar is at its widest.
      // Below that, padding falls in a straight line as the slot narrows.
      const header = container.closest('header');
      const barMax = parseFloat(getComputedStyle(header ?? container).getPropertyValue('--header-bar')) || 0;
      const innerWidth = container.parentElement?.clientWidth ?? available;
      const wide = Math.max(available, barMax > 0 ? barMax - innerWidth + available : available);
      const tight = coreMax + floorMax * 2 * count;

      let font = maxFont;
      let pad = maxPad;
      if (available <= tight) {
        let low = minFont;
        let high = maxFont;
        font = minFont;
        while (high - low > 0.25) {
          const mid = (low + high) / 2;
          const floor = Math.min(maxPad, padFloor(mid));
          if (coreAt(mid) + floor * 2 * count <= available + 0.5) {
            font = mid;
            low = mid;
          } else {
            high = mid;
          }
        }
        pad = Math.min(maxPad, padFloor(font));
      } else if (wide > tight) {
        const t = Math.min(1, Math.max(0, (available - tight) / (wide - tight)));
        pad = floorMax + (maxPad - floorMax) * t;
      }

      const probe = tightProbeRef.current;
      if (probe && sampleCs) {
        const floor = Math.min(maxPad, padFloor(minFont));
        const family = sampleCs.fontFamily || 'sans-serif';
        const tracking = parseFloat(sampleCs.letterSpacing) || 0;
        const caret = container.querySelector<HTMLElement>('[data-nav-caret]');
        const caretCs = caret ? getComputedStyle(caret) : null;
        const caretParentCs = caret?.parentElement ? getComputedStyle(caret.parentElement) : null;
        const caretSize = caretCs ? parseFloat(caretCs.fontSize) || 20 : 20;
        const caretGap =
          (caretParentCs ? parseFloat(caretParentCs.columnGap) || parseFloat(caretParentCs.gap) || 0 : 0) +
          (caretCs ? parseFloat(caretCs.marginLeft) || 0 : 0);
        let core = 0;
        let countProbe = 0;
        for (const entry of probe.entries) {
          const weight = entry.weight ?? (entry.bordered ? '600' : '500');
          core += measureWithTracking(entry.text, weight, minFont, family, tracking);
          if (entry.dropdown) core += measureWithTracking('⌄', '500', caretSize, family, 0) + caretGap;
          if (entry.bordered) core += 2;
          countProbe += 1;
        }
        const account = container.querySelector<HTMLElement>('[data-nav-account]');
        if (account) {
          core += entryCoreWidth(account, minFont);
          countProbe += 1;
        }
        const needed = core + floor * 2 * countProbe;
        probe.onTight(probe.enabled && countProbe > 0 && needed > available + 0.5);
      }

      const next = `${font.toFixed(2)}|${pad.toFixed(2)}`;
      if (next === lastApplied) return;
      lastApplied = next;
      container.style.setProperty('--nav-font', `${font}px`);
      container.style.setProperty('--nav-pad', `${pad}px`);
      const padPx = `${pad}px`;
      const fontPx = `${font}px`;
      for (const el of items) {
        el.style.fontSize = fontPx;
        el.style.paddingLeft = padPx;
        el.style.paddingRight = padPx;
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };

    fit();
    void document.fonts?.ready.then(schedule);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(container);
    const mo = new MutationObserver(schedule);
    mo.observe(container, { subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      clear([...container.querySelectorAll<HTMLElement>(itemSelector)]);
    };
  }, [containerRef, textKey, mediaQuery, minFont, maxFont, minPad, maxPad, itemSelector]);
}
