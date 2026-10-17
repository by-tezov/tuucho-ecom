import { inflateRawSync, inflateSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import sharp from 'sharp';
import type { DevMail } from './mail.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function giftShareCardPdfPath(mail: DevMail): string {
  return mail.path.replace(/\.html$/i, '.pdf');
}

export function giftShareCardJpegPath(mail: DevMail): string {
  return mail.path.replace(/\.html$/i, '.jpg');
}

export function expectGiftShareCardPdf(mail: DevMail): string {
  const pdfPath = giftShareCardPdfPath(mail);
  if (!existsSync(pdfPath)) throw new Error(`missing share-card PDF next to ${mail.path}`);
  const header = readFileSync(pdfPath).subarray(0, 5).toString('latin1');
  if (!header.startsWith('%PDF')) throw new Error(`share-card dump is not a PDF: ${pdfPath}`);
  return pdfPath;
}

export async function expectGiftShareCardJpeg(mail: DevMail): Promise<string> {
  const jpegPath = giftShareCardJpegPath(mail);
  if (!existsSync(jpegPath)) throw new Error(`missing share-card JPEG next to ${mail.path}`);
  const header = readFileSync(jpegPath).subarray(0, 3);
  if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
    throw new Error(`share-card dump is not a JPEG: ${jpegPath}`);
  }
  const meta = await sharp(jpegPath).metadata();
  if (meta.width !== 1500 || meta.height !== 900) {
    throw new Error(`share-card JPEG is ${meta.width}x${meta.height}, expected 1500x900: ${jpegPath}`);
  }
  return jpegPath;
}

async function rawRgba(pipeline: sharp.Sharp): Promise<{ data: Buffer; info: { width: number; height: number } }> {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`expected RGBA, got ${info.channels} channels`);
  }
  return { data, info };
}

function decodeQrPixels(data: Buffer, width: number, height: number): string | null {
  const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data ?? null;
}

export async function decodeQrFromJpeg(jpegPath: string): Promise<string> {
  const variants: Array<() => Promise<{ data: Buffer; info: { width: number; height: number } }>> = [
    async () => rawRgba(sharp(jpegPath)),
    async () => rawRgba(sharp(jpegPath).extract({ left: 0, top: 0, width: 700, height: 900 })),
    async () => rawRgba(sharp(jpegPath).extract({ left: 800, top: 0, width: 700, height: 900 })),
    async () => rawRgba(sharp(jpegPath).extract({ left: 0, top: 350, width: 1500, height: 550 })),
    async () =>
      rawRgba(sharp(jpegPath).grayscale().toColorspace('srgb').linear(1.4, -(128 * 0.4))),
  ];
  for (const load of variants) {
    try {
      const { data, info } = await load();
      const decoded = decodeQrPixels(data, info.width, info.height);
      if (decoded) return decoded;
    } catch {
      // Crop can miss a layout; try the next variant.
    }
  }
  throw new Error(`could not decode gift QR from JPEG ${jpegPath}`);
}

/** Share-card mail: PDF + JPEG dumps, no PIN or receiver URL in the body,
 *  and the JPEG QR is the live receiver link. */
export async function expectGiftShareCardMail(
  mail: DevMail,
  opts: { pin: string; receiverUrl: string },
): Promise<{ jpegPath: string; pdfPath: string }> {
  const html = mail.html.replaceAll('&#x3D;', '=').replaceAll('&amp;', '&');
  if (!/un PDF et un JPG/i.test(html)) {
    throw new Error(`share-card mail does not mention PDF and JPG: ${mail.path}`);
  }
  if (html.includes(opts.pin)) throw new Error(`PIN leaked in share-card mail ${mail.path}`);
  if (html.includes(opts.receiverUrl)) {
    throw new Error(`receiver URL leaked in share-card mail body ${mail.path}`);
  }
  const pdfPath = expectGiftShareCardPdf(mail);
  const jpegPath = await expectGiftShareCardJpeg(mail);
  const fromJpeg = await decodeQrFromJpeg(jpegPath);
  if (fromJpeg !== opts.receiverUrl) {
    throw new Error(`JPEG QR is ${fromJpeg}, expected ${opts.receiverUrl}`);
  }
  return { jpegPath, pdfPath };
}

function pngFromDataUri(uri: string): Buffer {
  const match = uri.match(/^data:image\/png;base64,(.+)$/i);
  if (!match?.[1]) throw new Error('QR is not a PNG data URI');
  return Buffer.from(match[1], 'base64');
}

export async function decodeQrFromPng(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
  if (!result?.data) throw new Error('could not decode gift QR');
  return result.data;
}

export async function decodeQrFromDataUri(uri: string): Promise<string> {
  return decodeQrFromPng(pngFromDataUri(uri));
}

function pngSlice(bytes: Buffer, start: number): Buffer | null {
  const iend = bytes.indexOf(Buffer.from('IEND'), start);
  if (iend < 0) return null;
  return bytes.subarray(start, iend + 8);
}

async function decodeEmbeddedPng(bytes: Buffer): Promise<string | null> {
  let from = 0;
  while (from < bytes.length) {
    const start = bytes.indexOf(PNG_SIGNATURE, from);
    if (start < 0) return null;
    const png = pngSlice(bytes, start);
    if (png) {
      try {
        return await decodeQrFromPng(png);
      } catch {
        // Keep scanning later PNG signatures in the same buffer.
      }
    }
    from = start + 1;
  }
  return null;
}

function inflatePdfStream(payload: Buffer): Buffer | null {
  try {
    return inflateSync(payload);
  } catch {
    try {
      return inflateRawSync(payload);
    } catch {
      return null;
    }
  }
}

function* pdfStreamPayloads(bytes: Buffer): Generator<Buffer> {
  const startTag = Buffer.from('stream');
  const endTag = Buffer.from('endstream');
  let pos = 0;
  while (pos < bytes.length) {
    const start = bytes.indexOf(startTag, pos);
    if (start < 0) return;
    let dataStart = start + startTag.length;
    if (bytes[dataStart] === 0x0d) dataStart += 1;
    if (bytes[dataStart] === 0x0a) dataStart += 1;
    const end = bytes.indexOf(endTag, dataStart);
    if (end < 0) return;
    let dataEnd = end;
    if (bytes[dataEnd - 1] === 0x0a) dataEnd -= 1;
    if (bytes[dataEnd - 1] === 0x0d) dataEnd -= 1;
    yield bytes.subarray(dataStart, dataEnd);
    pos = end + endTag.length;
  }
}

/** Best-effort: pdfkit may store the QR PNG raw or Flate-compressed. */
export async function tryDecodeQrFromPdf(pdfPath: string): Promise<string | null> {
  const bytes = readFileSync(pdfPath);
  const raw = await decodeEmbeddedPng(bytes);
  if (raw) return raw;
  for (const payload of pdfStreamPayloads(bytes)) {
    const inflated = inflatePdfStream(payload);
    if (!inflated) continue;
    const decoded = await decodeEmbeddedPng(inflated);
    if (decoded) return decoded;
  }
  return null;
}

export async function decodeQrFromShareCardPdf(pdfPath: string): Promise<string> {
  const decoded = await tryDecodeQrFromPdf(pdfPath);
  if (!decoded) throw new Error(`could not decode gift QR from ${pdfPath}`);
  return decoded;
}
