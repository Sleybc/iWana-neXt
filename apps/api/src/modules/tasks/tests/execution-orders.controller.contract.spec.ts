import { ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { ExecutionOrdersController } from '../execution-orders.controller';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import type { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

describe('ExecutionOrdersController detail contract', () => {
  it('publishes a nullable template and keeps percentage/counters distinct', async () => {
    const service = {
      getById: jest.fn().mockResolvedValue({
        id: 'eo-001',
        executionOrderNumber: 'OT-001',
        version: 1,
        status: ExecutionOrderStatus.IN_PROGRESS,
        result: null,
        workType: WfmWorkType.INSTALLATION,
        templateId: null,
        templateKey: null,
        templateVersionNumber: null,
        templateLabel: null,
        scheduleEventId: 'event-001',
        plannedWindowStartAt: new Date('2026-07-30T14:00:00.000Z'),
        plannedWindowEndAt: new Date('2026-07-30T16:00:00.000Z'),
        assignedTechnicianId: null,
        municipality: 'Ciudad operativa',
        customerDisplayLabel: 'Sitio operativo',
        startedAt: null,
        closedAt: null,
        createdAt: new Date('2026-07-30T10:00:00.000Z'),
        updatedAt: new Date('2026-07-30T10:00:00.000Z'),
      }),
      getCompletion: jest.fn().mockResolvedValue({ progress: 40, completed: 2, total: 5 }),
      getSyncState: jest.fn().mockResolvedValue('IN_SYNC'),
      computeAllowedActions: jest.fn().mockReturnValue(null),
    } as unknown as ExecutionOrdersService;
    const controller = new ExecutionOrdersController(
      service,
      {} as ExecutionOrderProjectionConvergenceService,
    );
    const actor: JwtPayload = {
      sub: 'actor-001',
      email: 'actor@test.invalid',
      role: UserRole.SUPPORT,
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
      jti: 'jti-001',
      type: 'tenant',
    };

    const result = await controller.getById('eo-001', actor);

    expect(result.template).toBeNull();
    expect(result.completion).toEqual(
      expect.objectContaining({ progress: 40, completed: 2, total: 5 }),
    );
    expect(result.completion.progress).not.toBe(0.4);
    expect(result.result).toBeUndefined();
  });
});
