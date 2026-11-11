import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { AuditAction, CRM_CONTRACT_SIGNED_PDF_JOB_NAME } from '@iwana/shared';
import { decryptObjectBuffer, encryptObjectBuffer } from '@iwana/storage';
import { ContractStatus } from '../../enums/contract-status.enum';
import { ContractSignatureService } from './contract-signature.service';

const TENANT = { tenantId: randomUUID(), schemaName: 'tenant_sign_unit' };
const KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const KEY = Buffer.from(KEY_HEX, 'hex');

type QueryHandler = (sql: string, params: unknown[]) => unknown;
let handler: QueryHandler;
const managerQuery = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: () => TENANT },
    runInTenantSchema: async (_ds: unknown, _schema: string, cb: (qr: unknown) => unknown) =>
      cb({ query: async (sql: string, params: unknown[] = []) => handler(sql, params) }),
  };
});

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('firma-sintetica'),
]);
const UNSIGNED_PDF = Buffer.from('%PDF-1.7 contrato sintetico');
const UNSIGNED_SHA = createHash('sha256').update(UNSIGNED_PDF).digest('hex');
const SIGNED_SHA = 'c'.repeat(64);

const ids = {
  contract: randomUUID(),
  subscriber: randomUUID(),
  order: randomUUID(),
  generation: randomUUID(),
  technician: randomUUID(),
  template: randomUUID(),
};
const actor = { sub: ids.technician } as never;

function command(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    generationId: ids.generation,
    documentSha256: UNSIGNED_SHA,
    executionOrderId: ids.order,
    signatureImage: `data:image/png;base64,${PNG.toString('base64')}`,
    signer: { fullName: 'Titular Sintético', documentType: 'CC', documentNumber: '1000000001' },
    location: { latitude: 4.711, longitude: -74.072 },
    device: { userAgent: 'jest', platform: 'test' },
    ...overrides,
  } as never;
}

function generationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.generation,
    contract_id: ids.contract,
    execution_order_id: ids.order,
    status: 'READY',
    template_legal_text_id: ids.template,
    template_version: '1.0',
    document_object_key: 'tenant_sign_unit/contracts/k.pdf.enc',
    document_sha256: UNSIGNED_SHA,
    ...overrides,
  };
}

