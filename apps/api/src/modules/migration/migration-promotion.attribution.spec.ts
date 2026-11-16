import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@iwana/shared';
import { MigrationPromotionService } from './migration-promotion.service';

/**
 * Atribución por la equivalencia `USUARIO` (spec 2026-11-15 «usuarios» §2.6–§2.8). El camino
 * completo contra PostgreSQL lo cubre migration-promotion.postgres.integration.
 */
const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROMOTER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** Actor de un reintento de la promoción, registrado en `promotion_meta.importedBy`. */
const RETRY_ACTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ANA = '11111111-1111-4111-8111-111111111111';
const LUIS = '22222222-2222-4222-8222-222222222222';
const BORRADO = '33333333-3333-4333-8333-333333333333';
const SUBSCRIBER = '44444444-4444-4444-8444-444444444444';
const BATCH = '55555555-5555-4555-8555-555555555555';
const TENANT = '66666666-6666-4666-8666-666666666666';
const SCHEMA = 'tenant_prueba';

const ticketRaw = {
  public: true,
  assignedUserId: 8,
  activity: [
    { userId: 7, public: true, comment: { body: 'Abre' }, createdAt: '2023-03-01T00:00:00Z' },
    { userId: 9, public: true, comment: { body: 'Borrado' } },
    { userId: 404, public: true, comment: { body: 'Sin enlazar' } },
  ],
};
const paymentRaw = { userId: 8, methodId: 'm-1', amount: 80, createdDate: '2023-01-10' };

/** Usuarios de UISP: 7 → Ana, 8 → Luis, 9 → usuario borrado; 404 sin equivalencia. */
const mappingRows = [
  { kind: 'USUARIO', external_value: '7', action: 'EQUIVALE', target_ref: ANA },
  { kind: 'USUARIO', external_value: '8', action: 'EQUIVALE', target_ref: LUIS.toUpperCase() },
  { kind: 'USUARIO', external_value: '9', action: 'EQUIVALE', target_ref: BORRADO },
  { kind: 'METODO_PAGO', external_value: 'm-1', action: 'EQUIVALE', target_ref: 'EFECTIVO' },
];

function staged(entity: string, raw: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: `${entity}-row`,
    entity,
    external_id: `uisp:${entity.toLowerCase()}:1`,
    status: 'VALIDO',
    rejection_reason: null,
    payload_encrypted: JSON.stringify({ source: { fileIndex: 0 }, raw, derived: {} }),
    ...extra,
  };
}

function build(
  options: {
    batch?: Record<string, unknown> | null;
    stagedRows?: Array<Record<string, unknown>>;
  } = {},
) {
  const batch =
    options.batch === undefined
      ? { status: 'PROMOVIDO', purged_at: null, created_by: ACTOR, promoted_by: PROMOTER }
      : options.batch;
  const qr = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { marker: 'manager' },
    query: jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM migration_batches')) return batch ? [batch] : [];
      if (sql.includes('FROM migration_mappings')) return mappingRows;
      if (sql.includes('FROM migration_staging_records')) return options.stagedRows ?? [];
      return [];
    }),
  };
  const dataSource = { createQueryRunner: () => qr };
  const crypto = { decryptPayload: (value: string) => JSON.parse(value) };
  const users = {
    existingUserIds: jest.fn(async (_ctx: unknown, ids: string[]) => {
      return new Set(ids.filter((id) => id === ANA || id === LUIS));
    }),
  };
  const crm = {
    findSubscribers: jest
      .fn()
      .mockResolvedValue(
        new Map([['uisp:client:1', { id: SUBSCRIBER, anonymized: false, deleted: false }]]),
      ),
  };
  const billing = {
    findPayments: jest.fn().mockResolvedValue(new Map()),
    createImportedPayment: jest.fn().mockResolvedValue('payment-1'),
    allocateImported: jest.fn(),
    refreshImportedPaymentAuthors: jest.fn().mockResolvedValue({
      payments: 1,
      respected: 0,
      changes: [{ entity: 'PAYMENT', id: 'payment-1', field: 'created_by', from: ACTOR, to: LUIS }],
    }),
  };
  const support = {
    findTickets: jest.fn().mockResolvedValue(new Map()),
    createImportedTicket: jest.fn().mockResolvedValue({ ticketId: 'ticket-1', commentIds: [] }),
    refreshImportedAuthors: jest.fn().mockResolvedValue({
      tickets: 1,
      comments: 1,
      respected: 2,
      changes: [
        { entity: 'TICKET', id: 'ticket-1', field: 'assigned_user_id', from: null, to: LUIS },
        {
          entity: 'TICKET_COMMENT',
          id: 'comment-1',
          field: 'author_user_id',
          from: ACTOR,
          to: ANA,
        },
      ],
    }),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const service = new MigrationPromotionService(
    dataSource as never,
    {} as never,
    {} as never,
    crypto as never,
    {} as never,
    {} as never,
    crm as never,
    billing as never,
    support as never,
    {} as never,
    audit as never,
    users as never,
  );
  return { service, qr, users, billing, support, audit };
}

