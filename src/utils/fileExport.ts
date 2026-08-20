/**
 * Saves binary API export responses directly to the device Downloads folder.
 * No share sheet — Android uses MediaStore Downloads; iOS uses Documents.
 *
 * RN axios may return ArrayBuffer, Uint8Array, number[], or a string
 * (binary or base64) for `responseType: 'arraybuffer'` — normalize all.
 */

/* eslint-disable no-bitwise */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const EXPORT_DIR = `${RNFS.DocumentDirectoryPath}/exports`;
const EXPORT_RETENTION_DAYS = 7;

async function ensureExportDirectory(): Promise<void> {
  if (!(await RNFS.exists(EXPORT_DIR))) {
    await RNFS.mkdir(EXPORT_DIR);
  }
}

export async function purgeOldExports(): Promise<void> {
  if (!(await RNFS.exists(EXPORT_DIR))) {
    return;
  }

  const cutoff =
    Date.now() - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const files = await RNFS.readDir(EXPORT_DIR);

  await Promise.all(
    files
      .filter(file => file.isFile() && file.mtime)
      .filter(file => new Date(file.mtime!).getTime() < cutoff)
      .map(file => RNFS.unlink(file.path).catch(() => undefined)),
  );
}

/** Encode bytes without String.fromCharCode spread (avoids stack overflows on large exports). */
function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result += BASE64_CHARS.charAt((bitmap >> 18) & 63);
    result += BASE64_CHARS.charAt((bitmap >> 12) & 63);
    result += i + 1 < len ? BASE64_CHARS.charAt((bitmap >> 6) & 63) : '=';
    result += i + 2 < len ? BASE64_CHARS.charAt(bitmap & 63) : '=';
  }
  return result;
}

function binaryStringToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

function looksLikeBase64(value: string): boolean {
  const trimmed = value.replace(/\s/g, '');
  if (trimmed.length < 8 || trimmed.length % 4 !== 0) return false;
  if (trimmed.startsWith('PK') || trimmed.startsWith('%PDF')) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
}

function looksLikeJsonError(preview: string): boolean {
  const trimmed = preview.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function decodeJsonError(text: string, fallback: string): Error {
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return new Error(parsed.message || parsed.error || fallback);
  } catch {
    return new Error(text.slice(0, 200) || fallback);
  }
}

/** Coerce any axios binary payload into raw bytes. */
function toUint8Array(data: unknown): Uint8Array {
  if (data == null) {
    throw new Error('Export returned an empty file.');
  }

  if (typeof data === 'string') {
    if (!data.length) {
      throw new Error('Export returned an empty file.');
    }
    if (looksLikeJsonError(data)) {
      throw decodeJsonError(data, 'Export failed on the server.');
    }
    if (looksLikeBase64(data)) {
      const binary = globalThis.atob
        ? globalThis.atob(data.replace(/\s/g, ''))
        : null;
      if (binary) return binaryStringToBytes(binary);
    }
    return binaryStringToBytes(data);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (Array.isArray(data)) {
    return Uint8Array.from(data as number[]);
  }

  throw new Error('Export returned an unsupported file format.');
}

function toBase64(data: unknown): string {
  if (typeof data === 'string' && looksLikeBase64(data) && !looksLikeJsonError(data)) {
    return data.replace(/\s/g, '');
  }
  const bytes = toUint8Array(data);
  if (bytes.byteLength === 0) {
    throw new Error('Export returned an empty file.');
  }
  const previewLen = Math.min(bytes.byteLength, 64);
  let preview = '';
  for (let i = 0; i < previewLen; i += 1) {
    preview += String.fromCharCode(bytes[i]);
  }
  if (looksLikeJsonError(preview)) {
    const textLen = Math.min(bytes.byteLength, 4000);
    let text = '';
    for (let i = 0; i < textLen; i += 1) {
      text += String.fromCharCode(bytes[i]);
    }
    throw decodeJsonError(text, 'Export failed on the server.');
  }
  return bytesToBase64(bytes);
}

/** Vehicles.xlsx → Vehicles_1715689200123.xlsx so repeat exports never collide. */
function uniqueExportFilename(filename: string): string {
  const safeName = filename.replace(/[^\w.-]/g, '_');
  const stamp = Date.now();
  const dot = safeName.lastIndexOf('.');
  if (dot <= 0) return `${safeName}_${stamp}`;
  return `${safeName.slice(0, dot)}_${stamp}${safeName.slice(dot)}`;
}

async function writeFileOverwrite(path: string, base64: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  } catch {
    // Continue — writeFile may still succeed even if unlink failed.
  }
  await RNFS.writeFile(path, base64, 'base64');
}



/**
 * Writes export bytes straight to Downloads (Android) or Documents (iOS).
 * Returns a short location label for success messaging.
 */
export async function downloadBinaryFile(
  data: unknown,
  filename: string,
  mimeType: string,
): Promise<string> {
  const base64 = toBase64(data);
  const safeName = uniqueExportFilename(filename);

  await ensureExportDirectory();

  const path = `${EXPORT_DIR}/${safeName}`;

  await writeFileOverwrite(path, base64);

  return path;
}

/** Guess image MIME from the URL / filename so MediaStore indexes Downloads correctly. */
function guessImageMimeType(urlOrName: string): string {
  const pathPart = urlOrName.split('?')[0]?.toLowerCase() ?? '';
  if (pathPart.endsWith('.png')) return 'image/png';
  if (pathPart.endsWith('.gif')) return 'image/gif';
  if (pathPart.endsWith('.webp')) return 'image/webp';
  if (pathPart.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

/**
 * Download a remote image into public Downloads (Android MediaStore) or Documents (iOS).
 * Avoids writing straight to DownloadDirectoryPath — that fails on Android 10+ scoped storage.
 */
export async function downloadRemoteUrlToDownloads(
  url: string,
  filename: string,
): Promise<string> {
  const safeName =
    filename.replace(/[^\w\.-]/g, '_') ||
    `notification_${Date.now()}.jpg`;

  const mimeType = guessImageMimeType(filename || url);

  const tempPath =
    `${RNFS.CachesDirectoryPath}/${Date.now()}_${safeName}`;

  const result = await RNFS.downloadFile({
    fromUrl: url,
    toFile: tempPath,
  }).promise;

  if (result.statusCode && result.statusCode >= 400) {
    try {
      await RNFS.unlink(tempPath);
    } catch {
      // Temp cleanup is best-effort
    }

    throw new Error(`Download failed (${result.statusCode})`);
  }

  try {
    const base64 = await RNFS.readFile(tempPath, 'base64');

    if (!base64) {
      throw new Error('Downloaded image was empty.');
    }

    await ensureExportDirectory();

    const path = `${EXPORT_DIR}/${safeName}`;

    await writeFileOverwrite(path, base64);

    return path;
  } finally {
    try {
      if (await RNFS.exists(tempPath)) {
        await RNFS.unlink(tempPath);
      }
    } catch {
      // Temp cleanup is best-effort
    }
  }
}
