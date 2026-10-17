import type { CanvasRenderingContext2D } from 'canvas';

/** Drawing surface shared by the PDF face and the mailed JPEG. */
export interface ShareCardSurface {
  save(): ShareCardSurface;
  restore(): ShareCardSurface;
  opacity(value: number): ShareCardSurface;
  fillColor(color: string): ShareCardSurface;
  strokeColor(color: string): ShareCardSurface;
  lineWidth(width: number): ShareCardSurface;
  rect(x: number, y: number, w: number, h: number): ShareCardSurface;
  roundedRect(x: number, y: number, w: number, h: number, r: number): ShareCardSurface;
  circle(x: number, y: number, r: number): ShareCardSurface;
  fill(): ShareCardSurface;
  stroke(): ShareCardSurface;
  beginPath?: () => ShareCardSurface;
  moveTo(x: number, y: number): ShareCardSurface;
  lineTo(x: number, y: number): ShareCardSurface;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): ShareCardSurface;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): ShareCardSurface;
  closePath(): ShareCardSurface;
  translate(x: number, y: number): ShareCardSurface;
  scale(x: number, y: number): ShareCardSurface;
  image(
    src: Buffer,
    x: number,
    y: number,
    options: { width: number; height: number },
  ): ShareCardSurface | Promise<void>;
}

function pdfShareSurface(doc: PDFKit.PDFDocument): ShareCardSurface {
  const surface: ShareCardSurface = {
    save() {
      doc.save();
      return surface;
    },
    restore() {
      doc.restore();
      return surface;
    },
    opacity(value) {
      doc.opacity(value);
      return surface;
    },
    fillColor(color) {
      doc.fillColor(color);
      return surface;
    },
    strokeColor(color) {
      doc.strokeColor(color);
      return surface;
    },
    lineWidth(width) {
      doc.lineWidth(width);
      return surface;
    },
    rect(x, y, w, h) {
      doc.rect(x, y, w, h);
      return surface;
    },
    roundedRect(x, y, w, h, r) {
      doc.roundedRect(x, y, w, h, r);
      return surface;
    },
    circle(x, y, r) {
      doc.circle(x, y, r);
      return surface;
    },
    fill() {
      doc.fill();
      return surface;
    },
    stroke() {
      doc.stroke();
      return surface;
    },
    moveTo(x, y) {
      doc.moveTo(x, y);
      return surface;
    },
    lineTo(x, y) {
      doc.lineTo(x, y);
      return surface;
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      doc.quadraticCurveTo(cpx, cpy, x, y);
      return surface;
    },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      doc.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      return surface;
    },
    closePath() {
      doc.closePath();
      return surface;
    },
    translate(x, y) {
      doc.translate(x, y);
      return surface;
    },
    scale(x, y) {
      doc.scale(x, y);
      return surface;
    },
    image(src, x, y, options) {
      doc.image(src, x, y, options);
      return surface;
    },
  };
  return surface;
}

/** Point-space surface: callers use the same 5"×3" coordinates as the PDF. */
export function createCanvasShareSurface(ctx: CanvasRenderingContext2D, dpi: number): ShareCardSurface {
  ctx.scale(dpi / 72, dpi / 72);
  const surface: ShareCardSurface = {
    save() {
      ctx.save();
      return surface;
    },
    restore() {
      ctx.restore();
      return surface;
    },
    opacity(value) {
      ctx.globalAlpha = value;
      return surface;
    },
    fillColor(color) {
      ctx.fillStyle = color;
      return surface;
    },
    strokeColor(color) {
      ctx.strokeStyle = color;
      return surface;
    },
    lineWidth(width) {
      ctx.lineWidth = width;
      return surface;
    },
    rect(x, y, w, h) {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      return surface;
    },
    roundedRect(x, y, w, h, r) {
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
      return surface;
    },
    circle(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return surface;
    },
    fill() {
      ctx.fill();
      return surface;
    },
    stroke() {
      ctx.stroke();
      return surface;
    },
    beginPath() {
      ctx.beginPath();
      return surface;
    },
    moveTo(x, y) {
      ctx.moveTo(x, y);
      return surface;
    },
    lineTo(x, y) {
      ctx.lineTo(x, y);
      return surface;
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      ctx.quadraticCurveTo(cpx, cpy, x, y);
      return surface;
    },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      return surface;
    },
    closePath() {
      ctx.closePath();
      return surface;
    },
    translate(x, y) {
      ctx.translate(x, y);
      return surface;
    },
    scale(x, y) {
      ctx.scale(x, y);
      return surface;
    },
    async image(src, x, y, options) {
      const { loadImage } = await import('canvas');
      const img = await loadImage(src);
      ctx.drawImage(img, x, y, options.width, options.height);
    },
  };
  return surface;
}

export function asShareCardSurface(doc: PDFKit.PDFDocument): ShareCardSurface {
  return pdfShareSurface(doc);
}
