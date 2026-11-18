import { ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketRequesterType,
  TicketStatus,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TicketsService } from '../services/tickets.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ tenantId: 'tenant-001', schemaName: 'tenant_001' }),
  },
  runInTenantSchema: jest.fn(),
  SupportTicket: class SupportTicket {},
  TicketSlaPolicy: class TicketSlaPolicy {},
  TicketWorkOrderLink: class TicketWorkOrderLink {},
  summarizeErrorForLog: jest.requireActual(
    '../../../../../../packages/database/src/summarize-error-for-log',
  ).summarizeErrorForLog,
}));

/**
 * Revisión de la API del detalle MOD10 (S-1, S-2, S-7): permisos de lectura de los módulos
 * destino con los permisos efectivos de quien consulta, y log del fail-closed sin datos.
 */
describe('TicketsService — permisos del detalle y de la búsqueda de orden', () => {
  const TICKET_ID = '11111111-1111-4111-8111-111111111111';
  const SUBSCRIBER_ID = '22222222-2222-4222-8222-222222222222';
  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };
  const ticket = {
    id: TICKET_ID,
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: SUBSCRIBER_ID,
    subjectType: null,
    subjectRefId: null,
    assignedUserId: null,
  };
  const visit = {
    id: '33333333-3333-4333-8333-333333333333',
    status: 'SCHEDULED',
    windowKind: 'SCHEDULED',
    windowStartAt: '2026-11-20T13:00:00.000Z',
    windowEndAt: '2026-11-20T15:00:00.000Z',
    scheduleEventId: null,
  };
  const order = {
    id: '44444444-4444-4444-8444-444444444444',
    executionOrderNumber: 'OTE-20261116-001',
    status: 'ASSIGNED',
    result: null,
    closedAt: null,
  };

  let permissions: string[];
  let fieldServiceWorkPort: { findActiveForTicket: jest.Mock };
  let executionOrderReadPort: {
    findLatestForTicketWithManager: jest.Mock;
    findByNumber: jest.Mock;
  };
  let crmPort: { resolveTicketParties: jest.Mock; assertWritableReferences: jest.Mock };
  let qrQuery: jest.Mock;
  let service: TicketsService;

  beforeEach(() => {
    jest.clearAllMocks();
    permissions = [AccessPermissionKey.ASSURANCE_TICKETS_READ];
    fieldServiceWorkPort = { findActiveForTicket: jest.fn().mockResolvedValue(visit) };
    executionOrderReadPort = {
      findLatestForTicketWithManager: jest.fn().mockResolvedValue({ latest: order, count: 3 }),
      findByNumber: jest.fn().mockResolvedValue({ ...order, isAnnulled: false, ticketId: null }),
    };
    crmPort = {
      resolveTicketParties: jest.fn().mockResolvedValue([]),
      assertWritableReferences: jest.fn(),
    };
    qrQuery = jest.fn().mockResolvedValue(undefined);
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, fn) =>
      fn({ manager: { findOne: jest.fn().mockResolvedValue(ticket) }, query: qrQuery }),
    );
    service = new TicketsService(
      {} as DataSource,
      { deriveBreachStatus: () => SlaBreachStatus.OK } as never,
      { isPqrRecordComplete: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      crmPort as never,
      fieldServiceWorkPort as never,
      executionOrderReadPort as never,
      { getEffectivePermissionsForUser: async () => permissions } as never,
    );
  });

  describe('S-1 getDetail (CA-12)', () => {
    it('sin wfm.schedule.read ni operations.execution_orders.read: visita, orden y total nulos, sin consultar', async () => {
      const result = await service.getDetail(TICKET_ID, actor);
      expect(result.activeVisit).toBeNull();
      expect(result.executionOrder).toBeNull();
      expect(result.executionOrderCount).toBeNull();
      expect(fieldServiceWorkPort.findActiveForTicket).not.toHaveBeenCalled();
      expect(executionOrderReadPort.findLatestForTicketWithManager).not.toHaveBeenCalled();
    });

    it('con wfm.schedule.read solo: visita sí, orden y total nulos', async () => {
      permissions = [AccessPermissionKey.WFM_SCHEDULE_READ];
      const result = await service.getDetail(TICKET_ID, actor);
      expect(result.activeVisit).toEqual(visit);
      expect(result.executionOrder).toBeNull();
      expect(result.executionOrderCount).toBeNull();
    });

    it('con operations.execution_orders.read solo: orden y total sí, visita nula', async () => {
      permissions = [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ];
      const result = await service.getDetail(TICKET_ID, actor);
      expect(result.activeVisit).toBeNull();
      expect(result.executionOrder).toEqual({
        id: order.id,
        number: order.executionOrderNumber,
        status: order.status,
        result: null,
        closedAt: null,
      });
      expect(result.executionOrderCount).toBe(3);
    });

    it('con permiso de órdenes y sin órdenes: total cero, no nulo', async () => {
      permissions = [AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ];
      executionOrderReadPort.findLatestForTicketWithManager.mockResolvedValue(null);
      const result = await service.getDetail(TICKET_ID, actor);
      expect(result.executionOrder).toBeNull();
      expect(result.executionOrderCount).toBe(0);
    });
  });

  describe('S-7 log del fail-closed de CRM', () => {
    it('registra código y ticket; nunca nombre ni referencia', async () => {
      permissions = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
      crmPort.resolveTicketParties.mockRejectedValue(
        new ServiceUnavailableException({
          code: 'PRIVACY_MARKS_UNAVAILABLE',
          message: `Titular Sintético ${SUBSCRIBER_ID}`,
        }),
      );
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const result = await service.getDetail(TICKET_ID, actor);
      expect(result.requester).toMatchObject({ nameState: 'UNAVAILABLE', displayName: null });
      expect(qrQuery).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT ticket_detail_parties');
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]![0]);
      expect(message).toContain(TICKET_ID);
      expect(message).toContain('class=ServiceUnavailableException');
      expect(message).not.toContain(SUBSCRIBER_ID);
      expect(message).not.toContain('Titular Sintético');
      warn.mockRestore();
    });

    it('error sin código: registra el nombre de la clase, no el mensaje', async () => {
      permissions = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
      crmPort.resolveTicketParties.mockRejectedValue(new TypeError('Titular Sintético'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await service.getDetail(TICKET_ID, actor);
      const message = String(warn.mock.calls[0]![0]);
      expect(message).toContain('class=TypeError');
      expect(message).not.toContain('Titular Sintético');
      warn.mockRestore();
    });
  });

  describe('S-2 lookupExecutionOrder', () => {
    it('403 sin operations.execution_orders.read, sin consultar la orden', async () => {
      permissions = [
        AccessPermissionKey.ASSURANCE_TICKETS_READ,
        AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
      ];
      await expect(
        service.lookupExecutionOrder('OTE-20261116-001', undefined, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(executionOrderReadPort.findByNumber).not.toHaveBeenCalled();
    });

    it('con el permiso de órdenes busca y responde', async () => {
      permissions = [
        AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      ];
      await expect(
        service.lookupExecutionOrder('OTE-20261116-001', TICKET_ID, actor),
      ).resolves.toMatchObject({ id: order.id, linkedTicket: 'NONE' });
      expect(executionOrderReadPort.findByNumber).toHaveBeenCalledWith('OTE-20261116-001');
    });
  });
});
