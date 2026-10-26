import { writeFile } from 'node:fs/promises';
import { localizedCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '@kernel/back/utils/language';
import { GIVER_PROMISE_MAIL_DATE_LOCALES } from '../domain/giverPromiseMailCopy.js';
import type { GiftShareCardStyle } from '../domain/shareCardStyle.js';
import { drawGiftShareCardFace, type GiftShareCardRect } from './giftShareCardDraw.js';
import { giftQrPng } from './giftQr.js';
import { loadShareCardFonts, resolveFont, SHARE_CARD_THAI_TEXT_FONT } from './shareCardFonts.js';
import { giftShareCardTheme } from './giftShareCardThemes.js';
import { asShareCardSurface, type ShareCardSurface } from './shareCardSurface.js';

const MUTED = '#6f665a';
const INCH = 72;
/** Cut-out card: 5" wide × 3" tall. */
export const GIFT_SHARE_CARD_WIDTH_PT = 5 * INCH;
export const GIFT_SHARE_CARD_HEIGHT_PT = 3 * INCH;
const PAGE_MARGIN_X = 28;
const PAGE_MARGIN_TOP = 22;

export interface GiftShareCardPdfInput {
  receiverUrl: string;
  giverDisplayName: string;
  receiverName: string;
  giverComment: string;
  style: GiftShareCardStyle;
  language: Language;
  expiresAt: Date;
}

interface CardCopy {
  /** The PDF's title, shown by the viewer instead of the file name. */
  title: string;
  printHint: string;
  footer: string;
  useBefore: string;
  /** What a screen reader says for the card face, whose text is drawn as
   * outlines: `{giver}` and `{receiver}` are filled in. */
  faceAlt: string;
  messageLabel: string;
}

function formatQrExpiry(date: Date, language: Language): string {
  return date.toLocaleDateString(GIVER_PROMISE_MAIL_DATE_LOCALES[language], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatQrCaption(date: Date, language: Language, useBefore: string): string {
  return `${useBefore}\n${formatQrExpiry(date, language)}`;
}

function cardCopy(language: Language): CardCopy {
  return localizedCatalog(language, 'gift-share-card-pdf');
}

function drawDashedRect(doc: PDFKit.PDFDocument, rect: GiftShareCardRect): void {
  doc.save();
  doc.lineWidth(0.6);
  doc.strokeColor(MUTED);
  doc.dash(3, { space: 3 });
  doc.rect(rect.x, rect.y, rect.w, rect.h).stroke();
  doc.undash();
  doc.restore();
}

function drawCropMarks(doc: PDFKit.PDFDocument, rect: GiftShareCardRect): void {
  const len = 8;
  const gap = 2;
  doc.save();
  doc.lineWidth(0.5);
  doc.strokeColor(MUTED);
  const marks: Array<[number, number, number, number]> = [
    [rect.x - gap - len, rect.y, rect.x - gap, rect.y],
    [rect.x, rect.y - gap - len, rect.x, rect.y - gap],
    [rect.x + rect.w + gap, rect.y, rect.x + rect.w + gap + len, rect.y],
    [rect.x + rect.w, rect.y - gap - len, rect.x, rect.y - gap],
    [rect.x - gap - len, rect.y + rect.h, rect.x - gap, rect.y + rect.h],
    [rect.x, rect.y + rect.h + gap, rect.x, rect.y + rect.h + gap + len],
    [rect.x + rect.w + gap, rect.y + rect.h, rect.x + rect.w + gap + len, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h + gap, rect.x, rect.y + rect.h + gap + len],
  ];
  for (const [x0, y0, x1, y1] of marks) {
    doc.moveTo(x0, y0).lineTo(x1, y1).stroke();
  }
  doc.restore();
}

export async function paintGiftShareCardFace(
  surface: ShareCardSurface,
  rect: GiftShareCardRect,
  input: GiftShareCardPdfInput,
): Promise<void> {
  const copy = cardCopy(input.language);
  const theme = giftShareCardTheme(input.style);
  const qrPng = await giftQrPng(input.receiverUrl, {
    dark: theme.qrDark,
    light: theme.qrLight,
  });
  const fonts = loadShareCardFonts();
  await drawGiftShareCardFace(surface, rect, theme, fonts, qrPng, {
    giverDisplayName: input.giverDisplayName,
    receiverName: input.receiverName,
    giverComment: input.giverComment,
    scanLabel: formatQrCaption(input.expiresAt, input.language, copy.useBefore),
    occasionLabel: '',
  });
}

type StructOptions = NonNullable<Parameters<PDFKit.PDFDocument['struct']>[1]>;

/** Both layouts are tagged PDFs (RGAA 13.3): language, title, reading order. */
function taggedPdfOptions(copy: CardCopy, language: Language) {
  return {
    pdfVersion: '1.7',
    tagged: true,
    lang: language,
    displayTitle: true,
    info: { Title: copy.title, Author: 'Shop' },
  } as const;
}

/** Frame, crop marks and footer: drawn, but outside the reading order. */
function artifact(doc: PDFKit.PDFDocument, draw: () => void): void {
  doc.markContent('Artifact', { type: 'Layout' });
  draw();
  doc.endMarkedContent();
}

function faceAlt(input: GiftShareCardPdfInput, copy: CardCopy): string {
  const parts = [
    copy.faceAlt
      .replace('{giver}', () => input.giverDisplayName.trim())
      .replace('{receiver}', () => input.receiverName.trim()),
  ];
  const comment = input.giverComment.replace(/\s+/g, ' ').trim();
  if (comment) parts.push(`${copy.messageLabel} ${comment}`);
  parts.push(`${copy.useBefore} ${formatQrExpiry(input.expiresAt, input.language)}.`);
  return parts.join(' ');
}

/** The card face, whose text is drawn as outlines, as one figure that a
 * screen reader announces by its alternative text. Its drawing awaits the QR
 * code, so the marked content is opened and closed around the whole paint
 * rather than through a synchronous struct closure. */
async function paintTaggedFace(
  doc: PDFKit.PDFDocument,
  root: PDFKit.PDFStructureElement,
  rect: GiftShareCardRect,
  input: GiftShareCardPdfInput,
  copy: CardCopy,
): Promise<void> {
  const content = doc.markStructureContent('Figure');
  await paintGiftShareCardFace(asShareCardSurface(doc), rect, input);
  doc.endMarkedContent();
  const options: StructOptions & { bbox: [number, number, number, number] } = {
    alt: faceAlt(input, copy),
    bbox: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
  };
  root.add(doc.struct('Figure', options, [content]));
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

const THAI_RUN = /(\p{Script=Thai}+)/u;

/**
 * Centred, wrapped text whose Thai stretches are set in Noto Sans Thai and
 * the rest (digits, "x", punctuation) in Helvetica, which has no Thai glyph.
 * pdfkit cannot switch fonts inside one centred paragraph, so lines are
 * broken at spaces and placed here, run by run.
 */
function drawMixedScriptText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
): void {
  const thai = resolveFont(SHARE_CARD_THAI_TEXT_FONT);
  const runsOf = (word: string) =>
    word
      .split(THAI_RUN)
      .filter(Boolean)
      .map((part) => ({ text: part, font: THAI_RUN.test(part) ? thai : 'Helvetica' }));
  const widthOf = (runs: Array<{ text: string; font: string }>) =>
    runs.reduce((total, run) => total + doc.font(run.font).widthOfString(run.text), 0);
  const space = doc.font('Helvetica').widthOfString(' ');
  const lines: Array<Array<{ text: string; font: string }>> = [];
  let line: Array<{ text: string; font: string }> = [];
  let lineWidth = 0;
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const runs = runsOf(word);
    const wordWidth = widthOf(runs);
    if (line.length > 0 && lineWidth + space + wordWidth > width) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    if (line.length > 0) {
      line.push({ text: ' ', font: 'Helvetica' });
      lineWidth += space;
    }
    line.push(...runs);
    lineWidth += wordWidth;
  }
  if (line.length > 0) lines.push(line);
  const lineHeight = doc.font(thai).currentLineHeight(true);
  lines.forEach((runs, index) => {
    // One alphabetic baseline per line: each font has its own ascent, so
    // top-aligned runs would sit at different heights.
    const baseline = y + doc.currentLineHeight() + index * lineHeight;
    let cursor = x + (width - widthOf(runs)) / 2;
    for (const run of runs) {
      doc.font(run.font).text(run.text, cursor, baseline, { lineBreak: false, baseline: 'alphabetic' });
      cursor += doc.widthOfString(run.text);
    }
  });
}

function drawA4Frame(
  doc: PDFKit.PDFDocument,
  root: PDFKit.PDFStructureElement,
  copy: CardCopy,
): GiftShareCardRect {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const originX = (pageW - GIFT_SHARE_CARD_WIDTH_PT) / 2;
  const originY = Math.max(PAGE_MARGIN_TOP + 28, (pageH - GIFT_SHARE_CARD_HEIGHT_PT) / 2);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  const width = pageW - PAGE_MARGIN_X * 2;
  root.add(
    doc.struct('P', {}, () => {
      if (THAI_RUN.test(copy.printHint)) {
        drawMixedScriptText(doc, copy.printHint, PAGE_MARGIN_X, PAGE_MARGIN_TOP, width);
      } else {
        doc.text(copy.printHint, PAGE_MARGIN_X, PAGE_MARGIN_TOP, { width, align: 'center' });
      }
    }),
  );
  const cell: GiftShareCardRect = {
    x: originX,
    y: originY,
    w: GIFT_SHARE_CARD_WIDTH_PT,
    h: GIFT_SHARE_CARD_HEIGHT_PT,
  };
  artifact(doc, () => {
    drawDashedRect(doc, cell);
    drawCropMarks(doc, cell);
  });
  return cell;
}

function drawA4Footer(doc: PDFKit.PDFDocument, copy: CardCopy, cardBottom: number): void {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const footerY = Math.min(cardBottom + 12, pageH - 16);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  artifact(doc, () => {
    doc.text(copy.footer, PAGE_MARGIN_X, footerY, {
      width: pageW - PAGE_MARGIN_X * 2,
      align: 'center',
    });
  });
}

/**
 * `a4`: landscape A4 with one cut-out 5"×3" card.
 * `card`: the 5"×3" card alone.
 * Temp file only; never stored in Postgres. PIN / giver portal / budgets
 * are intentionally omitted.
 */
export async function renderGiftShareCardPdf(
  input: GiftShareCardPdfInput,
  kind: 'a4' | 'card',
): Promise<Buffer> {
  const copy = cardCopy(input.language);
  // Loaded on first use rather than at server start: pdfkit cost ~0.46s of
  // every cold start on the LWS host.
  const { default: PDFDocument } = await import('pdfkit');
  if (kind === 'card') {
    const doc = new PDFDocument({
      size: [GIFT_SHARE_CARD_WIDTH_PT, GIFT_SHARE_CARD_HEIGHT_PT],
      margin: 0,
      ...taggedPdfOptions(copy, input.language),
    });
    const done = collectPdf(doc);
    const root = doc.struct('Document');
    doc.addStructure(root);
    await paintTaggedFace(
      doc,
      root,
      { x: 0, y: 0, w: GIFT_SHARE_CARD_WIDTH_PT, h: GIFT_SHARE_CARD_HEIGHT_PT },
      input,
      copy,
    );
    doc.end();
    return done;
  }
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    ...taggedPdfOptions(copy, input.language),
  });
  const done = collectPdf(doc);
  const root = doc.struct('Document');
  doc.addStructure(root);
  const cell = drawA4Frame(doc, root, copy);
  await paintTaggedFace(doc, root, cell, input, copy);
  drawA4Footer(doc, copy, cell.y + cell.h);
  doc.end();
  return done;
}

export async function writeGiftShareCardPdf(
  absolutePath: string,
  input: GiftShareCardPdfInput,
): Promise<void> {
  await writeFile(absolutePath, await renderGiftShareCardPdf(input, 'a4'));
}
