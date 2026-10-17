import { loadSharp } from '@kernel/back/media/sharp';
import type { GiftShareCardTheme } from './giftShareCardThemes.js';
import type { ShareCardSurface } from './shareCardSurface.js';

interface ShareRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Process-lifetime cache of rasterized theme SVGs keyed by content + size. */
const rasterPngCache = new Map<string, Buffer>();
const RASTER_CACHE_MAX = 64;

function ensureSvgNs(svg: string): string {
  if (svg.includes('xmlns=')) return svg;
  return svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

function rasterCacheKey(svg: string, width: number, height: number): string {
  return `${Math.round(width)}x${Math.round(height)}:${svg.length}:${svg.slice(0, 96)}:${svg.slice(-96)}`;
}

export async function rasterShareSvg(svg: string, width: number, height: number): Promise<Buffer> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const key = rasterCacheKey(svg, w, h);
  const hit = rasterPngCache.get(key);
  if (hit) return hit;
  // Loaded on first use, not at server start (cold starts on the LWS host).
  const sharp = await loadSharp();
  const png = await sharp(Buffer.from(ensureSvgNs(svg)))
    .resize(w, h)
    .png()
    .toBuffer();
  if (rasterPngCache.size >= RASTER_CACHE_MAX) {
    const oldest = rasterPngCache.keys().next().value;
    if (oldest !== undefined) rasterPngCache.delete(oldest);
  }
  rasterPngCache.set(key, png);
  return png;
}

export async function fillShareGradient(
  doc: ShareCardSurface,
  rect: ShareRect,
  theme: GiftShareCardTheme,
): Promise<void> {
  const rad = (theme.angle * Math.PI) / 180;
  const x1 = 50 - Math.cos(rad) * 50;
  const y1 = 50 - Math.sin(rad) * 50;
  const x2 = 50 + Math.cos(rad) * 50;
  const y2 = 50 + Math.sin(rad) * 50;
  const stops = theme.stops
    .map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="${stop.color}" />`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.w}" height="${rect.h}" viewBox="0 0 ${rect.w} ${rect.h}">
  <defs><linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;
  const png = await rasterShareSvg(svg, rect.w * 2.2, rect.h * 2.2);
  await doc.image(png, rect.x, rect.y, { width: rect.w, height: rect.h });
}
