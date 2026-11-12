import JSZip from 'jszip';
import { MIGRATION_IMPORT_LIMITS, type MigrationFileRejectionReason } from '@iwana/shared';

/**
 * Lectura defensiva de un ZIP no confiable (ADR-110 D9; spec §1).
 *
 * - Rutas: rechaza absolutas, con unidad, con `\`, NUL, segmentos `.`/`..` o más de 255
 *   caracteres. Nunca se escribe en disco: las entradas viven en memoria con su ruta lógica.
 * - Enlaces simbólicos: rechazados por los bits Unix del directorio central.
 * - Bomba de compresión: límites de entradas, de tamaño declarado por entrada y total, de
 *   razón de compresión, y conteo real al descomprimir (el tamaño declarado puede mentir).
 */
export class SafeZipError extends Error {
  constructor(readonly code: MigrationFileRejectionReason) {
    super(code);
    this.name = 'SafeZipError';
  }
}

export interface SafeZipLimits {
  maxEntriesPerZip: number;
  maxEntryBytes: number;
  maxUncompressedBytesPerZip: number;
  maxCompressionRatio: number;
}

export const DEFAULT_SAFE_ZIP_LIMITS: SafeZipLimits = {
  maxEntriesPerZip: MIGRATION_IMPORT_LIMITS.maxEntriesPerZip,
  maxEntryBytes: MIGRATION_IMPORT_LIMITS.maxEntryBytes,
  maxUncompressedBytesPerZip: MIGRATION_IMPORT_LIMITS.maxUncompressedBytesPerZip,
  maxCompressionRatio: MIGRATION_IMPORT_LIMITS.maxCompressionRatio,
};

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const RATIO_THRESHOLD_BYTES = 1024 * 1024;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

export function hasZipMagic(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const head = buffer.subarray(0, 4);
  return head.equals(ZIP_MAGIC) || head.equals(ZIP_EMPTY_MAGIC);
}

/** Ruta lógica segura o `null`. Los directorios terminan en `/` y se aceptan igual. */
export function normalizeZipPath(name: string): string | null {
  if (!name || name.length > 255) return null;
  if (name.includes('\0') || name.includes('\\')) return null;
  if (name.startsWith('/') || /^[A-Za-z]:/u.test(name)) return null;
  const trimmed = name.endsWith('/') ? name.slice(0, -1) : name;
  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return trimmed;
}

interface JsZipInternalData {
  compressedSize?: number;
  uncompressedSize?: number;
}

function declaredSizes(entry: JSZip.JSZipObject): { compressed: number; uncompressed: number } {
  const data = (entry as unknown as { _data?: JsZipInternalData })._data;
  return {
    compressed: Number(data?.compressedSize ?? 0),
    uncompressed: Number(data?.uncompressedSize ?? 0),
  };
}

/** JSZip ≥3.8 resuelve `..` en `name`; la ruta original es la que se valida. */
function originalName(entry: JSZip.JSZipObject): string {
  const unsafe = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName;
  return typeof unsafe === 'string' ? unsafe : entry.name;
}

function entryPath(entry: JSZip.JSZipObject): string | null {
  const original = normalizeZipPath(originalName(entry));
  return original !== null && original === normalizeZipPath(entry.name) ? original : null;
}

function isSymlink(entry: JSZip.JSZipObject): boolean {
  const mode = entry.unixPermissions;
  return typeof mode === 'number' && (mode & S_IFMT) === S_IFLNK;
}

async function loadZip(buffer: Buffer): Promise<JSZip> {
  if (!hasZipMagic(buffer)) throw new SafeZipError('ZIP_INVALIDO');
  try {
    return await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  } catch {
    throw new SafeZipError('ZIP_INVALIDO');
  }
}

/**
 * Inspección sin descomprimir: estructura, rutas, enlaces y tamaños declarados. La usa la
 * subida para rechazar en el borde; el job vuelve a aplicar todo al leer.
 */
