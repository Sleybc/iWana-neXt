import type { DataSource } from 'typeorm';
import { AccessPermissionKey } from '@iwana/shared';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  ExecutionOrderConsoleLinksService,
  type ExecutionOrderConsoleLinkSource,
} from '../services/execution-order-console-links.service';
import type { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import type {
  CrmSubscriberReadPort,
  CrmTicketPartySnapshot,
} from '../../crm/ports/crm-subscriber-read.port';
import type { AssuranceTicketReferenceReadPort } from '../../assurance/ports/assurance-ticket-reference-read.port';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: { getOrThrow: jest.fn() },
  runInTenantSchema: jest.fn(),
}));

const SUBSCRIBER_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const ALL = [
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
];

const order: ExecutionOrderConsoleLinkSource = {
  subscriberId: SUBSCRIBER_ID,
  ticketId: TICKET_ID,
  scheduleEventId: EVENT_ID,
  serviceAddress: 'Calle 1 # 2-3',
  municipality: 'Pasto',
};

function snapshot(state: CrmTicketPartySnapshot['state']): CrmTicketPartySnapshot {
  return {
    type: 'SUBSCRIBER',
    id: SUBSCRIBER_ID,
    state,
    displayName: state === 'AVAILABLE' ? 'Cliente Prueba' : null,
    profile: state === 'NOT_FOUND' ? null : { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
  };
}

describe('ExecutionOrderConsoleLinksService (contrato v1.8, CA-9/CA-10)', () => {
  const qr = { query: jest.fn().mockResolvedValue(undefined) };
  const getPermissions = jest.fn();
  const resolveTicketParties = jest.fn();
  const findTicketReference = jest.fn();
  const build = () =>
    new ExecutionOrderConsoleLinksService(
      {} as DataSource,
      { getEffectivePermissionsForUser: getPermissions } as unknown as EffectivePermissionsService,
      { resolveTicketParties } as unknown as CrmSubscriberReadPort,
      { findTicketReference } as unknown as AssuranceTicketReferenceReadPort,
    );
  const actor = { sub: 'user-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-a',
      schemaName: 'tenant_a',
    });
    (runInTenantSchema as jest.Mock).mockImplementation((_ds, _schema, work) => work(qr));
    getPermissions.mockResolvedValue(ALL);
    resolveTicketParties.mockResolvedValue([snapshot('AVAILABLE')]);
    findTicketReference.mockResolvedValue({ id: TICKET_ID, number: 'TCK-20261118-001' });
  });

  it('con los tres permisos emite los tres enlaces y el cliente sin teléfono ni documento', async () => {
    const links = await build().resolve(order, actor);

    expect(links).toEqual({
      subscriber: {
        id: SUBSCRIBER_ID,
        displayName: 'Cliente Prueba',
        serviceAddress: 'Calle 1 # 2-3',
        municipality: 'Pasto',
      },
      sourceTicket: { id: TICKET_ID, number: 'TCK-20261118-001' },
      visit: { scheduleEventId: EVENT_ID },
    });
    expect(Object.keys(links.subscriber!).sort()).toEqual([
      'displayName',
      'id',
      'municipality',
      'serviceAddress',
    ]);
    expect(resolveTicketParties).toHaveBeenCalledWith(
      [{ type: 'SUBSCRIBER', id: SUBSCRIBER_ID }],
      qr,
    );
    expect(findTicketReference).toHaveBeenCalledWith(TICKET_ID, qr);
    expect(runInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_a',
      expect.any(Function),
    );
  });

  it('sin crm.subscribers.read el suscriptor es null y CRM no se consulta', async () => {
    getPermissions.mockResolvedValue([
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
      AccessPermissionKey.WFM_SCHEDULE_READ,
    ]);
    const links = await build().resolve(order, actor);
    expect(links.subscriber).toBeNull();
    expect(links.sourceTicket).not.toBeNull();
    expect(links.visit).not.toBeNull();
    expect(resolveTicketParties).not.toHaveBeenCalled();
  });

  it('sin assurance.tickets.read el ticket es null y Assurance no se consulta', async () => {
    getPermissions.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.WFM_SCHEDULE_READ,
    ]);
    const links = await build().resolve(order, actor);
    expect(links.sourceTicket).toBeNull();
    expect(links.subscriber).not.toBeNull();
    expect(findTicketReference).not.toHaveBeenCalled();
  });

  it('sin wfm.schedule.read la visita es null', async () => {
    getPermissions.mockResolvedValue([
      AccessPermissionKey.CRM_SUBSCRIBERS_READ,
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
    ]);
    const links = await build().resolve(order, actor);
    expect(links.visit).toBeNull();
    expect(links.subscriber).not.toBeNull();
  });

  it('sin ningún permiso no abre transacción y los tres son null', async () => {
    getPermissions.mockResolvedValue([]);
    expect(await build().resolve(order, actor)).toEqual({
      subscriber: null,
      sourceTicket: null,
      visit: null,
    });
    expect(runInTenantSchema).not.toHaveBeenCalled();
  });

  it.each(['PROTECTED', 'NOT_FOUND'] as const)(
    'titular %s (bloqueado o suprimido / inexistente): sin nombre, dirección ni enlace',
    async (state) => {
      resolveTicketParties.mockResolvedValue([snapshot(state)]);
      const links = await build().resolve(order, actor);
      expect(links.subscriber).toBeNull();
      expect(JSON.stringify(links)).not.toContain('Calle 1');
      expect(JSON.stringify(links)).not.toContain('Pasto');
    },
  );

  it('si CRM no puede verificar la privacidad oculta el suscriptor sin romper el resto', async () => {
    resolveTicketParties.mockRejectedValue(new Error('PRIVACY_MARKS_UNAVAILABLE'));
    const links = await build().resolve(order, actor);
    expect(links.subscriber).toBeNull();
    expect(links.sourceTicket).not.toBeNull();
    expect(qr.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT eo_console_subscriber');
  });

  it('si Assurance falla o el ticket no existe, el ticket es null', async () => {
    findTicketReference.mockRejectedValueOnce(new Error('boom'));
    expect((await build().resolve(order, actor)).sourceTicket).toBeNull();
    findTicketReference.mockResolvedValueOnce(null);
    expect((await build().resolve(order, actor)).sourceTicket).toBeNull();
  });

  it('si los permisos no se pueden leer, todo es null (fail-closed)', async () => {
    getPermissions.mockRejectedValue(new Error('redis down'));
    expect(await build().resolve(order, actor)).toEqual({
      subscriber: null,
      sourceTicket: null,
      visit: null,
    });
  });

  it('OT sin suscriptor, ticket ni evento: null sin consultar puertos', async () => {
    const links = await build().resolve(
      { ...order, subscriberId: null, ticketId: null, scheduleEventId: null },
      actor,
    );
    expect(links).toEqual({ subscriber: null, sourceTicket: null, visit: null });
    expect(resolveTicketParties).not.toHaveBeenCalled();
    expect(findTicketReference).not.toHaveBeenCalled();
  });

  it('sin el servicio de permisos no emite enlaces', async () => {
    const service = new ExecutionOrderConsoleLinksService({} as DataSource);
    expect(await service.resolve(order, actor)).toEqual({
      subscriber: null,
      sourceTicket: null,
      visit: null,
    });
  });

  it('H-3: si la transacción no abre, el detalle no falla y suscriptor y ticket son null', async () => {
    (runInTenantSchema as jest.Mock).mockRejectedValueOnce(new Error('pool timeout'));
    expect(await build().resolve(order, actor)).toEqual({
      subscriber: null,
      sourceTicket: null,
      visit: { scheduleEventId: EVENT_ID },
    });
  });
});
