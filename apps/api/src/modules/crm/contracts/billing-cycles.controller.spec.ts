import {
  AccessPermissionKey,
  UserRole,
  type CutoffAgendaQuery,
  type CutoffAgendaResponse,
} from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ContractsService } from './contracts.service';
import { BillingCyclesController } from './billing-cycles.controller';

describe('BillingCyclesController', () => {
  const contractsService = {
    getActiveBillingCycles: jest.fn(),
    getCutoffAgenda: jest.fn(),
  };
  const effectivePermissionsService = {
    getEffectivePermissionsForUser: jest.fn(),
  };
  const controller = new BillingCyclesController(
    contractsService as unknown as ContractsService,
    effectivePermissionsService as unknown as EffectivePermissionsService,
  );
  const actor = {
    sub: '00000000-0000-4000-8000-000000000099',
    role: UserRole.SUPPORT,
  } as JwtPayload;
  const query: CutoffAgendaQuery = { date: '2026-11-15', page: 1, limit: 25 };
  const agenda: CutoffAgendaResponse = {
    date: '2026-11-15',
    items: [],
    meta: {
      nextCursor: null,
      total: 0,
      totalIsEstimate: false,
      page: 1,
      limit: 25,
      totalPages: 0,
      hasMore: false,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    },
    withoutCycleCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delega la consulta del catálogo activo', async () => {
    const cycles = [
      {
        cycleDay: 1,
        cutoffDay: 15,
        active: true,
        nextCutoffDate: '2026-11-15',
      },
    ];
    contractsService.getActiveBillingCycles.mockResolvedValue(cycles);

    await expect(controller.getActiveBillingCycles()).resolves.toEqual(cycles);
    expect(contractsService.getActiveBillingCycles).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[], false],
    [[AccessPermissionKey.PRIVACY_READ], true],
    [[AccessPermissionKey.CRM_BLOCKED_DATA_READ], true],
  ])('proyecta la agenda con acceso a datos bloqueados=%s', async (permissions, canSeeBlocked) => {
    effectivePermissionsService.getEffectivePermissionsForUser.mockResolvedValue(permissions);
    contractsService.getCutoffAgenda.mockResolvedValue(agenda);

    await expect(controller.getCutoffAgenda(query, actor)).resolves.toBe(agenda);

    expect(effectivePermissionsService.getEffectivePermissionsForUser).toHaveBeenCalledWith(
      actor.sub,
    );
    expect(contractsService.getCutoffAgenda).toHaveBeenCalledWith(
      query,
      actor.role,
      canSeeBlocked,
      actor.sub,
    );
  });
});
