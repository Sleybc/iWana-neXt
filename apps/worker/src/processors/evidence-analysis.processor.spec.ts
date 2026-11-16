import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { validateMagicBytes as apiValidateMagicBytes } from '../../../api/src/modules/media/magic-bytes';
import {
  EvidenceAnalysisProcessor,
  validateEvidenceMagicBytes,
} from './evidence-analysis.processor';

describe('EvidenceAnalysisProcessor', () => {
  it('promueve solo una evidencia en cuarentena cuando el baseline es válido', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              usage: 'execution_evidence',
              mime_type: 'image/jpeg',
              size_bytes: bytes.length,
              checksum_sha256: checksum,
              object_key: 'tenant_test/execution_evidence/asset.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'AVAILABLE' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const storage = { getObject: jest.fn().mockResolvedValue(bytes) };
    const processor = new EvidenceAnalysisProcessor({ get: jest.fn() } as unknown as ConfigService);
    (processor as unknown as { storage: typeof storage }).storage = storage;
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(client),
    };

    await processor.process({
      data: {
        tenantSchema: 'tenant_test',
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        correlationId: 'asset-correlation',
      },
    } as Job<{
      tenantSchema: string;
      mediaAssetId: string;
      correlationId: string;
    }>);

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      ['execution_evidence', 'ticket_attachment'],
    ]);
    expect(storage.getObject).toHaveBeenCalledWith('tenant_test/execution_evidence/asset.jpg');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      'AVAILABLE',
      'execution_evidence',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rechaza sin promover cuando el objeto no contiene bytes reales', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              usage: 'execution_evidence',
              mime_type: 'image/jpeg',
              size_bytes: 16,
              checksum_sha256: 'a'.repeat(64),
              object_key: 'tenant_test/execution_evidence/asset.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'REJECTED' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const storage = { getObject: jest.fn().mockResolvedValue(Buffer.alloc(0)) };
    const processor = new EvidenceAnalysisProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      storage,
    );
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(client),
    };

    await processor.process({
      data: {
        tenantSchema: 'tenant_test',
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        correlationId: 'asset-correlation',
      },
    } as Job<{
      tenantSchema: string;
      mediaAssetId: string;
      correlationId: string;
    }>);

    expect(storage.getObject).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      'REJECTED',
      'execution_evidence',
    ]);
    expect(client.query).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['AVAILABLE']),
    );
  });

  it('rechaza checksum del objeto que no coincide con la metadata', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]);
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [
            {
              usage: 'execution_evidence',
              mime_type: 'image/jpeg',
              size_bytes: bytes.length,
              checksum_sha256: 'b'.repeat(64),
              object_key: 'tenant_test/execution_evidence/asset.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ asset_status: 'REJECTED' }] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };
    const processor = new EvidenceAnalysisProcessor(
      { get: jest.fn() } as unknown as ConfigService,
      { getObject: jest.fn().mockResolvedValue(bytes) },
    );
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(client),
    };

    await processor.process({
      data: {
        tenantSchema: 'tenant_test',
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        correlationId: 'asset-correlation',
      },
    } as Job<{
      tenantSchema: string;
      mediaAssetId: string;
      correlationId: string;
    }>);

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'tenant_test',
      'REJECTED',
      'execution_evidence',
    ]);
  });

  it('rechaza el job si el tenant no es válido', async () => {
    const processor = new EvidenceAnalysisProcessor({ get: jest.fn() } as unknown as ConfigService);
    await expect(
      processor.process({
        data: {
          tenantSchema: 'tenant;drop',
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          correlationId: 'asset-correlation',
        },
      } as Job<{
        tenantSchema: string;
        mediaAssetId: string;
        correlationId: string;
      }>),
    ).rejects.toMatchObject({
      name: 'Error',
      message: 'class=Error sqlstate=none',
    });
  });
  describe('adjuntos de tickets (spec MOD09 adjuntos §2.2)', () => {
    function mp4(majorBrand: string): Buffer {
      const box = Buffer.alloc(24);
      box.writeUInt32BE(24, 0);
      box.write('ftyp', 4, 'latin1');
      box.write(majorBrand, 8, 'latin1');
      box.write('isom', 16, 'latin1');
      return Buffer.concat([box, Buffer.from('mdat-sintetico')]);
    }

    async function analyze(
      bytes: Buffer,
      mime: string,
      usage: 'ticket_attachment' | 'execution_evidence' = 'ticket_attachment',
    ): Promise<jest.Mock> {
      const client = {
        query: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [
              {
                usage,
                mime_type: mime,
                size_bytes: bytes.length,
                checksum_sha256: createHash('sha256').update(bytes).digest('hex'),
                object_key: 'tenant_test/ticket_attachment/asset',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [{ asset_status: 'X' }] })
          .mockResolvedValueOnce(undefined),
        release: jest.fn(),
      };
      const processor = new EvidenceAnalysisProcessor(
        { get: jest.fn() } as unknown as ConfigService,
        { getObject: jest.fn().mockResolvedValue(bytes) },
      );
      (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
        connect: jest.fn().mockResolvedValue(client),
      };
      await processor.process({
        data: {
          tenantSchema: 'tenant_test',
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          correlationId: 'asset-correlation',
        },
      } as Job<{ tenantSchema: string; mediaAssetId: string; correlationId: string }>);
      return client.query;
    }

    it('promueve un MP4 con caja ftyp válida y conserva el uso al actualizar', async () => {
      const query = await analyze(mp4('mp42'), 'video/mp4');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'tenant_test',
        'AVAILABLE',
        'ticket_attachment',
      ]);
    });

    it('rechaza un archivo QuickTime declarado como MP4', async () => {
      const box = Buffer.alloc(24);
      box.writeUInt32BE(24, 0);
      box.write('ftyp', 4, 'latin1');
      box.write('qt  ', 8, 'latin1');
      box.write('qt  ', 16, 'latin1');
      const query = await analyze(box, 'video/mp4');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'tenant_test',
        'REJECTED',
        'ticket_attachment',
      ]);
    });

    it('H2: un MP4 válido como evidencia de orden de trabajo queda REJECTED (MP4 solo en adjuntos)', async () => {
      const query = await analyze(mp4('mp42'), 'video/mp4', 'execution_evidence');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('SET asset_status = $3'), [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'tenant_test',
        'REJECTED',
        'execution_evidence',
      ]);
    });
  });

  /**
   * m3: la copia del worker (`evidence-analysis.processor.ts`) y la de la API
   * (`apps/api/src/modules/media/magic-bytes.ts`) deciden igual cada par contenido × tipo de los
   * adjuntos. Si una cambia sin la otra, un archivo aceptado al subir quedaría bloqueado en la
   * cuarentena (o al revés).
   */
  describe('paridad de firmas con la API (m3)', () => {
    const MIMES = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'video/mp4',
    ];
    const pad = (head: number[] | Buffer, length = 32) =>
      Buffer.concat([
        Buffer.from(head),
        Buffer.alloc(Math.max(0, length - Buffer.from(head).length)),
      ]);
    function ftyp(size: number, major: string, compatible: string[] = [], total = size): Buffer {
      const box = Buffer.alloc(Math.max(total, 16));
      box.writeUInt32BE(size, 0);
      box.write('ftyp', 4, 'latin1');
      box.write(major, 8, 'latin1');
      compatible.forEach((brand, index) => box.write(brand, 16 + index * 4, 'latin1'));
      return box;
    }
    const riffWebp = pad([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
    const cases: Array<[string, Buffer]> = [
      ['jpeg', pad([0xff, 0xd8, 0xff, 0xe0])],
      ['png', pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ['gif', pad(Buffer.from('GIF89a'))],
      ['webp RIFF', riffWebp],
      ['webp sin RIFF', pad([...Buffer.from('XXXX'), 0, 0, 0, 0, ...Buffer.from('WEBP')])],
      ['pdf', pad(Buffer.from('%PDF-1.7'))],
      ['texto', pad(Buffer.from('hola mundo, no soy nada'))],
      ['corto (< 12)', Buffer.from([0xff, 0xd8, 0xff])],
      ['mp4 isom', ftyp(24, 'isom', ['mp42'], 40)],
      ['mp4 mp42', ftyp(24, 'mp42', [], 40)],
      ['mp4 M4V', ftyp(24, 'M4V ', [], 40)],
      ['mp4 por compatible', ftyp(24, 'xxxx', ['avc1'], 40)],
      ['quicktime', ftyp(24, 'qt  ', ['qt  '], 40)],
      ['heic con compatible mp4', ftyp(24, 'heic', ['isom'], 40)],
      ['avif', ftyp(24, 'avif', ['mif1'], 40)],
      ['ftyp tamaño no múltiplo de 4', ftyp(22, 'isom', [], 40)],
      ['ftyp tamaño < 16', ftyp(12, 'isom', [], 40)],
      ['ftyp tamaño > buffer', ftyp(64, 'isom', [], 40)],
      ['ftyp tamaño > 1024', ftyp(1028, 'isom', [], 1100)],
      ['ftyp sin marca conocida', ftyp(24, 'zzzz', ['yyyy'], 40)],
      ['sin caja ftyp', pad(Buffer.from('   moovisom'))],
    ];

    it.each(cases)(
      '%s: mismo veredicto en la API y en el worker para cada tipo',
      (_name, bytes) => {
        for (const mime of MIMES) {
          expect([mime, validateEvidenceMagicBytes(bytes, mime)]).toEqual([
            mime,
            apiValidateMagicBytes(bytes, mime),
          ]);
        }
      },
    );

    it('cada tipo admitido tiene al menos un caso que ambas aceptan (la tabla no es trivial)', () => {
      for (const mime of MIMES) {
        expect(
          cases.some(
            ([, bytes]) =>
              apiValidateMagicBytes(bytes, mime) && validateEvidenceMagicBytes(bytes, mime),
          ),
        ).toBe(true);
      }
    });
  });
});
