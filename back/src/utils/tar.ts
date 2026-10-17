/** Minimal streaming tar (ustar) writer/reader.
 *
 * A database backup bundles a manifest, the per-table data files and the whole
 * media tree — several gigabytes of already-compressed JPEG/WebP — so it is
 * written as a plain `.tar`: only the data files are gzipped, individually,
 * before being added. Gzipping the archive as a whole would burn CPU on the
 * shared host for nothing.
 *
 * Long paths (product media lives under UUID directories) go out as a pax
 * extended header rather than being truncated by ustar's 100-byte name field.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';

const BLOCK = 512;

function padTo(size: number): number {
  const remainder = size % BLOCK;
  return remainder === 0 ? 0 : BLOCK - remainder;
}

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

/** ustar can carry a name in `prefix`(155) + `name`(100), split on a `/`.
 * Returns null when the path cannot be represented that way — the caller then
 * emits a pax header instead. */
function splitUstarName(path: string): { name: string; prefix: string } | null {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  const parts = path.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    const prefix = parts.slice(0, index).join('/');
    const name = parts.slice(index).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  return null;
}

function header(path: string, size: number, mtimeSeconds: number, typeflag: string, prefix = ''): Buffer {
  const block = Buffer.alloc(BLOCK, 0);
  block.write(path, 0, 100, 'utf8');
  block.write(octal(0o644, 8), 100, 8, 'ascii');
  block.write(octal(0, 8), 108, 8, 'ascii');
  block.write(octal(0, 8), 116, 8, 'ascii');
  block.write(octal(size, 12), 124, 12, 'ascii');
  block.write(octal(Math.floor(mtimeSeconds), 12), 136, 12, 'ascii');
  block.write('        ', 148, 8, 'ascii');
  block.write(typeflag, 156, 1, 'ascii');
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');
  if (prefix) block.write(prefix, 345, 155, 'utf8');

  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(octal(checksum, 8), 148, 8, 'ascii');
  return block;
}

function write(out: Writable, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    out.write(chunk, (error) => (error ? reject(error) : resolve()));
  });
}

async function writeHeader(out: Writable, path: string, size: number, mtimeSeconds: number): Promise<void> {
  const split = splitUstarName(path);
  if (split) {
    await write(out, header(split.name, size, mtimeSeconds, '0', split.prefix));
    return;
  }
  // pax extended header: one record `<len> path=<path>\n`, self-sizing.
  const suffix = ` path=${path}\n`;
  let length = Buffer.byteLength(suffix) + 1;
  while (Buffer.byteLength(String(length)) + Buffer.byteLength(suffix) !== length) {
    length = Buffer.byteLength(String(length)) + Buffer.byteLength(suffix);
  }
  const record = Buffer.from(`${length}${suffix}`, 'utf8');
  await write(out, header('././@PaxHeader', record.length, mtimeSeconds, 'x'));
  await write(out, record);
  await write(out, Buffer.alloc(padTo(record.length), 0));
  // The ustar header that follows still needs a usable name for readers that
  // ignore pax; a truncated tail is fine, the pax record is authoritative.
  await write(out, header(path.slice(-100), size, mtimeSeconds, '0'));
}

export class TarWriter {
  private readonly out: Writable;
  private readonly done: Promise<void>;

  constructor(filePath: string) {
    this.out = createWriteStream(filePath);
    this.done = new Promise((resolve, reject) => {
      this.out.on('error', reject);
      this.out.on('close', resolve);
    });
  }

  async addBuffer(path: string, content: Buffer, mtime = new Date()): Promise<void> {
    await writeHeader(this.out, path, content.length, mtime.getTime() / 1000);
    await write(this.out, content);
    const padding = padTo(content.length);
    if (padding > 0) await write(this.out, Buffer.alloc(padding, 0));
  }

  /** Streams a file from disk — never loads a media file into memory. */
  async addFile(path: string, sourcePath: string): Promise<void> {
    const info = await stat(sourcePath);
    await writeHeader(this.out, path, info.size, info.mtimeMs / 1000);
    // Not pipeline(..., { end: false }): it leaves its listeners on the shared
    // output, one set per file, which leaks and trips MaxListenersExceeded.
    for await (const chunk of createReadStream(sourcePath)) await write(this.out, chunk as Buffer);
    const padding = padTo(info.size);
    if (padding > 0) await write(this.out, Buffer.alloc(padding, 0));
  }

  async close(): Promise<void> {
    await write(this.out, Buffer.alloc(BLOCK * 2, 0));
    this.out.end();
    await this.done;
  }
}

export type TarEntry = { path: string; size: number; offset: number };

/** Header fields are NUL-padded fixed-width blocks; everything from the first
 * NUL on is padding. */
function trimField(field: Buffer): string {
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

/** Walks the archive's headers without reading any payload. Positional reads
 * keep this simple and let the caller extract only the entries it wants. */
export async function listTarEntries(archivePath: string): Promise<TarEntry[]> {
  const handle = await open(archivePath, 'r');
  try {
    const entries: TarEntry[] = [];
    const block = Buffer.alloc(BLOCK);
    let position = 0;
    let paxPath: string | undefined;

    for (;;) {
      const { bytesRead } = await handle.read(block, 0, BLOCK, position);
      if (bytesRead < BLOCK) break;
      if (block.every((byte) => byte === 0)) break;

      const rawName = trimField(block.subarray(0, 100));
      const prefix = trimField(block.subarray(345, 500));
      const sizeField = trimField(block.subarray(124, 136)).trim();
      const size = Number.parseInt(sizeField || '0', 8);
      const typeflag = block.subarray(156, 157).toString('ascii');
      const dataOffset = position + BLOCK;

      if (typeflag === 'x') {
        const record = Buffer.alloc(size);
        await handle.read(record, 0, size, dataOffset);
        const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(record.toString('utf8'));
        paxPath = match?.[1];
      } else if (typeflag === '0' || typeflag === '\0') {
        entries.push({
          path: paxPath ?? (prefix ? `${prefix}/${rawName}` : rawName),
          size,
          offset: dataOffset,
        });
        paxPath = undefined;
      } else {
        paxPath = undefined;
      }

      position = dataOffset + size + padTo(size);
    }
    return entries;
  } finally {
    await handle.close();
  }
}

export async function readTarEntry(archivePath: string, entry: TarEntry): Promise<Buffer> {
  const handle = await open(archivePath, 'r');
  try {
    const buffer = Buffer.alloc(entry.size);
    if (entry.size > 0) await handle.read(buffer, 0, entry.size, entry.offset);
    return buffer;
  } finally {
    await handle.close();
  }
}

export async function extractTarEntry(
  archivePath: string,
  entry: TarEntry,
  targetPath: string,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  if (entry.size === 0) {
    await writeFile(targetPath, '');
    return;
  }
  await pipeline(
    createReadStream(archivePath, { start: entry.offset, end: entry.offset + entry.size - 1 }),
    createWriteStream(targetPath),
  );
}
