import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsStorageAdapter } from '@iwana/storage';
import type { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { ContractMediaSweepProcessor } from './contract-media-sweep.processor';

const tenantQuery = jest.fn();
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn((_ds: unknown, _schema: string, fn: (qr: unknown) => unknown) =>
    fn({ query: tenantQuery }),
  ),
}));

const SCHEMA = 'tenant_sweep_unit';
const SIGNED = '11111111-1111-4111-8111-111111111111';
const ANONYMIZED = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';
const GEN = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-11T12:00:00Z');
const OLD = new Date('2026-11-09T12:00:00Z');

describe('ContractMediaSweepProcessor (SEC-1)', () => {
  let base: string;
  let storage: LocalFsStorageAdapter;
  const dataSource = { query: jest.fn() } as unknown as jest.Mocked<DataSource>;
  const queue = { add: jest.fn() } as unknown as Queue;

  const put = async (key: string, modified: Date) => {
    await storage.putObject(key, Buffer.from('cifrado'), { contentType: 'x' });
    utimesSync(join(base, key), modified, modified);
  };
  const keys = {
    unsigned: `${SCHEMA}/contracts/${SIGNED}/${GEN}.pdf.enc`,
    png: `${SCHEMA}/contracts/${SIGNED}/signatures/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png.enc`,
    signed: `${SCHEMA}/contracts/${SIGNED}/${GEN}.signed.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf.enc`,
    failedPngOld: `${SCHEMA}/contracts/${SIGNED}/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png.enc`,
    failedPdfOld: `${SCHEMA}/contracts/${SIGNED}/${GEN}.signed.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf.enc`,
    inFlightPng: `${SCHEMA}/contracts/${SIGNED}/signatures/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png.enc`,
    anonUnsigned: `${SCHEMA}/contracts/${ANONYMIZED}/${GEN}.pdf.enc`,
    anonPng: `${SCHEMA}/contracts/${ANONYMIZED}/signatures/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png.enc`,
    anonSigned: `${SCHEMA}/contracts/${ANONYMIZED}/${GEN}.signed.dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf.enc`,
    goneContract: `${SCHEMA}/contracts/${GONE}/${GEN}.pdf.enc`,
    otherTenant: `tenant_otro/contracts/${SIGNED}/${GEN}.pdf.enc`,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    base = mkdtempSync(join(tmpdir(), 'contract-sweep-'));
    storage = new LocalFsStorageAdapter(base);
    (dataSource.query as jest.Mock).mockResolvedValue([{ schema_name: SCHEMA }]);
    tenantQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM contracts')) {
        return [
          { id: SIGNED, anonymized: false },
          { id: ANONYMIZED, anonymized: true },
        ];
      }
      return [
        { key: keys.unsigned },
        { key: keys.png },
        { key: keys.signed },
        { key: keys.anonUnsigned },
        { key: keys.anonPng },
        { key: keys.anonSigned },
      ];
    });
    for (const key of Object.values(keys)) await put(key, OLD);
    await put(keys.inFlightPng, new Date(NOW.getTime() - 60_000));
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('borra todo lo del contrato anonimizado o inexistente y los huérfanos vencidos', async () => {
    const processor = new ContractMediaSweepProcessor(dataSource, storage, queue);
    const summary = await processor.sweep(NOW);

    const remaining = (await storage.listObjects('')).map((object) => object.key).sort();
    expect(remaining).toEqual(
      [keys.unsigned, keys.png, keys.signed, keys.inFlightPng, keys.otherTenant].sort(),
    );
    expect(summary).toMatchObject({ deletedAnonymized: 4, deletedOrphans: 2, failed: 0 });
  });

  it('es idempotente: una segunda pasada no borra nada más', async () => {
    const processor = new ContractMediaSweepProcessor(dataSource, storage, queue);
    await processor.sweep(NOW);
    const again = await processor.sweep(NOW);
    expect(again).toMatchObject({ deletedAnonymized: 0, deletedOrphans: 0 });
  });

  it('falla cerrado si el almacenamiento no lista por prefijo', async () => {
    const processor = new ContractMediaSweepProcessor(
      dataSource,
      { deleteObject: jest.fn() } as never,
      queue,
    );
    await expect(processor.sweep(NOW)).rejects.toThrow(/listar/u);
  });

  it('programa el barrido recurrente con jobId fijo', async () => {
    await new ContractMediaSweepProcessor(dataSource, storage, queue).onApplicationBootstrap();
    expect(queue.add).toHaveBeenCalledWith(
      'sweep',
      {},
      expect.objectContaining({ jobId: 'crm-contract-media-sweep-recurring' }),
    );
  });
});
