import { UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { AssuranceFieldServiceProcessor } from './assurance-field-service.processor';
import {
  type FieldServiceRequest,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
}));

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

function buildPayload(overrides: Partial<FieldServiceRequest> = {}): FieldServiceRequest {
  return {
    ticketId: '00000000-0000-4000-8000-000000000001',
    linkId: '00000000-0000-4000-8000-000000000002',
    tenantId: 'tenant-001',
    schemaName: 'tenant_test_ops',
    requestedByUserId: 'user-001',
    ...overrides,
  };
}

const TICKET_ROW = {
  ticket_number: 'TK-20261117-003',
  subject: 'Visita técnica requerida por caída de servicio',
  priority: 'CRITICAL',
};
const LINK_ROW = { notes: 'Coordinar con soporte NOC antes de salir.' };

interface Rows {
  ticket?: unknown;
  link?: unknown;
  duplicate?: unknown;
}

function buildProcessor(rows: Rows = {}) {
  const ticket = 'ticket' in rows ? rows.ticket : TICKET_ROW;
  const link = 'link' in rows ? rows.link : LINK_ROW;
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SET LOCAL lock_timeout')) return [];
    if (sql.includes('FROM support_tickets')) return ticket ? [ticket] : [];
    if (sql.includes('FROM ticket_work_order_links')) return link ? [link] : [];
    throw new Error(`SQL inesperado: ${sql}`);
  });
  const andWhere = jest.fn().mockReturnThis();
  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(rows.duplicate ?? null),
    }),
    create: jest.fn().mockImplementation((_entity, data) => data),
    save: jest.fn().mockResolvedValue(undefined),
  };

  mockRunInTenantSchema.mockImplementation(
    async (
      _ds: unknown,
      _schemaName: string,
      callback: (qr: { manager: typeof manager; query: jest.Mock }) => Promise<unknown>,
    ) => callback({ manager, query }),
  );

  const processor = new AssuranceFieldServiceProcessor({} as DataSource);
  return { processor, manager, andWhere, query };
}

describe('AssuranceFieldServiceProcessor', () => {
  beforeEach(() => {
    mockRunInTenantSchema.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('materializa una VisitRequest NEEDS_CONTEXT con asunto y notas leídos del schema tenant', async () => {
    const { processor, manager, query } = buildProcessor();
    const payload = buildPayload();

    await processor.process({ name: 'request-field-service', data: payload } as never);

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      payload.schemaName,
      expect.any(Function),
    );
    // sec-eng C-1: el texto libre se lee en la transacción, no del payload. El ticket se toma
    // FOR SHARE para esperar el commit de la transacción del API que encoló el job.
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/^SET LOCAL lock_timeout/));
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FOR SHARE/), [
      payload.ticketId,
      payload.tenantId,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ticket_work_order_links'), [
      payload.linkId,
      payload.ticketId,
      payload.tenantId,
    ]);
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: payload.tenantId,
        status: VisitRequestStatus.NEEDS_CONTEXT,
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: payload.ticketId,
        originLabel: 'Ticket TK-20261117-003',
        workType: WfmWorkType.SUPPORT,
        priority: WorkOrderPriority.URGENT,
        title: TICKET_ROW.subject,
        description: LINK_ROW.notes,
        ticketId: payload.ticketId,
        requestedByUserId: payload.requestedByUserId,
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('ignora asunto y notas de un job antiguo que todavía los traiga', async () => {
    const { processor, manager } = buildProcessor();
    const legacy = { ...buildPayload(), subject: 'texto viejo', notes: 'nota vieja' };

    await processor.process({ name: 'request-field-service', data: legacy } as never);

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: TICKET_ROW.subject, description: LINK_ROW.notes }),
    );
  });

  it('job antiguo sin linkId: toma las notas de la última solicitud del ticket', async () => {
    const { processor, manager, query } = buildProcessor();
    const { linkId: _omit, ...legacy } = buildPayload();

    await processor.process({ name: 'request-field-service', data: legacy } as never);

    expect(query).toHaveBeenCalledWith(expect.stringMatching(/ORDER BY requested_at DESC/), [
      legacy.ticketId,
      legacy.tenantId,
    ]);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('ticket sin número: rótulo genérico, nunca el identificador interno', async () => {
    const { processor, manager } = buildProcessor({
      ticket: { ...TICKET_ROW, ticket_number: null },
    });

    await processor.process({ name: 'request-field-service', data: buildPayload() } as never);

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ originLabel: 'Ticket de Mesa de ayuda' }),
    );
  });

  it('sin el vínculo (transacción del API revertida) no crea visita', async () => {
    const { processor, manager } = buildProcessor({ link: null });

    await processor.process({ name: 'request-field-service', data: buildPayload() } as never);

    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('sin el ticket en el schema no crea visita', async () => {
    const { processor, manager } = buildProcessor({ ticket: null });

    await processor.process({ name: 'request-field-service', data: buildPayload() } as never);

    expect(manager.create).not.toHaveBeenCalled();
  });

  it('no crea segunda visita Assurance si ya existe una activa para el mismo ticket', async () => {
    const { processor, manager, andWhere } = buildProcessor({
      duplicate: { id: 'vr-legacy-001', workType: WfmWorkType.TECHNICAL_VISIT },
    });

    await processor.process({ name: 'request-field-service', data: buildPayload() } as never);

    expect(andWhere).not.toHaveBeenCalledWith('vr.work_type = :workType', expect.anything());
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza payloads con schemaName invalido', async () => {
    const { processor } = buildProcessor();

    await expect(
      processor.process({
        name: 'request-field-service',
        data: buildPayload({ schemaName: 'public;drop schema' }),
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
