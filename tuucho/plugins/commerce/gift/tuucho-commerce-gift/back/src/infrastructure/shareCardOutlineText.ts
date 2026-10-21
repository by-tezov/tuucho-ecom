import { createRequire } from 'node:module';
import type { ShareCardSurface } from './shareCardSurface.js';

interface PathCommand {
  command: string;
  args: number[];
}

type GlyphRun = {
  glyphs: Array<{ path: { commands: PathCommand[] } }>;
  positions: Array<{ xAdvance: number; xOffset: number; yOffset: number }>;
};

export interface ShareKitFont {
  unitsPerEm: number;
  ascent: number;
  layout: (text: string) => GlyphRun;
  hasGlyphForCodePoint?: (codePoint: number) => boolean;
}

const require = createRequire(import.meta.url);
const { openSync } = require('fontkit') as { openSync: (path: string) => ShareKitFont };

const kitCache = new Map<string, ShareKitFont>();

export function loadShareKitFont(absolutePath: string): ShareKitFont {
  const cached = kitCache.get(absolutePath);
  if (cached) return cached;
  const opened = openSync(absolutePath) as ShareKitFont;
  kitCache.set(absolutePath, opened);
  return opened;
}

/** `primary`, with every stretch of text it has no glyph for (Thai names,
 * comments or dates on a card whose faces are Latin-only) laid out in
 * `fallback` instead, scaled to `primary`'s em. A combining mark stays in
 * its base character's run, so Thai vowels and tone marks are shaped with
 * their consonant. */
export function withFallbackFont(primary: ShareKitFont, fallback: ShareKitFont): ShareKitFont {
  const ratio = primary.unitsPerEm / fallback.unitsPerEm;
  const covered = (char: string) =>
    /\s/u.test(char) || primary.hasGlyphForCodePoint?.(char.codePointAt(0) ?? 0) !== false;
  return {
    unitsPerEm: primary.unitsPerEm,
    ascent: primary.ascent,
    hasGlyphForCodePoint: (codePoint) =>
      primary.hasGlyphForCodePoint?.(codePoint) !== false ||
      fallback.hasGlyphForCodePoint?.(codePoint) !== false,
    layout(text) {
      const runs: Array<{ text: string; useFallback: boolean }> = [];
      for (const char of text) {
        const last = runs[runs.length - 1];
        const useFallback = last && /\p{M}/u.test(char) ? last.useFallback : !covered(char);
        if (last && last.useFallback === useFallback) last.text += char;
        else runs.push({ text: char, useFallback });
      }
      const merged: GlyphRun = { glyphs: [], positions: [] };
      for (const run of runs) {
        const laid = (run.useFallback ? fallback : primary).layout(run.text);
        const scale = run.useFallback ? ratio : 1;
        laid.glyphs.forEach((glyph) =>
          merged.glyphs.push(
            scale === 1
              ? glyph
              : {
                  path: {
                    commands: glyph.path.commands.map(({ command, args }) => ({
                      command,
                      args: args.map((value) => value * scale),
                    })),
                  },
                },
          ),
        );
        laid.positions.forEach((pos) =>
          merged.positions.push({
            xAdvance: pos.xAdvance * scale,
            xOffset: pos.xOffset * scale,
            yOffset: pos.yOffset * scale,
          }),
        );
      }
      return merged;
    },
  };
}

function measureShareText(font: ShareKitFont, text: string, size: number, characterSpacing = 0): number {
  if (!text) return 0;
  const scale = size / font.unitsPerEm;
  const run = font.layout(text);
  let width = 0;
  for (const pos of run.positions) width += pos.xAdvance * scale;
  if (characterSpacing !== 0 && text.length > 1) {
    width += characterSpacing * (text.length - 1);
  }
  return width;
}

