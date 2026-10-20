import { createGunzip } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { inflateRawSync } from 'node:zlib';

export type ArchiveFile = { path: string; data: Uint8Array };

export class PluginArchiveError extends Error {
  readonly code:
    | 'zip_slip'
    | 'absolute_path'
    | 'kernel_overwrite'
    | 'invalid_archive'
    | 'missing_manifest'
    | 'invalid_manifest'
    | 'unsafe_path'
    | 'path_conflict'
    | 'already_installed';
  constructor(
    code: PluginArchiveError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const STORED = 0;
const DEFLATE = 8;

function readU16(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function readU32(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

function normalizeArchivePath(raw: string): string {
  const trimmed = raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!trimmed || trimmed.endsWith('/')) return '';
  if (trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) {
    throw new PluginArchiveError('absolute_path', `Absolute path rejected: ${raw}`);
  }
  const parts: string[] = [];
  for (const part of trimmed.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      throw new PluginArchiveError('zip_slip', `Path escape rejected: ${raw}`);
    }
    parts.push(part);
  }
  const path = parts.join('/');
  if (path.startsWith('plugins/') || path === 'plugins' || /(^|\/)kernel(\/|$)/.test(path)) {
    throw new PluginArchiveError('kernel_overwrite', `Kernel overwrite rejected: ${raw}`);
  }
  return path;
}

export function extractZip(buffer: Uint8Array): ArchiveFile[] {
  const buf = Buffer.from(buffer);
  const files: ArchiveFile[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = readU32(buf, offset);
    if (sig === CENTRAL_SIG) break;
    if (sig !== LOCAL_SIG) {
      if (files.length === 0) throw new PluginArchiveError('invalid_archive', 'Not a zip archive.');
      break;
    }
    const flags = readU16(buf, offset + 6);
    const method = readU16(buf, offset + 8);
    const compressedSize = readU32(buf, offset + 18);
    const nameLen = readU16(buf, offset + 26);
    const extraLen = readU16(buf, offset + 28);
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    if (flags & 0x0008) {
      throw new PluginArchiveError('invalid_archive', 'Zip data descriptors are not supported.');
    }
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.length) throw new PluginArchiveError('invalid_archive', 'Truncated zip entry.');
    const path = normalizeArchivePath(name);
    offset = dataEnd;
    if (!path) continue;
    const compressed = buf.subarray(dataStart, dataEnd);
    let data: Uint8Array;
    if (method === STORED) data = compressed;
    else if (method === DEFLATE) data = inflateRawSync(compressed);
    else throw new PluginArchiveError('invalid_archive', `Unsupported zip method ${method}.`);
    files.push({ path, data });
  }
  if (files.length === 0) throw new PluginArchiveError('invalid_archive', 'Empty zip archive.');
  return files;
}

function parseTar(buffer: Buffer): ArchiveFile[] {
  const files: ArchiveFile[] = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0+$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0+$/, '').trim(), 8);
    const type = String.fromCharCode(header[156] ?? 0);
    offset += 512;
    const data = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (!rawName || (type !== '0' && type !== '\0' && type !== '')) continue;
    const path = normalizeArchivePath(rawName);
    if (!path) continue;
    files.push({ path, data: Uint8Array.from(data) });
  }
  if (files.length === 0) throw new PluginArchiveError('invalid_archive', 'Empty tar archive.');
  return files;
}

export async function extractTarGz(buffer: Uint8Array): Promise<ArchiveFile[]> {
  const gunzip = createGunzip();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gunzip.on('end', () => resolve());
    gunzip.on('error', reject);
    gunzip.end(Buffer.from(buffer));
  });
  return parseTar(Buffer.concat(chunks));
}

export async function extractPluginArchive(buffer: Uint8Array, filename: string): Promise<ArchiveFile[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) return extractTarGz(buffer);
  if (lower.endsWith('.zip')) return extractZip(buffer);
  throw new PluginArchiveError('invalid_archive', 'Archive must be .zip or .tgz.');
}

/** Build a stored-method zip. Used by tests (including zip-slip cases). */
export function buildStoredZip(entries: Array<{ path: string; data: Uint8Array }>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const data = Buffer.from(entry.data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(STORED, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, end]);
}

function archiveHasPluginPackage(files: ArchiveFile[], path: string): boolean {
  const file = files.find((entry) => entry.path === path);
  if (!file) return false;
  try {
    const raw = JSON.parse(Buffer.from(file.data).toString('utf8')) as unknown;
    return Boolean(
      raw &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        (raw as { tuucho?: unknown }).tuucho &&
        typeof (raw as { tuucho?: unknown }).tuucho === 'object',
    );
  } catch {
    return false;
  }
}

export function flattenArchiveRoot(files: ArchiveFile[]): ArchiveFile[] {
  const prefixes = new Set(
    files.map((file) => file.path.split('/')[0]).filter((part): part is string => Boolean(part)),
  );
  if (prefixes.size !== 1) return files;
  const root = [...prefixes][0]!;
  if (archiveHasPluginPackage(files, 'package.json')) return files;
  if (!archiveHasPluginPackage(files, `${root}/package.json`)) return files;
  return files
    .filter((file) => file.path.startsWith(`${root}/`) && file.path.length > root.length + 1)
    .map((file) => ({ path: file.path.slice(root.length + 1), data: file.data }));
}
