import type { GiftShareCardTheme } from './giftShareCardThemes.js';
import { SHARE_CARD_ART } from './shareCardArt.js';
import { fillShareGradient, rasterShareSvg } from './shareCardFill.js';
import type { ShareCardFontSet } from './shareCardFonts.js';
import type { ShareKitFont } from './shareCardOutlineText.js';
import { drawShareText, ellipsizeShareText, shareTextHeight } from './shareCardOutlineText.js';
import type { ShareCardSurface } from './shareCardSurface.js';
import { valentinHeartLiftSvg, valentinPackEndCopyBox, withValentinHeartLift } from './shareCardValentin.js';

export interface GiftShareCardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GiftShareCardFaceInput {
  giverDisplayName: string;
  receiverName: string;
  giverComment: string;
  scanLabel: string;
  occasionLabel: string;
}

function cq(rect: GiftShareCardRect, n: number): number {
  return (rect.w * n) / 100;
}

function ellipsize(font: ShareKitFont, text: string, size: number, width: number): string {
  return ellipsizeShareText(font, text, size, width);
}

function nameFont(theme: GiftShareCardTheme, fonts: ShareCardFontSet): ShareKitFont {
  if (theme.nameFace === 'sans') return fonts.sansBold;
  if (theme.nameFace === 'script') return fonts.script;
  if (theme.nameFace === 'cinzel') return fonts.cinzel;
  return fonts.serif;
}

function nameSize(theme: GiftShareCardTheme, rect: GiftShareCardRect): number {
  if (theme.nameFace === 'script') return cq(rect, 9);
  if (theme.nameFace === 'cinzel') return cq(rect, 6.8);
  if (theme.nameFace === 'sans') return cq(rect, 7.6);
  return cq(rect, 8);
}

/** PDFKit does not expand tabs. Line endings become `\n` so explicit returns stay. */
function shareCardMessageForDraw(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\t', '    ');
}

function clampMessageHeight(font: ShareKitFont, text: string, width: number, fontSize: number): number {
  const lineHeight = 1.38;
  return Math.min(shareTextHeight(font, text, fontSize, width, lineHeight, 6), fontSize * lineHeight * 6);
}

async function drawQrFrame(
  doc: ShareCardSurface,
  x: number,
  y: number,
  size: number,
  png: Buffer,
  theme: GiftShareCardTheme,
  scanLabel: string,
  fonts: ShareCardFontSet,
  hang: boolean,
): Promise<void> {
  const capSize = size * (1.55 / 25);
  const capBlock = capSize * 2 + size * (0.25 / 25);
  if (hang) {
    const stringH = size * (4 / 25);
    const padX = size * (1.8 / 25);
    const padTop = size * (3.2 / 25);
    const padBot = size * (1.6 / 25);
    const tagW = size + padX * 2;
    const tagH = size + padTop + padBot + capBlock + size * (0.5 / 25);
    const tagX = x - padX;
    const tagY = y - padTop;
    doc.save();
    doc.fillColor(theme.accent).opacity(0.6);
    doc.rect(x + size / 2 - 0.7, tagY - stringH, 1.4, stringH).fill();
    doc.opacity(1).fillColor(theme.qrLight);
    doc.roundedRect(tagX, tagY, tagW, tagH, cq({ x, y, w: size * 4, h: size * 4 }, 1.4)).fill();
    doc.fillColor(theme.qrDark);
    doc.circle(x + size / 2, tagY + size * (1.2 / 25) + 2.2, 2.2).fill();
    await doc.image(png, x, y, { width: size, height: size });
    drawShareText(doc, fonts.sansBold, scanLabel, tagX, y + size + size * (0.4 / 25), {
      size: capSize,
      color: theme.cap,
      width: tagW,
      align: 'center',
      characterSpacing: capSize * 0.04,
      lineHeight: 1.2,
    });
    doc.restore();
    return;
  }
  const frame = size * (0.7 / 25);
  doc.save();
  doc.fillColor(theme.qrLight);
  doc.rect(x - frame, y - frame, size + frame * 2, size + frame * 2).fill();
  doc.lineWidth(0.8).strokeColor(theme.accent).opacity(0.45);
  doc.rect(x - frame, y - frame, size + frame * 2, size + frame * 2).stroke();
  doc.opacity(1);
  await doc.image(png, x, y, { width: size, height: size });
  drawShareText(doc, fonts.sansBold, scanLabel, x - frame, y + size + frame + 2, {
    size: capSize,
    color: theme.cap,
    width: size + frame * 2,
    align: 'center',
    characterSpacing: capSize * 0.04,
    lineHeight: 1.2,
  });
  doc.restore();
}

