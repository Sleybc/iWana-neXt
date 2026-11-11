import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, type Job } from 'bullmq';
import {
  CRM_CONTRACT_SIGNED_PDF_JOB_NAME,
  contractSignatureObjectKeys,
  type ContractSignedPdfJobPayload,
} from '@iwana/shared';
import { decryptObjectBuffer, encryptObjectBuffer, type StoragePort } from '@iwana/storage';
import type { DataSource } from 'typeorm';
import { buildContractSnapshotFixture } from '../../test/fixtures/contracts/contract-snapshot.fixture';
import type { ContractPdfRenderer } from '../contracts/contract-pdf-renderer';
import { embedSignature, isPngBuffer } from '../contracts/contract-template';
import { ContractPdfProcessor } from './contract-pdf.processor';

const tenantQuery = jest.fn();
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn((_ds: unknown, _schema: string, fn: (qr: unknown) => unknown) =>
    fn({ query: tenantQuery }),
  ),
}));

const KEY = 'd4'.repeat(32);
const SCHEMA = 'tenant_contract_sign_unit';
const snapshot = buildContractSnapshotFixture();
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('firma'),
]);
const payload: ContractSignedPdfJobPayload = {
  tenantId: '44444444-4444-4444-8444-444444444444',
  contractId: snapshot.contractId,
  generationId: '55555555-5555-4555-8555-555555555555',
  signingKey: '66666666-6666-4666-8666-666666666666',
};
const keys = contractSignatureObjectKeys(
  SCHEMA,
  payload.contractId,
  payload.generationId,
  payload.signingKey,
);

function encryptSnapshot(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

describe('embedSignature', () => {
  it('incrusta la firma como data: en cada hueco y exige al menos uno', () => {
    const html =
      '<div class="signature-slot" data-signature-slot="acceptance"></div>' +
      '<p>x</p><div class="signature-slot" data-signature-slot="subscriber"></div>';
    const signed = embedSignature(html, PNG);
    expect(signed.match(/<img src="data:image\/png;base64,/gu)).toHaveLength(2);
    expect(() => embedSignature('<p>sin huecos</p>', PNG)).toThrow(/huecos/u);
    expect(() => embedSignature(html, Buffer.from('no-png'))).toThrow(/PNG/u);
    expect(isPngBuffer(PNG)).toBe(true);
  });
});

describe('ContractPdfProcessor — PDF firmado (bloque D)', () => {
  const pdf = Buffer.from('%PDF-1.7 firmado sintético');
  const storage = {
    putObject: jest.fn(),
    getObject: jest.fn(),
  } as unknown as jest.Mocked<StoragePort>;
  const renderer = { render: jest.fn() } as unknown as jest.Mocked<ContractPdfRenderer>;
  const dataSource = { query: jest.fn() } as unknown as jest.Mocked<DataSource>;
  let processor: ContractPdfProcessor;
  const job = (data: unknown = payload) =>
    ({
      name: CRM_CONTRACT_SIGNED_PDF_JOB_NAME,
      data,
      attemptsMade: 0,
      opts: { attempts: 2 },
    }) as Job<ContractSignedPdfJobPayload>;

  beforeEach(() => {
    jest.clearAllMocks();
    (dataSource.query as jest.Mock).mockResolvedValue([{ schema_name: SCHEMA }]);
    tenantQuery.mockResolvedValue([
      {
        id: payload.generationId,
        contract_id: payload.contractId,
        tenant_id: payload.tenantId,
        status: 'READY',
        snapshot_encrypted: encryptSnapshot(snapshot),
      },
    ]);
    storage.getObject.mockResolvedValue(encryptObjectBuffer(PNG, Buffer.from(KEY, 'hex')));
    renderer.render.mockResolvedValue(pdf);
    processor = new ContractPdfProcessor(
      dataSource,
      storage,
      renderer,
      new ConfigService({
        PII_ENCRYPTION_KEY: KEY,
        CONTRACT_TEMPLATES_DIR: resolve(__dirname, '../templates/contracts'),
      }),
    );
  });

  it('re-renderiza con la firma, guarda el PDF cifrado y devuelve la huella sin cambiar la generación', async () => {
    const result = await processor.process(job());

    expect(storage.getObject).toHaveBeenCalledWith(keys.signatureImage);
    const html = renderer.render.mock.calls[0]?.[0] ?? '';
    expect(html).toContain(`data:image/png;base64,${PNG.toString('base64')}`);
    expect(result).toEqual({
      signedDocumentSha256: createHash('sha256').update(pdf).digest('hex'),
      bytes: pdf.length,
    });
    const [key, body] = storage.putObject.mock.calls[0] as unknown as [string, Buffer];
    expect(key).toBe(keys.signedDocument);
    expect(decryptObjectBuffer(body, [Buffer.from(KEY, 'hex')]).equals(pdf)).toBe(true);
    expect(tenantQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE'))).toBe(false);
  });

  it('una generación que no está READY o una firma ilegible no se reintentan', async () => {
    tenantQuery.mockResolvedValueOnce([
      {
        id: payload.generationId,
        contract_id: payload.contractId,
        status: 'PENDING',
        snapshot_encrypted: 'x',
      },
    ]);
    await expect(processor.process(job())).rejects.toBeInstanceOf(UnrecoverableError);
    storage.getObject.mockResolvedValueOnce(Buffer.from('basura'));
    await expect(processor.process(job())).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      processor.process(job({ ...payload, signingKey: 'no-uuid' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
