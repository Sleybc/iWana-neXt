/**
 * Archivos sintéticos mínimos para las pruebas de adjuntos de tickets (spec MOD09 adjuntos §6).
 * Generados en la prueba: nunca adjuntos reales de clientes.
 */

/** PNG 1×1 transparente. */
export function syntheticPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
}

/** PDF mínimo sin páginas. */
export function syntheticPdf(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'latin1',
  );
}

/** MP4 mínimo: caja `ftyp` (isom, compatibles iso2/mp41) y una caja `mdat` vacía. */
export function syntheticMp4(): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'latin1');
  ftyp.write('isom', 8, 'latin1');
  ftyp.writeUInt32BE(0x200, 12);
  ftyp.write('iso2', 16, 'latin1');
  ftyp.write('mp41', 20, 'latin1');
  const mdat = Buffer.alloc(16);
  mdat.writeUInt32BE(16, 0);
  mdat.write('mdat', 4, 'latin1');
  return Buffer.concat([ftyp, mdat]);
}

/** Cabecera MZ de ejecutable seguida de texto: no tiene ninguna firma admitida. */
export function syntheticFakeExecutable(): Buffer {
  return Buffer.concat([
    Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
    Buffer.from('programa sintetico de prueba'),
  ]);
}
