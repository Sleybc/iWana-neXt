import { ConflictException } from '@nestjs/common';
import { MigrationRevertResultSchema } from '@iwana/shared';
import { MigrationRevertService } from './migration-revert.service';

/**
 * Reversión con adjuntos de tickets (spec MOD09 adjuntos §2.3, criterio 7): se retiran antes de
 * los comentarios, se cuentan en `adjuntosTicketsRetirados` y sus objetos se purgan después del
 * commit; uno añadido a mano bloquea con un mensaje explícito y la transacción se revierte.
 * La integración contra Postgres real está en migration-promotion.postgres.integration.
 */
const scope = { tenantId: 't-1', schemaName: 'tenant_test' };
const batchId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function build(
  options: {
    retired?: { attachments: number; manual: number; mediaAssetIds: string[] };
    revertBatch?: jest.Mock;
    purge?: jest.Mock;
  } = {},
) {
  const events: string[] = [];
  const qr = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(async () => {
      events.push('commit');
    }),
    rollbackTransaction: jest.fn(async () => {
      events.push('rollback');
    }),
    release: jest.fn(),
    manager: {},
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM migration_batches')) return [{ status: 'PROMOVIDO', promotion: null }];
      return [];
    }),
  };
  const dataSource = { createQueryRunner: () => qr };
  const storage = { deleteObject: jest.fn() };
  const crm = {
    batchEntityIds: jest.fn().mockResolvedValue({ subscriberIds: [], contractIds: [] }),
    revertBlockers: jest.fn().mockResolvedValue([]),
    revertComplement: jest.fn(),
    revertBatch: jest.fn().mockResolvedValue({
      subscribers: 1,
      contracts: 0,
      documents: 0,
      suspensionRows: 0,
      storageKeys: [],
    }),
  };
  const billing = {
    revertBlockers: jest.fn().mockResolvedValue([]),
    revertBatch: jest.fn().mockResolvedValue({
      documents: 0,
      payments: 0,
      allocations: 0,
      pdfKeys: [],
    }),
  };
  const support = {
    revertBlockers: jest.fn().mockResolvedValue([]),
    retireBatchAttachments: jest.fn(async () => {
      events.push('retire');
      return options.retired ?? { attachments: 0, manual: 0, mediaAssetIds: [] };
    }),
    revertBatch:
      options.revertBatch ??
      jest.fn(async () => {
        events.push('revertBatch');
        return { tickets: 2 };
      }),
    purgeImportedAttachmentFiles:
      options.purge ??
      jest.fn(async () => {
        events.push('purge');
        return 0;
      }),
  };
  const workOrders = { countReferences: jest.fn().mockResolvedValue(0) };
  const tags = { removeImportBatch: jest.fn().mockResolvedValue({ removed: 0 }) };
  const audit = { logWithin: jest.fn() };
  const service = new MigrationRevertService(
    dataSource as never,
    storage as never,
    crm as never,
    billing as never,
    support as never,
    workOrders as never,
    tags as never,
    audit as never,
  );
  return { service, support, crm, audit, events };
}

describe('MigrationRevertService — adjuntos de tickets (spec MOD09 adjuntos §2.3)', () => {
  it('retira los adjuntos antes que los comentarios, los cuenta y purga sus objetos tras el commit', async () => {
    const { service, support, audit, events } = build({
      retired: { attachments: 3, manual: 0, mediaAssetIds: ['a1', 'a2', 'a3'] },
    });
    const result = MigrationRevertResultSchema.parse(await service.revert(scope, batchId, actorId));
    expect(result.adjuntosTicketsRetirados).toBe(3);
    expect(events).toEqual(['retire', 'revertBatch', 'commit', 'purge']);
    expect(support.purgeImportedAttachmentFiles).toHaveBeenCalledWith('tenant_test', [
      'a1',
      'a2',
      'a3',
    ]);
    expect(audit.logWithin.mock.calls[0]![0].newValue).toMatchObject({ adjuntosTickets: 3 });
  });

  it('sin adjuntos devuelve 0 y no purga nada', async () => {
    const { service, support } = build();
    await expect(service.revert(scope, batchId, actorId)).resolves.toMatchObject({
      adjuntosTicketsRetirados: 0,
    });
    expect(support.purgeImportedAttachmentFiles).not.toHaveBeenCalled();
  });

  it('un adjunto añadido a mano bloquea con TICKET_POSTERIOR y mensaje explícito; nada se borra', async () => {
    const { service, support, crm, events } = build({
      retired: { attachments: 3, manual: 2, mediaAssetIds: ['a1', 'a2', 'a3', 'm1', 'm2'] },
    });
    const error = await service.revert(scope, batchId, actorId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'MIGRATION_REVERT_BLOCKED',
      message:
        'Hay registros creados después que dependen de este lote. Hay 2 adjuntos añadidos a mano en tickets importados: quítalos antes de revertir el lote.',
      details: { blockers: [{ motivo: 'TICKET_POSTERIOR', cantidad: 2 }] },
    });
    expect(support.revertBatch).not.toHaveBeenCalled();
    expect(crm.revertBatch).not.toHaveBeenCalled();
    expect(support.purgeImportedAttachmentFiles).not.toHaveBeenCalled();
    expect(events).toEqual(['retire', 'rollback']);
  });

  it('suma los adjuntos manuales a los demás bloqueos del mismo motivo', async () => {
    const { service, support } = build({
      retired: { attachments: 0, manual: 1, mediaAssetIds: ['m1'] },
    });
    support.revertBlockers.mockResolvedValue([{ motivo: 'TICKET_POSTERIOR', cantidad: 2 }]);
    await expect(service.revert(scope, batchId, actorId)).rejects.toMatchObject({
      response: {
        message: expect.stringContaining('Hay 1 adjunto añadido a mano en un ticket importado'),
        details: { blockers: [{ motivo: 'TICKET_POSTERIOR', cantidad: 3 }] },
      },
    });
  });

  it('un 23001 al borrar comentarios (adjunto llegado en carrera) se vuelve un bloqueo, no un 500', async () => {
    const restrict = Object.assign(new Error('restrict'), { code: '23001' });
    const { service, events } = build({ revertBatch: jest.fn().mockRejectedValue(restrict) });
    await expect(service.revert(scope, batchId, actorId)).rejects.toMatchObject({
      response: {
        code: 'MIGRATION_REVERT_BLOCKED',
        details: { blockers: [{ motivo: 'TICKET_POSTERIOR', cantidad: 1 }] },
      },
    });
    expect(events).toContain('rollback');
  });

  it('otro error de revertBatch se propaga tal cual', async () => {
    const boom = Object.assign(new Error('boom'), { code: '40001' });
    const { service } = build({ revertBatch: jest.fn().mockRejectedValue(boom) });
    await expect(service.revert(scope, batchId, actorId)).rejects.toBe(boom);
  });

  it('si la purga de objetos falla, la reversión ya confirmada se informa igual', async () => {
    const { service } = build({
      retired: { attachments: 1, manual: 0, mediaAssetIds: ['a1'] },
      purge: jest.fn().mockRejectedValue(new Error('storage caído')),
    });
    await expect(service.revert(scope, batchId, actorId)).resolves.toMatchObject({
      status: 'REVERTIDO',
      adjuntosTicketsRetirados: 1,
    });
  });
});