function measureCopy(
  box: GiftShareCardRect,
  face: GiftShareCardRect,
  theme: GiftShareCardTheme,
  fonts: ShareCardFontSet,
  input: GiftShareCardFaceInput,
  fromBottom: boolean,
  nameWidth?: number,
  skipName = false,
): { top: number; nameTop: number } {
  const receiver = input.receiverName.trim() || ' ';
  const message = shareCardMessageForDraw(input.giverComment);
  const msgFont = theme.nameFace === 'sans' ? fonts.sans : fonts.serifItalic;
  const msgSize = theme.nameFace === 'sans' ? cq(face, 2.5) : cq(face, 3.35);
  const nFont = nameFont(theme, fonts);
  const nSize = nameSize(theme, face);
  const nameW = nameWidth ?? box.w;
  const nameH = skipName ? 0 : shareTextHeight(nFont, receiver, nSize, nameW, 1.12);
  let occH = 0;
  if (theme.occasion && input.occasionLabel) {
    occH = theme.occasion === 'script' ? cq(face, 3.7) * 1.1 : cq(face, 4) * 1.15;
  }
  const ruleH = theme.rule ? cq(face, 2.8) : 0;
  const msgH = message ? clampMessageHeight(msgFont, message, box.w, msgSize) : 0;
  const gap = cq(face, 1.4);
  const copyH = Math.min(box.h, occH + nameH + ruleH + (message ? gap + msgH : 0));
  const top = fromBottom ? Math.max(box.y, box.y + box.h - copyH) : box.y;
  return { top, nameTop: skipName ? top : top + occH };
}

