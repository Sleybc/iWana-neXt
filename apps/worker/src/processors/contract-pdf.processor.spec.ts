import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, type Job } from 'bullmq';
import { CRM_CONTRACT_PDF_JOB_NAME, type ContractPdfJobPayload } from '@iwana/shared';
import { decryptObjectBuffer, type StoragePort } from '@iwana/storage';
import type { DataSource } from 'typeorm';
import { buildContractSnapshotFixture } from '../../test/fixtures/contracts/contract-snapshot.fixture';
import type { ContractPdfRenderer } from '../contracts/contract-pdf-renderer';
import {
  ContractPdfProcessor,
  contractPdfObjectKey,
  resolveContractTemplatesDir,
} from './contract-pdf.processor';

const tenantQuery = jest.fn();
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn((_ds: unknown, _schema: string, fn: (qr: unknown) => unknown) =>
    fn({ query: tenantQuery }),
  ),
}));

const KEY = 'd4'.repeat(32);
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const SCHEMA = 'tenant_contract_pdf_unit';
const snapshot = buildContractSnapshotFixture();
const payload: ContractPdfJobPayload = {
  tenantId: TENANT_ID,
  contractId: snapshot.contractId,
  generationId: '55555555-5555-4555-8555-555555555555',
};

function encryptSnapshot(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

function job(overrides: Partial<Job<ContractPdfJobPayload>> = {}): Job<ContractPdfJobPayload> {
  return {
    name: CRM_CONTRACT_PDF_JOB_NAME,
    data: payload,
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<ContractPdfJobPayload>;
}

describe('ContractPdfProcessor', () => {
  const pdf = Buffer.from('%PDF-1.7 sintético');
  const storage = { putObject: jest.fn() } as unknown as jest.Mocked<StoragePort>;
  const renderer = { render: jest.fn() } as unknown as jest.Mocked<ContractPdfRenderer>;
  const dataSource = { query: jest.fn() } as unknown as jest.Mocked<DataSource>;
  let processor: ContractPdfProcessor;

  const generationRow = (overrides: Record<string, unknown> = {}) => ({
    id: payload.generationId,
    contract_id: payload.contractId,
    tenant_id: TENANT_ID,
    status: 'PENDING',
    snapshot_encrypted: encryptSnapshot(snapshot),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (dataSource.query as jest.Mock).mockResolvedValue([{ schema_name: SCHEMA }]);
    renderer.render.mockResolvedValue(pdf);
    processor = new ContractPdfProcessor(
      dataSource,
      storage,
      renderer,
      new ConfigService({
        PII_ENCRYPTION_KEY: KEY,
        CONTRACT_TEMPLATES_DIR: resolve(__dirname, '../../test/fixtures/contracts'),
      }),
    );
  });

  it('renderiza, guarda el PDF cifrado y marca READY con la huella del PDF', async () => {
    tenantQuery.mockResolvedValueOnce([generationRow()]).mockResolvedValueOnce([]);
    await processor.process(job());

    const html = renderer.render.mock.calls[0]![0];
    expect(html).toContain('Fibra 300');
    const [key, body, options] = storage.putObject.mock.calls[0]!;
    expect(key).toBe(contractPdfObjectKey(SCHEMA, payload.contractId, payload.generationId));
    expect(options.contentType).toBe('application/octet-stream');
    expect(decryptObjectBuffer(body as Buffer, [Buffer.from(KEY, 'hex')]).equals(pdf)).toBe(true);
    const [sql, params] = tenantQuery.mock.calls[1]!;
    expect(sql).toContain("status = 'READY'");
    expect(sql).toContain("status = 'PENDING'");
    expect(params).toEqual([
      payload.generationId,
      TENANT_ID,
      key,
      createHash('sha256').update(pdf).digest('hex'),
    ]);
  });

  it.each(['READY', 'FAILED'])('no reprocesa una generación %s (idempotencia)', async (status) => {
    tenantQuery.mockResolvedValueOnce([generationRow({ status })]);
    await processor.process(job());
    expect(renderer.render).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('reintenta un fallo de render y marca FAILED solo en el último intento', async () => {
    renderer.render.mockRejectedValue(new Error('Chromium caído con datos del titular'));
    tenantQuery.mockResolvedValue([generationRow()]);
    await expect(processor.process(job({ attemptsMade: 0 }))).rejects.toThrow();
    expect(tenantQuery.mock.calls.some(([sql]) => String(sql).includes('RENDER_FAILED'))).toBe(
      false,
    );

    tenantQuery.mockClear();
    await expect(processor.process(job({ attemptsMade: 2 }))).rejects.toThrow();
    expect(tenantQuery.mock.calls.some(([sql]) => String(sql).includes('RENDER_FAILED'))).toBe(
      true,
    );
  });

  it('un snapshot de otro contrato es irrecuperable y queda FAILED', async () => {
    tenantQuery.mockResolvedValue([
      generationRow({
        snapshot_encrypted: encryptSnapshot({
          ...snapshot,
          contractId: '66666666-6666-4666-8666-666666666666',
        }),
      }),
    ]);
    await expect(processor.process(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(tenantQuery.mock.calls.some(([sql]) => String(sql).includes('RENDER_FAILED'))).toBe(
      true,
    );
  });

  it('rechaza un payload con datos extra o sin identificadores válidos', async () => {
    await expect(
      processor.process(
        job({ data: { ...payload, documentNumber: '1' } as ContractPdfJobPayload }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processor.process(job({ name: 'otro' }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('rechaza un tenant inexistente', async () => {
    (dataSource.query as jest.Mock).mockResolvedValue([]);
    await expect(processor.process(job())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('una generación de otro contrato no se procesa', async () => {
    tenantQuery.mockResolvedValue([generationRow({ contract_id: snapshot.executionOrderId })]);
    await expect(processor.process(job())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('el motivo del fallo no expone el mensaje original (sin PII)', async () => {
    renderer.render.mockRejectedValue(new Error('Titular 1000000001 sin fuente'));
    tenantQuery.mockResolvedValue([generationRow()]);
    const error = await processor.process(job()).catch((caught: Error) => caught);
    expect(String((error as Error).message)).not.toContain('1000000001');
  });

  it('resuelve el directorio de plantillas configurado o el de src', () => {
    expect(resolveContractTemplatesDir('/plantillas')).toBe(resolve('/plantillas'));
    expect(resolveContractTemplatesDir().split(/[\\/]/u).slice(-2)).toEqual([
      'templates',
      'contracts',
    ]);
  });
});
