import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  AuditAction,
  SIGNED_CONTRACT_DOCUMENT_RESTRICTED_CODE,
} from '@iwana/shared';
import { contractSignedCopyTemplate } from '../../../mailer/templates/contract-signed-copy.template';
import { contractSignedCopyJobId } from './contract-signed-copy.constants';
import {
  ContractSignedCopyProcessor,
  parseContractSignedCopyPayload,
} from './contract-signed-copy.processor';
import { ContractSignedCopyProducer } from './contract-signed-copy.producer';
import { SignedContractDocumentsService } from './signed-contract-documents.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const SUBSCRIBER = '22222222-2222-4222-8222-222222222222';
const CONTRACT = '33333333-3333-4333-8333-333333333333';
const SIGNATURE = '44444444-4444-4444-8444-444444444444';
const context = { tenantId: TENANT, schemaName: 'tenant_signed_unit', tenantSlug: 'signed-unit' };
const actor = { sub: '55555555-5555-4555-8555-555555555555' } as never;
const inContext = <T>(callback: () => Promise<T>) => TenantContext.run(context, callback);

function build(options: {
  granted?: string[];
  rows?: unknown[];
  blocked?: Error | null;
  pdf?: Buffer;
}) {
  const qr = { query: jest.fn(async (_sql: string, _params?: unknown[]) => options.rows ?? []) };
  const dataSource = {
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string, params?: unknown[]) =>
        sql.startsWith('SET LOCAL') ? undefined : qr.query(sql, params),
      ),
    }),
  };
  const contracts = {
    findOne: jest.fn(async () => ({ id: CONTRACT })),
    assertContractNotBlocked: jest.fn(async () => {
      if (options.blocked) throw options.blocked;
    }),
    assertSubscriberNotBlockedForMutation: jest.fn(async () => {
      if (options.blocked) throw options.blocked;
    }),
  };
  const signature = {
    readSignedDocument: jest.fn(async () => options.pdf ?? Buffer.from('%PDF')),
  };
  const audit = { log: jest.fn() };
  const service = new SignedContractDocumentsService(
    dataSource as never,
    contracts as never,
    signature as never,
    { getEffectivePermissionsForUser: jest.fn(async () => options.granted ?? []) } as never,
    audit as never,
  );
  return { service, contracts, signature, audit, qr };
}

const SIGNED_ROW = {
  contract_id: CONTRACT,
  signed_at: new Date('2026-11-10T15:00:00.000Z'),
  template_version: '1.0',
};

