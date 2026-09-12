import { validateMagicBytes } from './magic-bytes';

/** Rellena hasta la longitud mínima inspeccionable (12 bytes). */
function buffer(...bytes: number[]): Buffer {
  return Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, 16 - bytes.length))]);
}

const PNG = buffer(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = buffer(0xff, 0xd8, 0xff, 0xe0);
const ICO = buffer(0x00, 0x00, 0x01, 0x00, 0x01, 0x00);

function webp(riff: boolean): Buffer {
  const head = riff ? [0x52, 0x49, 0x46, 0x46] : [0x00, 0x00, 0x00, 0x00];
  return Buffer.concat([
    Buffer.from(head),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x57, 0x45, 0x42, 0x50]),
    Buffer.alloc(4),
  ]);
}

describe('validateMagicBytes', () => {
  it('acepta cada formato cuyo contenido coincide con el MIME declarado', () => {
    expect(validateMagicBytes(PNG, 'image/png')).toBe(true);
    expect(validateMagicBytes(JPEG, 'image/jpeg')).toBe(true);
    expect(validateMagicBytes(webp(true), 'image/webp')).toBe(true);
  });

  it('rechaza el contenido que no corresponde al MIME declarado', () => {
    // El caso que motivó la corrección: declarar PNG y enviar otra cosa para
    // que `image-size` elija un parser distinto del anunciado.
    expect(validateMagicBytes(JPEG, 'image/png')).toBe(false);
    expect(validateMagicBytes(PNG, 'image/jpeg')).toBe(false);
    expect(validateMagicBytes(buffer(0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c), 'image/png')).toBe(
      false,
    );
  });

  it('acepta los dos MIME de icono: el de facto y el registrado en IANA', () => {
    // Sin ambas entradas, activar la validación rompería los favicon legítimos
    // que `MEDIA_CONSTRAINTS` sí admite para el usage FAVICON.
    expect(validateMagicBytes(ICO, 'image/x-icon')).toBe(true);
    expect(validateMagicBytes(ICO, 'image/vnd.microsoft.icon')).toBe(true);
  });

  it('exige la cabecera RIFF en WebP: el patrón vive en el offset 8', () => {
    expect(validateMagicBytes(webp(false), 'image/webp')).toBe(false);
  });

  it('rechaza un MIME sin patrón conocido en vez de dejarlo pasar', () => {
    // La ausencia de firma no autoriza el archivo: quien añada un formato a un
    // allowlist debe añadir aquí su patrón, y el fallo se ve en vez de colarse.
    expect(validateMagicBytes(PNG, 'image/svg+xml')).toBe(false);
  });

  it('rechaza un buffer demasiado corto para ser inspeccionado', () => {
    expect(validateMagicBytes(Buffer.from([0x89, 0x50]), 'image/png')).toBe(false);
  });
});
