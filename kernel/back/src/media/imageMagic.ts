import { open } from 'node:fs/promises';

/** Declared MIME must match magic bytes. Sharp remains the final decoder. */
const SNIFFERS: ReadonlyArray<{ mime: string; match: (header: Buffer) => boolean }> = [
  {
    mime: 'image/jpeg',
    match: (header) => header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
  },
  {
    mime: 'image/png',
    match: (header) =>
      header.length >= 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47 &&
      header[4] === 0x0d &&
      header[5] === 0x0a &&
      header[6] === 0x1a &&
      header[7] === 0x0a,
  },
  {
    mime: 'image/webp',
    match: (header) =>
      header.length >= 12 &&
      header.subarray(0, 4).toString('ascii') === 'RIFF' &&
      header.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/gif',
    match: (header) => {
      if (header.length < 6) return false;
      const sig = header.subarray(0, 6).toString('ascii');
      return sig === 'GIF87a' || sig === 'GIF89a';
    },
  },
];

function sniffImageMime(header: Buffer): string | undefined {
  for (const sniffer of SNIFFERS) {
    if (sniffer.match(header)) return sniffer.mime;
  }
  return undefined;
}

/** Read the first bytes of a temp upload and ensure magic matches declared MIME. */
export async function assertUploadedImageMagic(file: {
  path?: string;
  buffer?: Buffer;
  mimetype: string;
}): Promise<void> {
  let header: Buffer;
  if (file.buffer && file.buffer.length > 0) {
    header = file.buffer.subarray(0, 16);
  } else if (file.path) {
    const handle = await open(file.path, 'r');
    try {
      const buf = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buf, 0, 16, 0);
      header = buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } else {
    throw new Error('invalid_type');
  }

  const sniffed = sniffImageMime(header);
  if (!sniffed || sniffed !== file.mimetype) {
    throw new Error('invalid_type');
  }
}
