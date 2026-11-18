import { UserRole } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersController } from '../execution-orders.controller';
import type { ExecutionOrdersService } from '../services/execution-orders.service';
import type { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';
import type { ExecutionOrderConsoleLinksService } from '../services/execution-order-console-links.service';

/** M-5/H-5 y H-1 (contrato v1.8): `getById` emite los enlaces y no filtra el nombre en `site.label`. */
describe('ExecutionOrdersController.getById — enlaces v1.8 y site.label', () => {
  const ORDER_ID = '44444444-4444-4444-8444-444444444444';
  const actor = { sub: 'user-1', role: UserRole.SUPPORT } as unknown as JwtPayload;
  const baseOrder = {
    id: ORDER_ID,
    executionOrderNumber: 'OTE-20261118-001',
    version: 1,
    status: 'ASSIGNED',
    isAnnulled: false,
    result: null,
    workType: 'INSTALLATION',
    templateId: null,
    templateKey: null,
    templateVersionNumber: null,
    templateLabel: null,
    templateRequirementsSnapshot: null,
    scheduleEventId: null,
    plannedWindowStartAt: null,
    plannedWindowEndAt: null,
    assignedTechnicianId: null,
    assignedCrewId: null,
    subscriberId: 'sub-1',
    ticketId: null,
    serviceAddress: 'Calle sintética',
    municipality: null as string | null,
    customerDisplayLabel: 'Titular Bloqueado Sintético',
    startedAt: null,
    closedAt: null,
    createdAt: new Date('2026-11-18T00:00:00Z'),
    updatedAt: new Date('2026-11-18T00:00:00Z'),
  };

  const serviceFor = (order: typeof baseOrder) =>
    ({
      getById: jest.fn().mockResolvedValue(order),
      getCompletion: jest.fn().mockResolvedValue({ progress: 0, completed: 0, total: 0 }),
      hasReversibleItemUsage: jest.fn().mockResolvedValue(false),
      getSyncState: jest.fn().mockResolvedValue('IN_SYNC'),
      computeAllowedActions: jest.fn().mockReturnValue([]),
    }) as unknown as ExecutionOrdersService;

  const build = (order: typeof baseOrder, links?: ExecutionOrderConsoleLinksService) =>
    new ExecutionOrdersController(
      serviceFor(order),
      {} as ExecutionOrderProjectionConvergenceService,
      undefined,
      undefined,
      links,
    );

  it('con el servicio de enlaces emite los tres campos que este resuelve', async () => {
    const resolved = {
      subscriber: {
        id: 'sub-1',
        displayName: 'Ana',
        serviceAddress: 'Calle sintética',
        municipality: 'Pasto',
      },
      sourceTicket: { id: 't-1', number: 'TCK-1' },
      visit: { scheduleEventId: 'e-1' },
    };
    const links = { resolve: jest.fn().mockResolvedValue(resolved) };
    const detail = await build(
      { ...baseOrder, municipality: 'Pasto' },
      links as unknown as ExecutionOrderConsoleLinksService,
    ).getById(ORDER_ID, actor);

    expect(links.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: ORDER_ID }), actor);
    expect(detail).toMatchObject(resolved);
  });

  it('sin el servicio de enlaces los tres campos viajan en null', async () => {
    const detail = await build(baseOrder).getById(ORDER_ID, actor);
    expect(detail.subscriber).toBeNull();
    expect(detail.sourceTicket).toBeNull();
    expect(detail.visit).toBeNull();
  });

  it('H-1: sin municipio, site.label es null y no cae al nombre del cliente (titular bloqueado)', async () => {
    const links = {
      resolve: jest.fn().mockResolvedValue({ subscriber: null, sourceTicket: null, visit: null }),
    };
    const detail = await build(
      baseOrder,
      links as unknown as ExecutionOrderConsoleLinksService,
    ).getById(ORDER_ID, actor);
    expect(detail.site.label).toBeNull();
    expect(JSON.stringify(detail)).not.toContain('Titular Bloqueado Sintético');
  });

  it('H-1: con municipio, site.label sigue siendo el municipio', async () => {
    const detail = await build({ ...baseOrder, municipality: 'Pasto' }).getById(ORDER_ID, actor);
    expect(detail.site).toEqual({ id: ORDER_ID, label: 'Pasto' });
  });
});
