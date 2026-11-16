/**
 * Validación de MIME por contenido real (magic bytes).
 *
 * Por qué existe como módulo propio: el `mimetype` de un archivo multipart lo
 * declara el cliente, no el servidor. Validar solo contra esa cadena permite
 * declarar `image/png` y enviar bytes de cualquier otro formato — y las
 * librerías que despachan su parser por contenido, como `image-size`, acaban
 * ejecutando el decodificador equivocado. `image-size` arrastra avisos de DoS
 * sin versión parcheada, así que la defensa aplicable es no llegar a llamarlo
 * con un buffer cuyo formato real no se ha comprobado.
 *
 * La lógica vivía duplicada —y solo— en `evidence-asset.provider.ts`, mientras
 * la ruta de branding de `media.service.ts` validaba únicamente el MIME
 * declarado. Vive aquí para que ambas compartan la misma comprobación.
 */

interface MagicBytePattern {
  mime: string;
  offset: number;
  bytes: number[];
}

const MAGIC_BYTES: readonly MagicBytePattern[] = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // Cabecera ICONDIR: reservado (0x0000) + tipo 1 = icono. Los dos MIME son el
  // mismo formato: `image/x-icon` es el de facto y `image/vnd.microsoft.icon`
  // el registrado en IANA; los navegadores emiten uno u otro. Sin estas dos
  // entradas, los favicon legítimos —que `MEDIA_CONSTRAINTS` sí admite— serían
  // rechazados al activar la validación.
  { mime: 'image/x-icon', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
  { mime: 'image/vnd.microsoft.icon', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
];

/** Longitud mínima para poder inspeccionar cualquiera de los patrones. */
const MIN_INSPECTABLE_BYTES = 12;

/**
 * Comprueba que el contenido del buffer corresponde al MIME declarado.
 *
 * Devuelve `false` cuando el MIME no tiene patrón conocido: la ausencia de
 * patrón no autoriza el archivo. Quien añada un formato nuevo a un allowlist
 * debe añadir aquí su firma, y el fallo será visible en vez de silencioso.
 */
export function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.length < MIN_INSPECTABLE_BYTES) {
    return false;
  }

  if (declaredMime === 'video/mp4') {
    return isMp4(buffer);
  }

  for (const pattern of MAGIC_BYTES) {
    if (pattern.mime !== declaredMime) {
      continue;
    }
    if (buffer.length < pattern.offset + pattern.bytes.length) {
      continue;
    }

    const matches = pattern.bytes.every((byte, index) => buffer[pattern.offset + index] === byte);
    if (!matches) {
      continue;
    }

    // WebP: el patrón vive en el offset 8, dentro de un contenedor RIFF. Sin
    // comprobar la cabecera, cualquier archivo con «WEBP» en esa posición
    // pasaría.
    if (declaredMime === 'image/webp') {
      const isRiff =
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
      if (!isRiff) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Marcas ISO BMFF de video MP4 admitidas (caja `ftyp`, spec MOD09 adjuntos §2.1). QuickTime
 * (`qt  `), 3GPP y las imágenes HEIF/AVIF comparten el contenedor, pero no son MP4.
 */
const MP4_BRANDS: ReadonlySet<string> = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso7',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'mmp4',
  'MSNV',
]);

/** Marcas principales que nunca son MP4 aunque declaren una marca compatible. */
const NON_MP4_MAJOR_BRANDS: ReadonlySet<string> = new Set([
  'qt  ',
  'heic',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
  'avif',
  'avis',
  'crx ',
]);

/** Tamaño máximo razonable de la caja `ftyp` (marca + versión + compatibles). */
const MP4_FTYP_MAX_BYTES = 1024;

/**
 * MP4 por la caja `ftyp` en el offset 4: tamaño big-endian coherente (≥ 16, múltiplo de 4,
 * dentro del buffer) y una marca MP4 admitida, principal o compatible.
 */
function isMp4(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.toString('latin1', 4, 8) !== 'ftyp') return false;
  const size = buffer.readUInt32BE(0);
  if (size < 16 || size > MP4_FTYP_MAX_BYTES || size % 4 !== 0 || size > buffer.length) {
    return false;
  }
  const major = buffer.toString('latin1', 8, 12);
  if (MP4_BRANDS.has(major)) return true;
  if (NON_MP4_MAJOR_BRANDS.has(major)) return false;
  for (let offset = 16; offset + 4 <= size; offset += 4) {
    if (MP4_BRANDS.has(buffer.toString('latin1', offset, offset + 4))) return true;
  }
  return false;
}

/**
 * Tipo real del contenido entre los candidatos, o `null` si ninguno coincide. Lo usan los
 * flujos que deciden el tipo por la firma y no por lo que declara el cliente.
 */
export function detectMagicMime(buffer: Buffer, candidates: readonly string[]): string | null {
  return candidates.find((candidate) => validateMagicBytes(buffer, candidate)) ?? null;
}