function drawCopy(
  doc: ShareCardSurface,
  box: GiftShareCardRect,
  face: GiftShareCardRect,
  theme: GiftShareCardTheme,
  fonts: ShareCardFontSet,
  input: GiftShareCardFaceInput,
  fromBottom: boolean,
  nameWidth?: number,
  skipName = false,
): { top: number; bottom: number } {
  const align = theme.align;
  const receiver = input.receiverName.trim() || ' ';
  const message = shareCardMessageForDraw(input.giverComment);
  const msgFont = theme.nameFace === 'sans' ? fonts.sans : fonts.serifItalic;
  const msgSize = theme.nameFace === 'sans' ? cq(face, 2.5) : cq(face, 3.35);
  const nFont = nameFont(theme, fonts);
  const nSize = nameSize(theme, face);
  const nameW = nameWidth ?? box.w;
  const nameH = skipName ? 0 : shareTextHeight(nFont, receiver, nSize, nameW, 1.12);
  let occH = 0;
  if (theme.occasion && input.occasionLabel) {
    occH = theme.occasion === 'script' ? cq(face, 3.7) * 1.1 : cq(face, 4) * 1.15;
  }
  const ruleH = theme.rule ? cq(face, 2.8) : 0;
  const msgH = message ? clampMessageHeight(msgFont, message, box.w, msgSize) : 0;
  const gap = cq(face, 1.4);
  const { top } = measureCopy(box, face, theme, fonts, input, fromBottom, nameWidth, skipName);
  let y = top;

  if (theme.occasion && input.occasionLabel) {
    const occSize = theme.occasion === 'script' ? cq(face, 3.7) : cq(face, 4);
    const occFont = theme.occasion === 'script' ? fonts.script : fonts.cinzel;
    drawShareText(doc, occFont, input.occasionLabel, box.x, y, {
      size: occSize,
      color: theme.accent,
      width: box.w,
      align,
      lineBreak: false,
      characterSpacing: theme.occasion === 'cinzel' ? occSize * 0.14 : 0,
    });
    y += occH;
  }
  if (!skipName) {
    drawShareText(doc, nFont, receiver, box.x, y, {
      size: nSize,
      color: theme.ink,
      width: nameW,
      align,
      lineHeight: 1.12,
    });
    y += nameH;
  }
  if (theme.rule) {
    const ruleW = cq(face, 14);
    const ruleX = align === 'right' ? box.x + box.w - ruleW : box.x;
    doc.save();
    doc.strokeColor(theme.accent).opacity(0.55).lineWidth(0.8);
    doc
      .moveTo(ruleX, y + cq(face, 0.7))
      .lineTo(ruleX + ruleW, y + cq(face, 0.7))
      .stroke();
    doc.restore();
    y += ruleH;
  }
  if (message) {
    y += gap;
    drawShareText(doc, msgFont, message, box.x, y, {
      size: msgSize,
      color: theme.msg,
      width: box.w,
      align,
      lineHeight: 1.38,
      maxLines: 6,
    });
    y += msgH;
  }
  return { top, bottom: y };
}

