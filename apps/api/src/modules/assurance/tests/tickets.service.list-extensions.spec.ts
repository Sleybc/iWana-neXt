import { runInTenantSchema } from '@iwana/db';
import {
  AccessPermissionKey,
  ListTicketsOrderSchema,
  SlaBreachStatus,
  UserRole,
  VisitRequestStatus,
} from '@iwana/shared';
import type { DataSource } from 'typeorm';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ListTicketsQuerySchema } from '../dto';
import { TicketsService } from '../services/tickets.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  SupportTicket: class SupportTicket {},
  TicketSlaPolicy: class TicketSlaPolicy {},
  TicketWorkOrderLink: class TicketWorkOrderLink {},
}));

/** Listado paso 2 (spec MOD05 pestaña Soporte §16 B-1 a B-3): lote, permisos y orden. */
describe('TicketsService.list — campos del listado y orden', () => {
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };
  const manager = { createQueryBuilder: jest.fn() };
  let orderBy: jest.Mock;
  let addSelect: jest.Mock;
  let names: { findDisplayNames: jest.Mock };
  let visits: { findActiveForTickets: jest.Mock };
  let orders: { findLatestForTicketsWithManager: jest.Mock };
  let permissions: string[];

  const tickets = [
    { id: 't-1', assignedUserId: 'u-1' },
    { id: 't-2', assignedUserId: 'u-gone' },
    { id: 't-3', assignedUserId: null },
  ];

  function build(withPorts = true): TicketsService {
    return new TicketsService(
      {} as DataSource,
      { deriveBreachStatus: () => SlaBreachStatus.OK } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        listContractIds: jest.fn().mockResolvedValue([]),
        findExpedienteId: jest.fn().mockResolvedValue(null),
      } as never,
      (withPorts ? visits : undefined) as never,
      (withPorts ? orders : undefined) as never,
      { getEffectivePermissionsForUser: async () => permissions } as never,
      (withPorts ? names : undefined) as never,
    );
  }

  beforeEach(() => {
    permissions = [AccessPermissionKey.ASSURANCE_TICKETS_READ];
    orderBy = jest.fn().mockReturnThis();
    addSelect = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      addSelect,
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(42),
      orderBy,
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: tickets, raw: [] }),
      alias: 'st',
    };
    manager.createQueryBuilder.mockReturnValue(qb);
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager }),
    );
    names = { findDisplayNames: jest.fn().mockResolvedValue(new Map([['u-1', 'Ana Pérez']])) };
    visits = {
      findActiveForTickets: jest.fn().mockResolvedValue(
        new Map([
          [
            't-1',
            {
              id: 'v-1',
              status: VisitRequestStatus.READY_TO_SCHEDULE,
              windowKind: null,
              windowStartAt: null,
              windowEndAt: null,
              scheduleEventId: null,
            },
          ],
        ]),
      ),
    };
    orders = {
      findLatestForTicketsWithManager: jest.fn().mockResolvedValue(
        new Map([
          [
            't-2',
            {
              id: 'o-1',
              executionOrderNumber: 'OTE-20261117-001',
              status: 'IN_PROGRESS',
              result: null,
              closedAt: null,
            },
          ],
        ]),
      ),
    };
  });

  it('nombres en una sola llamada por página, con el manager de la transacción', async () => {
    const result = await build().list({ limit: 20 } as never, actor);
    expect(names.findDisplayNames).toHaveBeenCalledTimes(1);
    expect(names.findDisplayNames).toHaveBeenCalledWith(manager, 'tenant-001', ['u-1', 'u-gone']);
    expect(
      result.data.map(
        (row) => (row as { assignedUserDisplayName: unknown }).assignedUserDisplayName,
      ),
    ).toEqual(['Ana Pérez', null, null]);
    expect(result.meta.total).toBe(42);
  });

  it('sin permisos de WFM ni órdenes no consulta esos puertos y deja nulos', async () => {
    const result = await build().list({ limit: 20 } as never, actor);
    expect(visits.findActiveForTickets).not.toHaveBeenCalled();
    expect(orders.findLatestForTicketsWithManager).not.toHaveBeenCalled();
    for (const row of result.data as Array<Record<string, unknown>>) {
      expect(row['activeVisit']).toBeNull();
      expect(row['executionOrder']).toBeNull();
    }
  });

  it('con permisos: una llamada por puerto con todos los ids y proyección del contrato', async () => {
    permissions = [
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
      AccessPermissionKey.WFM_SCHEDULE_READ,
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    ];
    const result = await build().list({ limit: 20 } as never, actor);
    const ids = ['t-1', 't-2', 't-3'];
    expect(visits.findActiveForTickets).toHaveBeenCalledWith(manager, 'tenant-001', ids);
    expect(orders.findLatestForTicketsWithManager).toHaveBeenCalledWith(manager, 'tenant-001', ids);
    const [first, second] = result.data as Array<Record<string, unknown>>;
    expect(first!['activeVisit']).toMatchObject({ id: 'v-1', windowKind: null });
    expect(first!['executionOrder']).toBeNull();
    expect(second!['executionOrder']).toEqual({
      id: 'o-1',
      number: 'OTE-20261117-001',
      status: 'IN_PROGRESS',
      result: null,
      closedAt: null,
    });
  });

  it('sin puertos cableados: todo nulo, sin fallar', async () => {
    permissions = [AccessPermissionKey.WFM_SCHEDULE_READ];
    const result = await build(false).list({ limit: 20 } as never, actor);
    for (const row of result.data as Array<Record<string, unknown>>) {
      expect(row['assignedUserDisplayName']).toBeNull();
      expect(row['activeVisit']).toBeNull();
      expect(row['executionOrder']).toBeNull();
    }
  });

  it('order=urgency ordena en servidor; por defecto, más reciente primero', async () => {
    await build().list({ limit: 20, order: 'urgency' } as never, actor);
    expect(orderBy).toHaveBeenCalledWith('urgency_closed', 'ASC');
    expect(addSelect.mock.calls.map(([, alias]) => alias)).toEqual(
      expect.arrayContaining(['urgency_deadline_state', 'urgency_priority', 'urgency_deadline']),
    );

    orderBy.mockClear();
    await build().list({ limit: 20 } as never, actor);
    expect(orderBy).toHaveBeenCalledWith('st.created_at', 'DESC');
  });

  it('la query rechaza un orden desconocido y por defecto es recent', () => {
    expect(ListTicketsQuerySchema.safeParse({ order: 'priority' }).success).toBe(false);
    expect(ListTicketsQuerySchema.parse({}).order).toBe('recent');
    expect(ListTicketsOrderSchema.parse('urgency')).toBe('urgency');
  });

  it('order=urgency con sortBy se rechaza (400): el orden por urgencia no se combina', () => {
    const parsed = ListTicketsQuerySchema.safeParse({ order: 'urgency', sortBy: 'createdAt' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['sortBy']);
    expect(ListTicketsQuerySchema.safeParse({ order: 'recent', sortBy: 'createdAt' }).success).toBe(
      true,
    );
    expect(ListTicketsQuerySchema.safeParse({ sortBy: 'createdAt' }).success).toBe(true);
    expect(ListTicketsQuerySchema.safeParse({ order: 'urgency' }).success).toBe(true);
  });
});