describe('ContractSignatureService (bloque D)', () => {
  let service: ContractSignatureService;
  let generation: Record<string, unknown> | null;
  let signatureRow: Record<string, unknown> | null;
  let contractStatus: ContractStatus;
  const queue = { add: jest.fn(), opts: { connection: {} } };
  const job = { waitUntilFinished: jest.fn() };
  const storage = { putObject: jest.fn(), getObject: jest.fn() };
  const contracts = {
    findOne: jest.fn(),
    assertContractNotBlocked: jest.fn(),
    activateFromSignature: jest.fn(),
  };
  const generationService = { assertExecutionOrderAccess: jest.fn() };
  const permanence = { applyActivationDate: jest.fn() };
  const publisher = { publishForContract: jest.fn() };
  const provisioning = {
    getProvisioningActivatedAt: jest.fn(),
    listUnsignedBlockedProvisioningIds: jest.fn(),
  };
  const commercialStatus = { record: jest.fn() };
  const tenantSettings = { getTimezone: jest.fn().mockResolvedValue('America/Bogota') };
  const audit = { log: jest.fn(), logWithin: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    generation = generationRow();
    signatureRow = null;
    contractStatus = ContractStatus.DRAFT;
    handler = (sql) => {
      if (sql.includes('FROM contract_document_generations')) return generation ? [generation] : [];
      if (sql.includes('FROM contract_signatures')) return signatureRow ? [signatureRow] : [];
      return [];
    };
    contracts.findOne.mockImplementation(async () => ({
      id: ids.contract,
      subscriberId: ids.subscriber,
      status: contractStatus,
    }));
    contracts.activateFromSignature.mockImplementation(
      async (_id: string, _actor: string, options: { within: (m: unknown) => Promise<void> }) => {
        await options.within({ query: managerQuery });
        return { id: ids.contract, status: ContractStatus.ACTIVE };
      },
    );
    // 22:00 del 11-nov en Bogotá: la fecha civil del tenant, no la UTC.
    provisioning.getProvisioningActivatedAt.mockResolvedValue(new Date('2026-11-12T03:00:00.000Z'));
    provisioning.listUnsignedBlockedProvisioningIds.mockResolvedValue(['sp-1']);
    queue.add.mockResolvedValue(job);
    job.waitUntilFinished.mockResolvedValue({ signedDocumentSha256: SIGNED_SHA, bytes: 2048 });
    storage.getObject.mockResolvedValue(encryptObjectBuffer(UNSIGNED_PDF, KEY));
    service = new ContractSignatureService(
      {} as never,
      queue as never,
      storage as never,
      contracts as never,
      generationService as never,
      permanence as never,
      publisher as never,
      provisioning as never,
      commercialStatus as never,
      tenantSettings as never,
      audit as never,
      new ConfigService({ PII_ENCRYPTION_KEY: KEY_HEX, MFA_ENCRYPTION_KEY: KEY_HEX }),
    );
    jest
      .spyOn(service as unknown as { getQueueEvents: () => Promise<unknown> }, 'getQueueEvents')
      .mockResolvedValue({});
  });

  it('firma: guarda la firma cifrada, re-renderiza, activa con la fecha civil de la activación y publica', async () => {
    const input = command();
    const result = await service.sign(ids.contract, input, actor);

    expect(result).toMatchObject({
      contractId: ids.contract,
      status: 'ACTIVE',
      billingStartDate: '2026-11-11',
      signedDocumentSha256: SIGNED_SHA,
      templateVersion: '1.0',
      replayed: false,
    });
    const [key, body] = storage.putObject.mock.calls[0] as [string, Buffer];
    expect(key).toMatch(/^tenant_sign_unit\/contracts\/.+\/signatures\/.+\.png\.enc$/u);
    expect(body.includes(PNG)).toBe(false);
    expect(decryptObjectBuffer(body, [KEY]).equals(PNG)).toBe(true);

    const [name, payload, opts] = queue.add.mock.calls[0] as [string, object, { jobId: string }];
    expect(name).toBe(CRM_CONTRACT_SIGNED_PDF_JOB_NAME);
    expect(Object.keys(payload).sort()).toEqual(
      ['contractId', 'generationId', 'signingKey', 'tenantId'].sort(),
    );
    expect(opts.jobId).not.toContain(':');

    expect(contracts.activateFromSignature).toHaveBeenCalledWith(
      ids.contract,
      ids.technician,
      expect.objectContaining({ startDate: '2026-11-11' }),
    );
    const insert = managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO contract_signatures'),
    ) as [string, unknown[]];
    expect(JSON.stringify(insert[1])).not.toContain('1000000001');
    expect(insert[1]).toEqual(expect.arrayContaining([UNSIGNED_SHA, SIGNED_SHA, 4.711, -74.072]));
    expect(permanence.applyActivationDate).toHaveBeenCalledWith(
      expect.anything(),
      ids.contract,
      '2026-11-11',
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CREATE, entityType: 'ContractSignature' }),
      expect.anything(),
    );
    expect(publisher.publishForContract).toHaveBeenCalledWith(ids.contract);
    expect(commercialStatus.record).toHaveBeenCalledWith('sp-1', 'DONE', null);
  });

  it('repetir la idempotencyKey devuelve replayed=true sin renderizar ni activar', async () => {
    signatureRow = {
      id: randomUUID(),
      contract_id: ids.contract,
      signed_at: new Date('2026-11-11T20:00:00Z'),
      billing_start_date: '2026-11-11',
      signed_document_sha256: SIGNED_SHA,
      signed_document_object_key: 'k',
      template_version: '1.0',
    };
    contractStatus = ContractStatus.ACTIVE;

    const result = await service.sign(ids.contract, command(), actor);

    expect(result.replayed).toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
    expect(contracts.activateFromSignature).not.toHaveBeenCalled();
    expect(publisher.publishForContract).toHaveBeenCalledWith(ids.contract);
  });

  it('una clave de otra firma responde 409 IDEMPOTENCY_KEY_REUSED', async () => {
    signatureRow = { contract_id: randomUUID() };
    await expect(service.sign(ids.contract, command(), actor)).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it.each([ContractStatus.ACTIVE, ContractStatus.SUSPENDED, ContractStatus.TERMINATED])(
    'contrato %s → 409 CONTRACT_NOT_DRAFT sin tocar medios',
    async (status) => {
      contractStatus = status;
      await expect(service.sign(ids.contract, command(), actor)).rejects.toMatchObject({
        response: { code: 'CONTRACT_NOT_DRAFT' },
      });
      expect(storage.putObject).not.toHaveBeenCalled();
    },
  );

  it('titular bloqueado o anonimizado → 409 (CA-10)', async () => {
    contracts.assertContractNotBlocked.mockRejectedValueOnce(new ConflictException('bloqueado'));
    await expect(service.sign(ids.contract, command(), actor)).rejects.toThrow(ConflictException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('huella distinta a la generada → 409 CONTRACT_DOCUMENT_HASH_MISMATCH (CA-4)', async () => {
    await expect(
      service.sign(ids.contract, command({ documentSha256: 'd'.repeat(64) }), actor),
    ).rejects.toMatchObject({ response: { code: 'CONTRACT_DOCUMENT_HASH_MISMATCH' } });
  });

  it('generación PENDING → 409 y generación de otra OT → 422', async () => {
    generation = generationRow({ status: 'PENDING', document_sha256: null });
    await expect(service.sign(ids.contract, command(), actor)).rejects.toMatchObject({
      response: { code: 'CONTRACT_DOCUMENT_NOT_READY' },
    });
    generation = generationRow({ execution_order_id: randomUUID() });
    await expect(service.sign(ids.contract, command(), actor)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('sin aprovisionamiento activo de la OT → 409 PROVISIONING_NOT_ACTIVE', async () => {
    provisioning.getProvisioningActivatedAt.mockResolvedValueOnce(null);
    await expect(service.sign(ids.contract, command(), actor)).rejects.toMatchObject({
      response: { code: 'PROVISIONING_NOT_ACTIVE' },
    });
  });

  it('una imagen que no es PNG → 422 SIGNATURE_IMAGE_INVALID', async () => {
    const fake = `data:image/png;base64,${Buffer.from('no-es-png').toString('base64')}`;
    await expect(
      service.sign(ids.contract, command({ signatureImage: fake }), actor),
    ).rejects.toMatchObject({ response: { code: 'SIGNATURE_IMAGE_INVALID' } });
  });

  it('el worker no responde → 503 y el contrato sigue en DRAFT', async () => {
    job.waitUntilFinished.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.sign(ids.contract, command(), actor)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(contracts.activateFromSignature).not.toHaveBeenCalled();
  });

  it('carrera con la misma clave (23505) devuelve la firma ya aplicada', async () => {
    let calls = 0;
    handler = (sql) => {
      if (sql.includes('FROM contract_document_generations')) return [generation];
      if (sql.includes('idempotency_key')) {
        calls += 1;
        return calls === 1
          ? []
          : [
              {
                contract_id: ids.contract,
                signed_at: new Date(),
                billing_start_date: '2026-11-11',
                signed_document_sha256: SIGNED_SHA,
                template_version: '1.0',
              },
            ];
      }
      return [];
    };
    contracts.activateFromSignature.mockRejectedValueOnce({ code: '23505' });
    const result = await service.sign(ids.contract, command(), actor);
    expect(result.replayed).toBe(true);
  });

  describe('visualización durante la firma (CA-12)', () => {
    it('sirve el PDF verificado y audita el acceso', async () => {
      const pdf = await service.viewForSigning(ids.contract, ids.generation, ids.order, actor);
      expect(pdf.equals(UNSIGNED_PDF)).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.RECORD_ACCESS,
          entityId: ids.generation,
          userId: ids.technician,
        }),
      );
    });

    it('tras firmar responde 403 CONTRACT_DOCUMENT_SIGNED', async () => {
      signatureRow = { id: randomUUID() };
      await expect(
        service.viewForSigning(ids.contract, ids.generation, ids.order, actor),
      ).rejects.toThrow(ForbiddenException);
      contractStatus = ContractStatus.ACTIVE;
      signatureRow = null;
      await expect(
        service.viewForSigning(ids.contract, ids.generation, ids.order, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(storage.getObject).not.toHaveBeenCalled();
    });

    it('un PDF alterado en medios falla la verificación (CA-4)', async () => {
      storage.getObject.mockResolvedValueOnce(
        encryptObjectBuffer(Buffer.from('%PDF-1.7 alterado'), KEY),
      );
      await expect(
        service.viewForSigning(ids.contract, ids.generation, ids.order, actor),
      ).rejects.toMatchObject({ response: { code: 'CONTRACT_DOCUMENT_INTEGRITY_FAILED' } });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('una generación de otra OT no se sirve', async () => {
      generation = generationRow({ execution_order_id: randomUUID() });
      await expect(
        service.viewForSigning(ids.contract, ids.generation, ids.order, actor),
      ).rejects.toThrow('Documento del contrato no disponible.');
    });
  });
});
