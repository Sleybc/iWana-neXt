import { runInTenantSchema } from '@iwana/db';
import { AccessPermissionKey, SlaBreachStatus, TicketRequesterType, UserRole } from '@iwana/shared';
import { Brackets, type DataSource } from 'typeorm';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ListTicketsQuerySchema } from '../dto';
import { TicketsService } from '../services/tickets.service';
import { WORK_QUEUE_PREDICATE_SQL } from '../services/ticket-list-sql';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  summarizeErrorForLog: (error: unknown) =>
    `class=${(error as Error)?.constructor?.name ?? 'unknown'}`,
  SupportTicket: class SupportTicket {},
  TicketSlaPolicy: class TicketSlaPolicy {},
  TicketWorkOrderLink: class TicketWorkOrderLink {},
}));

const SUB_OK = '11111111-1111-4111-8111-111111111111';
const SUB_BLOCKED = '22222222-2222-4222-8222-222222222222';

/** Bandeja paso 2 (spec MOD10 bandeja §3 J–L): cola, búsqueda y nombre del solicitante. */
describe('TicketsService.list — colas, búsqueda y cliente en la fila', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };
  let andWhere: jest.Mock;
  let qrQuery: jest.Mock;
  let crm: {
    listContractIds: jest.Mock;
    findExpedienteId: jest.Mock;
    resolveTicketParties: jest.Mock;
    findTicketRequesterIdsByName: jest.Mock;
  };
  let permissions: string[];
  let qr: { manager: { createQueryBuilder: jest.Mock }; query: jest.Mock };

  const tickets = [
    { id: 't-1', requesterType: TicketRequesterType.SUBSCRIBER, requesterRefId: SUB_OK },
    { id: 't-2', requesterType: TicketRequesterType.SUBSCRIBER, requesterRefId: SUB_BLOCKED },
    { id: 't-3', requesterType: TicketRequesterType.INTERNAL_USER, requesterRefId: 'u-9' },
  ];

  const build = () =>
    new TicketsService(
      {} as DataSource,
      { deriveBreachStatus: () => SlaBreachStatus.OK } as never,
      {} as never,
      {} as never,
      {} as never,
      crm as never,
      undefined,
      undefined,
      { getEffectivePermissionsForUser: async () => permissions } as never,
      undefined,
    );

  const names = (data: unknown[]) =>
    (data as Array<{ requesterDisplayName: unknown }>).map((row) => row.requesterDisplayName);

  const withCrmRead = () => {
    permissions = [
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    ];
  };

  beforeEach(() => {
    permissions = [AccessPermissionKey.ASSURANCE_TICKETS_READ];
    andWhere = jest.fn().mockReturnThis();
    qrQuery = jest.fn().mockResolvedValue(undefined);
    const qb = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      andWhere,
      getCount: jest.fn().mockResolvedValue(3),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: tickets, raw: [] }),
      alias: 'st',
    };
    qr = { manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) }, query: qrQuery };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) => fn(qr));
    crm = {
      listContractIds: jest.fn().mockResolvedValue([]),
      findExpedienteId: jest.fn().mockResolvedValue(null),
      resolveTicketParties: jest.fn().mockResolvedValue([
        {
          type: 'SUBSCRIBER',
          id: SUB_OK,
          state: 'AVAILABLE',
          displayName: 'Cliente Visible',
          profile: null,
        },
        {
          type: 'SUBSCRIBER',
          id: SUB_BLOCKED,
          state: 'PROTECTED',
          displayName: null,
          profile: null,
        },
      ]),
      findTicketRequesterIdsByName: jest.fn().mockResolvedValue([SUB_OK]),
    };
  });

  describe('J · cola de trabajo', () => {
    it.each(Object.entries(WORK_QUEUE_PREDICATE_SQL))(
      '%s aplica su predicado con el actor del JWT',
      async (queue, predicate) => {
        await build().list({ workQueue: queue } as never, actor);
        expect(andWhere).toHaveBeenCalledWith(predicate, { workQueueActorId: 'support-001' });
      },
    );

    it('se combina con los filtros sueltos (estado y área siguen en el WHERE)', async () => {
      await build().list(
        { workQueue: 'unassigned', status: 'OPEN', queueName: 'NOC' } as never,
        actor,
      );
      const clauses = andWhere.mock.calls.map((call) => call[0]);
      expect(clauses).toContain('st.status = :status');
      expect(clauses).toContain('st.queue_name = :queueName');
      expect(clauses).toContain(WORK_QUEUE_PREDICATE_SQL.unassigned);
    });

    it('rechaza una cola desconocida (400 por Zod)', () => {
      expect(ListTicketsQuerySchema.safeParse({ workQueue: 'open' }).success).toBe(false);
    });

    it('activo excluye resueltos, cerrados y cancelados en mine, unassigned y all', () => {
      for (const queue of ['mine', 'unassigned', 'all'] as const) {
        expect(WORK_QUEUE_PREDICATE_SQL[queue]).toContain(
          "st.status NOT IN ('CANCELLED', 'CLOSED', 'RESOLVED')",
        );
      }
    });
  });

  describe('K · búsqueda', () => {
    it('sin crm.subscribers.read no consulta CRM: solo número y asunto', async () => {
      await build().list({ search: '  ana  ' } as never, actor);
      expect(crm.findTicketRequesterIdsByName).not.toHaveBeenCalled();
      const call = andWhere.mock.calls.find((args) => args[0] instanceof Brackets);
      expect(call?.[1]).toEqual({ searchPattern: '%ana%' });
    });

    it('con crm.subscribers.read pide los ids al puerto CRM con el qr de la transacción', async () => {
      withCrmRead();
      await build().list({ search: 'ana' } as never, actor);
      expect(crm.findTicketRequesterIdsByName).toHaveBeenCalledWith('ana', qr);
    });

    it('escapa comodines de ILIKE', async () => {
      await build().list({ search: String.raw`50%_a\b` } as never, actor);
      const call = andWhere.mock.calls.find((args) => args[0] instanceof Brackets);
      expect(call?.[1]).toEqual({ searchPattern: String.raw`%50\%\_a\\b%` });
    });

    it('rechaza búsquedas de menos de 2 o más de 100 caracteres tras recortar', () => {
      expect(ListTicketsQuerySchema.safeParse({ search: ' a ' }).success).toBe(false);
      expect(ListTicketsQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    });
  });

  describe('L · nombre del solicitante', () => {
    it('sin crm.subscribers.read: no consulta CRM y todos nulos', async () => {
      const result = await build().list({} as never, actor);
      expect(crm.resolveTicketParties).not.toHaveBeenCalled();
      expect(names(result.data)).toEqual([null, null, null]);
    });

    it('con permiso: una sola lectura CRM por página; protegido y no suscriptor, nulos', async () => {
      withCrmRead();
      const result = await build().list({} as never, actor);
      expect(crm.resolveTicketParties).toHaveBeenCalledTimes(1);
      expect(crm.resolveTicketParties).toHaveBeenCalledWith(
        [
          { type: 'SUBSCRIBER', id: SUB_OK },
          { type: 'SUBSCRIBER', id: SUB_BLOCKED },
        ],
        qr,
      );
      expect(names(result.data)).toEqual(['Cliente Visible', null, null]);
    });

    it('si CRM falla: nombres nulos, SAVEPOINT revertido y el listado responde', async () => {
      withCrmRead();
      crm.resolveTicketParties.mockRejectedValue(new Error('caída sintética'));
      const result = await build().list({} as never, actor);
      expect(qrQuery).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT ticket_detail_parties');
      expect(names(result.data)).toEqual([null, null, null]);
      expect(result.meta.total).toBe(3);
    });
  });
});