describe('SignedContractDocumentsService', () => {
  it('lista vacía sin consultar permisos ni bloqueo si no hay firmas', async () => {
    const { service, contracts } = build({ rows: [] });
    await expect(inContext(() => service.listForSubscriber(SUBSCRIBER, actor))).resolves.toEqual(
      [],
    );
    expect(contracts.assertSubscriberNotBlockedForMutation).not.toHaveBeenCalled();
  });

  it('con permiso del documento la fila es descargable', async () => {
    const { service, qr } = build({
      rows: [SIGNED_ROW],
      granted: [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ],
    });
    const items = await inContext(() => service.listForSubscriber(SUBSCRIBER, actor));
    expect(items).toEqual([
      {
        contractId: CONTRACT,
        signedAt: '2026-11-10T15:00:00.000Z',
        templateVersion: '1.0',
        downloadable: true,
        restriction: null,
      },
    ]);
    expect(qr.query).toHaveBeenCalledWith(expect.stringContaining('c.subscriber_id = $2'), [
      TENANT,
      SUBSCRIBER,
    ]);
  });

  it('sin permiso del documento: DOCUMENT_NUMBER_RESTRICTED', async () => {
    const { service } = build({ rows: [SIGNED_ROW] });
    const [item] = await inContext(() => service.listForSubscriber(SUBSCRIBER, actor));
    expect(item).toMatchObject({ downloadable: false, restriction: 'DOCUMENT_NUMBER_RESTRICTED' });
  });

  it('titular bloqueado: TITULAR_RESTRICTED aunque tenga el permiso', async () => {
    const { service } = build({
      rows: [SIGNED_ROW],
      granted: [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ],
      blocked: new ConflictException({ code: 'PRIVACY_DATA_BLOCKED' }),
    });
    const [item] = await inContext(() => service.listForSubscriber(SUBSCRIBER, actor));
    expect(item).toMatchObject({ downloadable: false, restriction: 'TITULAR_RESTRICTED' });
  });

  it('la caída del servicio de privacidad no se disfraza de restricción', async () => {
    const { service } = build({
      rows: [SIGNED_ROW],
      blocked: new ServiceUnavailableException(),
    });
    await expect(
      inContext(() => service.listForSubscriber(SUBSCRIBER, actor)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('descarga sin permiso: 403 con código propio, sin leer el PDF', async () => {
    const { service, signature, audit } = build({});
    const error = await inContext(() => service.download(CONTRACT, actor)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: SIGNED_CONTRACT_DOCUMENT_RESTRICTED_CODE,
    });
    expect(signature.readSignedDocument).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('descarga con permiso: verifica bloqueo, lee el PDF verificado y audita', async () => {
    const pdf = Buffer.from('%PDF firmado');
    const { service, contracts, audit } = build({
      granted: [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ],
      pdf,
    });
    await expect(inContext(() => service.download(CONTRACT, actor))).resolves.toBe(pdf);
    expect(contracts.assertContractNotBlocked).toHaveBeenCalledWith(CONTRACT);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RECORD_ACCESS,
        entityType: 'ContractSignature',
        entityId: CONTRACT,
      }),
    );
  });

  it('descarga de contrato inexistente: 404 antes del permiso', async () => {
    const { service, contracts } = build({});
    contracts.findOne.mockRejectedValueOnce(new NotFoundException());
    await expect(inContext(() => service.download(CONTRACT, actor))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('titular anonimizado: la descarga se rechaza', async () => {
    const { service, signature } = build({
      granted: [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ],
      blocked: new ConflictException({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
    await expect(inContext(() => service.download(CONTRACT, actor))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(signature.readSignedDocument).not.toHaveBeenCalled();
  });
});

describe('Copia del contrato firmado por correo', () => {
  it('el payload solo admite el contexto tenant y la firma', () => {
    expect(parseContractSignedCopyPayload({ ...context, signatureId: SIGNATURE })).toEqual({
      ...context,
      signatureId: SIGNATURE,
    });
    for (const bad of [
      null,
      { ...context, signatureId: 'x' },
      { ...context, schemaName: 'public', signatureId: SIGNATURE },
      { ...context, tenantSlug: 'Mal Slug', signatureId: SIGNATURE },
    ]) {
      expect(() => parseContractSignedCopyPayload(bad)).toThrow(UnrecoverableError);
    }
  });

  it('encola un trabajo por firma con el contexto tenant explícito', async () => {
    const queue = { add: jest.fn(async () => undefined) };
    const producer = new ContractSignedCopyProducer(queue as never);
    await inContext(() => producer.enqueue(SIGNATURE));
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      { ...context, signatureId: SIGNATURE },
      expect.objectContaining({ jobId: contractSignedCopyJobId(SIGNATURE) }),
    );
  });

  it('si la cola falla la firma no se interrumpe', async () => {
    const queue = { add: jest.fn(async () => Promise.reject(new Error('redis caído'))) };
    const producer = new ContractSignedCopyProducer(queue as never);
    await expect(inContext(() => producer.enqueue(SIGNATURE))).resolves.toBeUndefined();
  });

  it.each([
    ['schema distinto al registro', { schemaName: 'tenant_ajeno' }, 'ACTIVE'],
    ['slug distinto al registro', { tenantSlug: 'ajeno' }, 'ACTIVE'],
    ['tenant inactivo', {}, 'SUSPENDED'],
  ])('SEC-7: rechaza sin reintento un payload con %s', async (_name, change, status) => {
    const dataSource = { createQueryRunner: jest.fn() };
    const tenants = {
      findTenantLifecycleById: jest.fn(async () => ({
        id: TENANT,
        schemaName: context.schemaName,
        slug: context.tenantSlug,
        status,
        deletedAt: null,
      })),
    };
    const processor = new ContractSignedCopyProcessor(
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      tenants as never,
    );
    await expect(
      processor.send({ ...context, ...change, signatureId: SIGNATURE }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(tenants.findTenantLifecycleById).toHaveBeenCalledWith(TENANT);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('la plantilla no lleva datos del titular y muestra la fecha civil', () => {
    const mail = contractSignedCopyTemplate({ signedOn: '2026-11-10' });
    expect(mail.subject).toBe('Copia de tu contrato de servicio firmado');
    expect(mail.text).toContain('10/11/2026');
    expect(mail.html).toContain('10/11/2026');
  });
});