export function ellipsizeShareText(
  font: ShareKitFont,
  text: string,
  size: number,
  width: number,
  characterSpacing = 0,
): string {
  if (measureShareText(font, text, size, characterSpacing) <= width) return text;
  let cut = text;
  while (cut.length > 1 && measureShareText(font, `${cut}…`, size, characterSpacing) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function wrapParagraph(
  font: ShareKitFont,
  paragraph: string,
  size: number,
  width: number,
  characterSpacing: number,
): string[] {
  if (paragraph.length === 0) return [''];
  if (measureShareText(font, paragraph, size, characterSpacing) <= width) return [paragraph];
  const lines: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current.length > 0) lines.push(current);
    current = '';
  };
  const tokens = paragraph.split(/(\s+)/u);
  for (const token of tokens) {
    if (token.length === 0) continue;
    const trial = current + token;
    if (current.length > 0 && measureShareText(font, trial, size, characterSpacing) > width) {
      flush();
      current = token.replace(/^\s+/u, '');
    } else {
      current = trial;
    }
    while (current.length > 0 && measureShareText(font, current, size, characterSpacing) > width) {
      let fit = current.length;
      while (fit > 1 && measureShareText(font, current.slice(0, fit), size, characterSpacing) > width) {
        fit -= 1;
      }
      // Never cut a Thai vowel or tone mark off its consonant.
      while (fit > 1 && /\p{M}/u.test(current.charAt(fit))) fit -= 1;
      lines.push(current.slice(0, fit));
      current = current.slice(fit);
    }
  }
  flush();
  return lines;
}

function wrapShareText(
  font: ShareKitFont,
  text: string,
  size: number,
  width: number,
  characterSpacing: number,
  maxLines?: number,
): string[] {
  const lines = text
    .split('\n')
    .flatMap((paragraph) => wrapParagraph(font, paragraph, size, width, characterSpacing));
  if (maxLines == null || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? '';
  kept[maxLines - 1] = ellipsizeShareText(
    font,
    last.endsWith('…') ? last : `${last}…`,
    size,
    width,
    characterSpacing,
  );
  return kept;
}

export function shareTextHeight(
  font: ShareKitFont,
  text: string,
  size: number,
  width: number,
  lineHeight: number,
  maxLines?: number,
  lineBreak = true,
  characterSpacing = 0,
): number {
  const lines =
    lineBreak === false
      ? [ellipsizeShareText(font, text.replaceAll('\n', ' '), size, width, characterSpacing)]
      : wrapShareText(font, text, size, width, characterSpacing, maxLines);
  return Math.max(size * lineHeight, lines.length * size * lineHeight);
}

function applyPath(doc: ShareCardSurface, commands: PathCommand[]): void {
  doc.beginPath?.();
  for (const { command, args } of commands) {
    switch (command) {
      case 'moveTo':
        doc.moveTo(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'lineTo':
        doc.lineTo(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'quadraticCurveTo':
        doc.quadraticCurveTo(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0, args[3] ?? 0);
        break;
      case 'bezierCurveTo':
        doc.bezierCurveTo(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0, args[3] ?? 0, args[4] ?? 0, args[5] ?? 0);
        break;
      case 'closePath':
        doc.closePath();
        break;
      default:
        break;
    }
  }
}

export function drawShareText(
  doc: ShareCardSurface,
  font: ShareKitFont,
  text: string,
  x: number,
  y: number,
  opts: {
    size: number;
    color: string;
    width: number;
    align?: 'left' | 'right' | 'center';
    characterSpacing?: number;
    lineHeight?: number;
    maxLines?: number;
    lineBreak?: boolean;
  },
): number {
  const size = opts.size;
  const spacing = opts.characterSpacing ?? 0;
  const align = opts.align ?? 'left';
  const lineHeight = opts.lineHeight ?? 1.12;
  const lines =
    opts.lineBreak === false
      ? [ellipsizeShareText(font, text.replaceAll('\n', ' '), size, opts.width, spacing)]
      : wrapShareText(font, text, size, opts.width, spacing, opts.maxLines);
  const scale = size / font.unitsPerEm;
  const ascent = font.ascent * scale;
  doc.save();
  doc.fillColor(opts.color);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineW = measureShareText(font, line, size, spacing);
    let gx = x;
    if (align === 'right') gx = x + opts.width - lineW;
    else if (align === 'center') gx = x + (opts.width - lineW) / 2;
    const baseline = y + ascent + i * size * lineHeight;
    const run = font.layout(line);
    for (let g = 0; g < run.glyphs.length; g += 1) {
      const glyph = run.glyphs[g];
      const pos = run.positions[g];
      if (!glyph || !pos) continue;
      const commands = glyph.path.commands;
      if (commands.length > 0) {
        doc.save();
        doc.translate(gx + pos.xOffset * scale, baseline - pos.yOffset * scale);
        doc.scale(scale, -scale);
        applyPath(doc, commands);
        doc.fill();
        doc.restore();
      }
      gx += pos.xAdvance * scale + (g < run.glyphs.length - 1 ? spacing : 0);
    }
  }
  doc.restore();
  return lines.length * size * lineHeight;
}