type Internals = {
  loadMappings: (tenant: unknown) => Promise<unknown>;
  userResolver: (
    qr: unknown,
    tenantId: string,
    mappings: unknown,
  ) => Promise<(n: string) => string | null>;
  promoteTitular: (...args: unknown[]) => Promise<void>;
};

describe('MigrationPromotionService — atribución por equivalencia USUARIO', () => {
  const tenant = { tenantId: TENANT, schemaName: SCHEMA, tenantSlug: 'prueba' };

  it('resuelve solo equivalencias EQUIVALE hacia usuarios vigentes', async () => {
    const { service, qr, users } = build();
    const internals = service as unknown as Internals;
    const mappings = await internals.loadMappings(tenant);
    const resolve = await internals.userResolver(qr, TENANT, mappings);
    expect(resolve('7')).toBe(ANA);
    // El id se normaliza a minúsculas, como lo devuelve PostgreSQL.
    expect(resolve('8')).toBe(LUIS);
    expect(resolve('9')).toBeNull();
    expect(resolve('404')).toBeNull();
    expect(users.existingUserIds).toHaveBeenCalledWith({ manager: qr.manager, tenantId: TENANT }, [
      ANA,
      LUIS,
      BORRADO,
    ]);
  });

  it('promueve ticket y pago con asignado, autores, creador y registrador enlazados', async () => {
    const { service, qr, billing, support } = build();
    const internals = service as unknown as Internals;
    const mappings = await internals.loadMappings(tenant);
    const resolve = await internals.userResolver(qr, TENANT, mappings);
    const parse = (row: ReturnType<typeof staged>) => {
      const { payload_encrypted, ...rest } = row;
      return { ...rest, payload: JSON.parse(payload_encrypted) };
    };
    const group = {
      subscriber: parse(staged('SUSCRIPTOR', {}, { external_id: 'uisp:client:1' })),
      rows: [parse(staged('PAGO', paymentRaw)), parse(staged('TICKET', ticketRaw))],
    };
    await internals.promoteTitular(
      qr,
      tenant,
      BATCH,
      ACTOR,
      group,
      mappings,
      new Map(),
      [],
      resolve,
    );

    expect(billing.createImportedPayment).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTOR }),
      expect.objectContaining({ subscriberId: SUBSCRIBER, createdBy: LUIS }),
    );
    const [, ticket] = support.createImportedTicket.mock.calls[0]!;
    expect(ticket).toMatchObject({ assignedUserId: LUIS, createdByUserId: ANA });
    // Cada fila creada registra quién la importó (sin PII: solo el id).
    const metas = qr.query.mock.calls
      .filter(([sql]) => String(sql).includes('promotion_meta = $3'))
      .map(([, params]) => JSON.parse(String((params as unknown[])[2])));
    expect(metas).toEqual(expect.arrayContaining([{ importedBy: ACTOR }, { importedBy: ACTOR }]));
    expect(metas.filter((meta) => meta.importedBy === ACTOR)).toHaveLength(2);
    expect(ticket.comments.map((c: { authorUserId: string | null }) => c.authorUserId)).toEqual([
      ANA,
      null,
      null,
    ]);
  });

  it('sin equivalencias: todo queda a nombre de quien importa (null en los puertos)', async () => {
    const { service, qr, billing, support } = build();
    const internals = service as unknown as Internals;
    const mappings = await internals.loadMappings(tenant);
    const parse = (row: ReturnType<typeof staged>) => {
      const { payload_encrypted, ...rest } = row;
      return { ...rest, payload: JSON.parse(payload_encrypted) };
    };
    const group = {
      subscriber: parse(staged('SUSCRIPTOR', {}, { external_id: 'uisp:client:1' })),
      rows: [parse(staged('PAGO', paymentRaw)), parse(staged('TICKET', ticketRaw))],
    };
    await internals.promoteTitular(
      qr,
      tenant,
      BATCH,
      ACTOR,
      group,
      mappings,
      new Map(),
      [],
      () => null,
    );
    expect(billing.createImportedPayment.mock.calls[0]![1]).toMatchObject({ createdBy: null });
    expect(support.createImportedTicket.mock.calls[0]![1]).toMatchObject({
      assignedUserId: null,
      createdByUserId: null,
    });
  });

  describe('refreshAuthors («Actualizar autores»)', () => {
    const scope = { tenantId: TENANT, schemaName: SCHEMA };
    const promoted = [
      staged('TICKET', ticketRaw, {
        status: 'PROMOVIDO',
        promoted_id: 'ticket-1',
        imported_by: RETRY_ACTOR,
      }),
      staged('PAGO', paymentRaw, { status: 'PROMOVIDO', promoted_id: 'payment-1' }),
      staged('PAGO', { userId: 404 }, { status: 'PROMOVIDO', promoted_id: 'payment-2' }),
    ];

    it('re-atribuye por los puertos con quien importó, cuenta y audita sin PII', async () => {
      const { service, qr, billing, support, audit } = build({ stagedRows: promoted });
      const result = await service.refreshAuthors(scope, BATCH, ACTOR);
      expect(result).toEqual({
        tickets: 1,
        comentarios: 1,
        pagos: 1,
        respetados: 2,
        sinEnlazar: 2,
      });

      const [ctx, tickets] = support.refreshImportedAuthors.mock.calls[0]!;
      expect(ctx).toMatchObject({
        tenantId: TENANT,
        batchId: BATCH,
        actorId: ACTOR,
        importerIds: [ACTOR, PROMOTER, RETRY_ACTOR],
      });
      expect(tickets).toEqual([
        {
          ticketId: 'ticket-1',
          assignedUserId: LUIS,
          createdByUserId: ANA,
          comments: [
            { body: 'Abre', createdAt: '2023-03-01T00:00:00.000Z', authorUserId: ANA },
            { body: 'Borrado', createdAt: null, authorUserId: null },
            { body: 'Sin enlazar', createdAt: null, authorUserId: null },
          ],
        },
      ]);
      // Solo pagos con registrador enlazado.
      expect(billing.refreshImportedPaymentAuthors.mock.calls[0]![1]).toEqual([
        { paymentId: 'payment-1', createdBy: LUIS },
      ]);
      const counts = qr.query.mock.calls.find(([sql]) =>
        String(sql).includes('USUARIO_UISP_SIN_ENLAZAR'),
      )!;
      // 9 (usuario borrado) y 404 (sin equivalencia).
      expect(counts[1]).toEqual([TENANT, BATCH, 2]);
      // S-4: una entrada por fila cambiada (ids de usuario, sin PII) y luego el resumen.
      const rowEntries = audit.logWithin.mock.calls.slice(0, 3).map(([e]) => e);
      expect(rowEntries).toEqual([
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'SupportTicket',
          entityId: 'ticket-1',
          userId: ACTOR,
          oldValue: { assigned_user_id: null },
          newValue: { assigned_user_id: LUIS, origen: 'ACTUALIZAR_AUTORES', batchId: BATCH },
        }),
        expect.objectContaining({
          entityType: 'TicketComment',
          entityId: 'comment-1',
          oldValue: { author_user_id: ACTOR },
          newValue: { author_user_id: ANA, origen: 'ACTUALIZAR_AUTORES', batchId: BATCH },
        }),
        expect.objectContaining({
          entityType: 'BillingPayment',
          entityId: 'payment-1',
          oldValue: { created_by: ACTOR },
          newValue: { created_by: LUIS, origen: 'ACTUALIZAR_AUTORES', batchId: BATCH },
        }),
      ]);
      const entry = audit.logWithin.mock.calls[3]![0];
      expect(entry).toMatchObject({
        entityId: BATCH,
        userId: ACTOR,
        newValue: { action: 'ACTUALIZAR_AUTORES', tickets: 1, pagos: 1, sinEnlazar: 2 },
      });
      expect(JSON.stringify(entry)).not.toContain('Abre');
      expect(qr.commitTransaction).toHaveBeenCalled();
    });

    it('lote inexistente → 404', async () => {
      const { service } = build({ batch: null });
      await expect(service.refreshAuthors(scope, BATCH, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([
      [{ status: 'PROMOVIDO', purged_at: new Date() }, 'MIGRATION_BATCH_PURGED'],
      [{ status: 'SIMULADO', purged_at: null }, 'MIGRATION_BATCH_NOT_RECONCILABLE'],
      [{ status: 'REVERTIDO', purged_at: null }, 'MIGRATION_BATCH_NOT_RECONCILABLE'],
    ])('lote %o → 409 %s y no toca nada', async (batch, code) => {
      const { service, support, billing } = build({
        batch: { ...batch, created_by: ACTOR, promoted_by: ACTOR },
      });
      const error = await service.refreshAuthors(scope, BATCH, ACTOR).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code });
      expect(support.refreshImportedAuthors).not.toHaveBeenCalled();
      expect(billing.refreshImportedPaymentAuthors).not.toHaveBeenCalled();
    });
  });
});