export async function drawGiftShareCardFace(
  doc: ShareCardSurface,
  rect: GiftShareCardRect,
  theme: GiftShareCardTheme,
  fonts: ShareCardFontSet,
  qrPng: Buffer,
  input: GiftShareCardFaceInput,
): Promise<void> {
  const art = SHARE_CARD_ART[theme.id];
  doc.save();
  await fillShareGradient(doc, rect, theme);
  let artSvg = art.art;
  if (theme.id === 'valentin') {
    const { nameTop } = measureCopy(valentinPackEndCopyBox(rect, theme.pad), rect, theme, fonts, input, true);
    artSvg = withValentinHeartLift(art.art, valentinHeartLiftSvg(nameTop, rect));
  }
  const artPng = await rasterShareSvg(artSvg, rect.w * 2.2, rect.h * 2.2);
  await doc.image(artPng, rect.x, rect.y, { width: rect.w, height: rect.h });

  const nailW = cq(rect, theme.nail.w ?? 20);
  const nailH = cq(rect, theme.nail.h ?? 18);
  let nailX = rect.x;
  let nailY = rect.y;
  if (theme.nail.left != null) nailX = rect.x + cq(rect, theme.nail.left);
  else if (theme.nail.right != null) nailX = rect.x + rect.w - cq(rect, theme.nail.right) - nailW;
  if (theme.nail.top != null) nailY = rect.y + cq(rect, theme.nail.top);
  else if (theme.nail.bottom != null) nailY = rect.y + rect.h - cq(rect, theme.nail.bottom) - nailH;
  const nailSvg = art.nail.replaceAll('currentColor', theme.accent);
  const nailPng = await rasterShareSvg(nailSvg, nailW * 2.2, nailH * 2.2);
  doc.save();
  doc.opacity(0.5);
  await doc.image(nailPng, nailX, nailY, { width: nailW, height: nailH });
  doc.restore();

  const [pt, pr, pb, pl] = theme.pad;
  const padT = cq(rect, pt);
  const padR = cq(rect, pr);
  const padB = cq(rect, pb);
  const padL = cq(rect, pl);
  const qrSize = cq(rect, 25);
  const gap = cq(rect, 4);
  const innerX = rect.x + padL;
  const innerY = rect.y + padT;
  const innerW = rect.w - padL - padR;
  const innerH = rect.h - padT - padB;
  const leftQr = theme.qr === 'left';
  const hang = theme.layout === 'hangTag';

  const brandY = innerY + cq(rect, theme.brandNudge ?? 0);
  const brandH = cq(rect, 3.4);
  const sigH = cq(rect, 3.6);
  const sigFont = theme.nameFace === 'sans' ? fonts.sans : fonts.serif;
  const sigSize = theme.nameFace === 'sans' ? cq(rect, 2.4) : cq(rect, 2.8);
  const brand = 'Shop Nails';
  const giver = input.giverDisplayName.trim() || ' ';

  const qrColW = qrSize;
  const textW = theme.layout === 'stack' ? innerW : innerW - qrColW - gap;
  const textX = theme.layout === 'stack' ? innerX : leftQr ? innerX + qrColW + gap : innerX;
  const qrX = leftQr ? innerX : innerX + textW + gap;
  const qrY =
    theme.layout === 'celeste' || theme.layout === 'packEnd' || theme.layout === 'spread' || hang
      ? theme.layout === 'celeste'
        ? innerY + innerH - qrSize - cq(rect, 5.6)
        : hang
          ? innerY + innerH - qrSize - cq(rect, 7.2)
          : innerY + innerH - qrSize - cq(rect, 5)
      : theme.layout === 'stack'
        ? innerY
        : innerY + innerH - qrSize - cq(rect, 5);

  if (theme.layout === 'stack') {
    const brandAlign = theme.align;
    const stackBrandH = cq(rect, 3.4);
    const brandSize = cq(rect, 2.15);
    const brandX = brandAlign === 'right' ? innerX + qrSize + gap : innerX;
    const brandW = innerW - qrSize - gap;
    drawShareText(doc, fonts.sansBold, brand, brandX, brandY, {
      size: brandSize,
      color: theme.accent,
      width: brandW,
      align: brandAlign,
      lineBreak: false,
      characterSpacing: brandSize * 0.4,
    });
    const copyBox: GiftShareCardRect = {
      x: brandX,
      y: innerY + stackBrandH,
      w: brandW,
      h: innerH - stackBrandH - sigH - cq(rect, 1),
    };
    drawCopy(doc, copyBox, rect, theme, fonts, input, true);
    drawShareText(doc, sigFont, ellipsize(sigFont, giver, sigSize, brandW), brandX, innerY + innerH - sigH, {
      size: sigSize,
      color: theme.accent,
      width: brandW,
      align: theme.align,
      lineBreak: false,
    });
    await drawQrFrame(
      doc,
      leftQr ? innerX : innerX + innerW - qrSize,
      innerY,
      qrSize,
      qrPng,
      theme,
      input.scanLabel,
      fonts,
      false,
    );
    doc.restore();
    return;
  }

  const sigY = innerY + innerH - sigH;
  const pinBrand = Boolean(theme.brandPin);
  const headerH = hang || pinBrand ? 0 : brandH + cq(rect, theme.brandNudge ?? 0);
  const copyBox: GiftShareCardRect = {
    x: textX,
    y: hang ? innerY : innerY + headerH,
    w: textW,
    h: hang ? innerH - sigH - cq(rect, 1) : innerH - headerH - sigH - cq(rect, 1),
  };
  const brandSize = cq(rect, 2.15);

  if (theme.layout === 'packEnd') {
    const copy = drawCopy(doc, copyBox, rect, theme, fonts, input, true);
    const packBrandSize = cq(rect, 2);
    drawShareText(doc, fonts.sansBold, brand, textX, Math.max(innerY, copy.top - brandH - cq(rect, 0.8)), {
      size: packBrandSize,
      color: theme.accent,
      width: textW,
      align: theme.align,
      lineBreak: false,
      characterSpacing: packBrandSize * 0.4,
    });
    drawShareText(doc, sigFont, ellipsize(sigFont, giver, sigSize, textW), textX, sigY, {
      size: sigSize,
      color: theme.accent,
      width: textW,
      align: theme.align,
      lineBreak: false,
    });
  } else if (theme.layout === 'celeste') {
    drawShareText(doc, fonts.sansBold, brand, textX, brandY, {
      size: brandSize,
      color: theme.accent,
      width: textW,
      align: theme.align,
      lineBreak: false,
      characterSpacing: brandSize * 0.4,
    });
    const copy = drawCopy(doc, copyBox, rect, theme, fonts, input, false);
    drawShareText(
      doc,
      sigFont,
      ellipsize(sigFont, giver, sigSize, textW),
      textX,
      copy.bottom + cq(rect, 0.6),
      {
        size: sigSize,
        color: theme.accent,
        width: textW,
        align: theme.align,
        lineBreak: false,
      },
    );
  } else {
    if (hang) {
      drawShareText(doc, fonts.sansBold, brand, rect.x + cq(rect, 3), rect.y + cq(rect, 2.2), {
        size: brandSize,
        color: theme.accent,
        width: cq(rect, 42),
        align: 'left',
        lineBreak: false,
        characterSpacing: brandSize * 0.22,
      });
    } else if (theme.brandPin === 'topLeft') {
      drawShareText(doc, fonts.sansBold, brand, rect.x + padL, rect.y + cq(rect, theme.brandPinTop ?? 1), {
        size: brandSize,
        color: theme.accent,
        width: cq(rect, 50),
        align: 'left',
        lineBreak: false,
        characterSpacing: brandSize * 0.22,
      });
    } else if (pinBrand) {
      const nailMarkW = cq(rect, theme.nail.w ?? 20);
      const nailRight = cq(rect, theme.nail.right ?? 2.6);
      const brandBoxW = cq(rect, 42);
      const brandX = rect.x + rect.w - nailRight - nailMarkW - cq(rect, 0.8) - brandBoxW;
      drawShareText(doc, fonts.sansBold, brand, brandX, rect.y + cq(rect, theme.brandPinTop ?? 1), {
        size: brandSize,
        color: theme.accent,
        width: brandBoxW,
        align: 'right',
        lineBreak: false,
        characterSpacing: brandSize * 0.22,
      });
    } else {
      drawShareText(doc, fonts.sansBold, brand, textX, brandY, {
        size: brandSize,
        color: theme.accent,
        width: textW,
        align: theme.align,
        lineBreak: false,
        characterSpacing: brandSize * 0.4,
      });
    }
    if (theme.nameAboveQr) {
      const receiver = input.receiverName.trim() || ' ';
      const nFont = nameFont(theme, fonts);
      const nSize = nameSize(theme, rect);
      const nameH = shareTextHeight(nFont, receiver, nSize, innerW, 1.12);
      const nameY = innerY + headerH;
      drawShareText(doc, nFont, receiver, innerX, nameY, {
        size: nSize,
        color: theme.ink,
        width: innerW,
        align: theme.align,
        lineHeight: 1.12,
      });
      copyBox.y = nameY + nameH + cq(rect, 1.4);
      copyBox.h = Math.max(0, innerH - headerH - nameH - cq(rect, 1.4) - sigH - cq(rect, 1));
      drawCopy(doc, copyBox, rect, theme, fonts, input, true, undefined, true);
    } else {
      drawCopy(doc, copyBox, rect, theme, fonts, input, true, hang || theme.nameOverQr ? innerW : undefined);
    }
    drawShareText(doc, sigFont, ellipsize(sigFont, giver, sigSize, textW), textX, sigY, {
      size: sigSize,
      color: theme.accent,
      width: textW,
      align: theme.align,
      lineBreak: false,
    });
  }

  await drawQrFrame(doc, qrX, qrY, qrSize, qrPng, theme, input.scanLabel, fonts, hang);
  doc.restore();
}