export async function inspectZip(
  buffer: Buffer,
  limits: SafeZipLimits = DEFAULT_SAFE_ZIP_LIMITS,
): Promise<{ entries: number }> {
  const zip = await loadZip(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > limits.maxEntriesPerZip) throw new SafeZipError('ZIP_DEMASIADAS_ENTRADAS');
  let total = 0;
  for (const entry of entries) {
    if (entryPath(entry) === null) throw new SafeZipError('ZIP_RUTA_NO_PERMITIDA');
    if (isSymlink(entry)) throw new SafeZipError('ZIP_ENLACE_SIMBOLICO');
    if (entry.dir) continue;
    const { compressed, uncompressed } = declaredSizes(entry);
    if (uncompressed > limits.maxEntryBytes) throw new SafeZipError('ZIP_DEMASIADO_GRANDE');
    if (
      uncompressed > RATIO_THRESHOLD_BYTES &&
      uncompressed / Math.max(compressed, 1) > limits.maxCompressionRatio
    ) {
      throw new SafeZipError('ZIP_COMPRESION_SOSPECHOSA');
    }
    total += uncompressed;
    if (total > limits.maxUncompressedBytesPerZip) throw new SafeZipError('ZIP_DEMASIADO_GRANDE');
  }
  return { entries: entries.length };
}

/** API interna de JSZip (no tipada): flujo de bytes descomprimidos con pausa. */
interface InternalStreamHelper {
  on(event: 'data', cb: (chunk: Uint8Array) => void): InternalStreamHelper;
  on(event: 'error', cb: (error: unknown) => void): InternalStreamHelper;
  on(event: 'end', cb: () => void): InternalStreamHelper;
  pause(): InternalStreamHelper;
  resume(): InternalStreamHelper;
}
interface InternalStreamEntry {
  internalStream(type: 'uint8array'): InternalStreamHelper;
}

/** Descomprime una entrada contando bytes reales; aborta al pasar el límite. */
function readBounded(entry: JSZip.JSZipObject, maxBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const stream = (entry as unknown as InternalStreamEntry).internalStream('uint8array');
    stream
      .on('data', (chunk: Uint8Array) => {
        if (settled) return;
        size += chunk.length;
        if (size > maxBytes) {
          settled = true;
          stream.pause();
          reject(new SafeZipError('ZIP_DEMASIADO_GRANDE'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      })
      .on('error', () => {
        if (settled) return;
        settled = true;
        reject(new SafeZipError('ZIP_INVALIDO'));
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks, size));
      })
      .resume();
  });
}

/**
 * Lee las entradas regulares en memoria con límites reales. Devuelve un mapa ruta →
 * contenido; los directorios se omiten. Con `select`, solo se descomprimen las rutas que
 * acepta (la inspección de estructura y tamaños declarados cubre igual todo el ZIP).
 */
export async function readZipEntries(
  buffer: Buffer,
  limits: SafeZipLimits = DEFAULT_SAFE_ZIP_LIMITS,
  select?: (path: string) => boolean,
): Promise<Map<string, Buffer>> {
  await inspectZip(buffer, limits);
  const zip = await loadZip(buffer);
  const result = new Map<string, Buffer>();
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = entryPath(entry);
    if (path === null) throw new SafeZipError('ZIP_RUTA_NO_PERMITIDA');
    // Las entradas no seleccionadas no se descomprimen (promoción: solo lo referenciado).
    if (select && !select(path)) continue;
    const remaining = limits.maxUncompressedBytesPerZip - total;
    const content = await readBounded(entry, Math.min(limits.maxEntryBytes, remaining));
    const { compressed } = declaredSizes(entry);
    if (
      content.length > RATIO_THRESHOLD_BYTES &&
      content.length / Math.max(compressed, 1) > limits.maxCompressionRatio
    ) {
      throw new SafeZipError('ZIP_COMPRESION_SOSPECHOSA');
    }
    total += content.length;
    result.set(path, content);
  }
  return result;
}
