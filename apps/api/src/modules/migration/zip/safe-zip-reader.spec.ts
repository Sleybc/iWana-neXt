import JSZip from 'jszip';
import { buildSyntheticUispZip } from '../test/uisp-zip.fixture';
import {
  DEFAULT_SAFE_ZIP_LIMITS,
  SafeZipError,
  hasZipMagic,
  inspectZip,
  normalizeZipPath,
  readZipEntries,
} from './safe-zip-reader';

async function zipWith(
  files: Array<{ name: string; content: string | Buffer; unixPermissions?: number }>,
  platform: 'DOS' | 'UNIX' = 'DOS',
): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content, {
      ...(file.unixPermissions !== undefined ? { unixPermissions: file.unixPermissions } : {}),
      createFolders: false,
    });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform });
}

/** Reescribe el tamaño descomprimido declarado (cabecera local y directorio central). */
function lieAboutSize(buffer: Buffer, declared: number): Buffer {
  const copy = Buffer.from(buffer);
  for (let offset = 0; offset < copy.length - 4; offset += 1) {
    const signature = copy.readUInt32LE(offset);
    if (signature === 0x04034b50) copy.writeUInt32LE(declared, offset + 22);
    if (signature === 0x02014b50) copy.writeUInt32LE(declared, offset + 24);
  }
  return copy;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ACEPTADO';
  } catch (error) {
    return error instanceof SafeZipError ? error.code : `OTRO:${String(error)}`;
  }
}

describe('safe-zip-reader — ZIP no confiable (ADR-110 D9)', () => {
  it('lee el ZIP sintético con la forma de §1', async () => {
    const entries = await readZipEntries(await buildSyntheticUispZip());
    expect([...entries.keys()].sort()).toEqual(
      [
        'client.json',
        'documents/contrato-firmado.pdf',
        'documents/foto-fachada.jpg',
        'invoices.json',
        'invoices/900101.pdf',
        'invoices/900102.pdf',
        'jobs.json',
        'payment_plans.json',
        'payments.json',
        'quotes.json',
        'refunds.json',
        'services.json',
        'tickets.json',
        'tickets/90010001/adjunto.txt',
      ].sort(),
    );
  });

  it.each([
    ['../escape.txt'],
    ['a/../../escape.txt'],
    ['/etc/passwd'],
    ['C:/Windows/win.ini'],
    ['a\\..\\escape.txt'],
    ['./client.json'],
    ['a//b.txt'],
    [`${'a'.repeat(256)}.txt`],
  ])('rechaza la ruta %s', (name) => {
    expect(normalizeZipPath(name)).toBeNull();
  });

  it('acepta rutas relativas normales y directorios', () => {
    expect(normalizeZipPath('tickets/12/adjunto.txt')).toBe('tickets/12/adjunto.txt');
    expect(normalizeZipPath('documents/')).toBe('documents');
  });

  it.each([['../../fuera.txt'], ['/etc/passwd'], ['docs/../../fuera.txt']])(
    'rechaza un ZIP con la entrada %s sin descomprimir nada',
    async (name) => {
      const zip = await zipWith([
        { name: 'client.json', content: '{"id":1}' },
        { name, content: 'x' },
      ]);
      expect(await codeOf(inspectZip(zip))).toBe('ZIP_RUTA_NO_PERMITIDA');
      expect(await codeOf(readZipEntries(zip))).toBe('ZIP_RUTA_NO_PERMITIDA');
    },
  );

  it('rechaza enlaces simbólicos', async () => {
    const zip = await zipWith(
      [{ name: 'enlace', content: '/etc/passwd', unixPermissions: 0o120777 }],
      'UNIX',
    );
    expect(await codeOf(inspectZip(zip))).toBe('ZIP_ENLACE_SIMBOLICO');
  });

  it('rechaza una bomba de compresión por razón declarada', async () => {
    const zip = await zipWith([{ name: 'ceros.bin', content: Buffer.alloc(20 * 1024 * 1024) }]);
    expect(await codeOf(inspectZip(zip))).toBe('ZIP_COMPRESION_SOSPECHOSA');
  });

  it('cuenta los bytes reales cuando el tamaño declarado miente', async () => {
    const honest = await zipWith([{ name: 'ceros.bin', content: Buffer.alloc(3 * 1024 * 1024) }]);
    const lying = lieAboutSize(honest, 10);
    const limits = { ...DEFAULT_SAFE_ZIP_LIMITS, maxEntryBytes: 1024 * 1024 };
    expect(await codeOf(inspectZip(lying, limits))).toBe('ACEPTADO');
    expect(await codeOf(readZipEntries(lying, limits))).toBe('ZIP_DEMASIADO_GRANDE');
  });

  it('rechaza un total descomprimido por encima del límite', async () => {
    const zip = await zipWith([
      { name: 'a.json', content: 'x'.repeat(4000) },
      { name: 'b.json', content: 'y'.repeat(4000) },
    ]);
    const limits = { ...DEFAULT_SAFE_ZIP_LIMITS, maxUncompressedBytesPerZip: 5000 };
    expect(await codeOf(inspectZip(zip, limits))).toBe('ZIP_DEMASIADO_GRANDE');
  });

  it('rechaza demasiadas entradas', async () => {
    const zip = await zipWith(
      Array.from({ length: 6 }, (_, index) => ({ name: `f${index}.txt`, content: 'x' })),
    );
    expect(await codeOf(inspectZip(zip, { ...DEFAULT_SAFE_ZIP_LIMITS, maxEntriesPerZip: 5 }))).toBe(
      'ZIP_DEMASIADAS_ENTRADAS',
    );
  });

  it('rechaza lo que no es ZIP y un ZIP truncado', async () => {
    expect(hasZipMagic(Buffer.from('%PDF-1.4'))).toBe(false);
    expect(await codeOf(inspectZip(Buffer.from('no es un zip')))).toBe('ZIP_INVALIDO');
    const valid = await buildSyntheticUispZip();
    expect(await codeOf(inspectZip(valid.subarray(0, 200)))).toBe('ZIP_INVALIDO');
  });
});
