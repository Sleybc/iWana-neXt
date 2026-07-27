import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';

// Mock @iwana/db module-level para runInTenantSchema y TenantContext
const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => ({
  runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  TenantContext: {
    getOrThrow: () => mockTenantContextGetOrThrow(),
  },
}));

describe('ExecutionOrderProjectionConvergenceService', () => {
  let service: ExecutionOrderProjectionConvergenceService;
  let queryRunner: { query: jest.Mock; manager: Record<string, unknown> };

  beforeEach(async () => {
    queryRunner = { query: jest.fn(), manager: {} };

    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 't0000000-0000-4000-8000-000000000001',
      schemaName: 'tenant_test001',
    });

    mockRunInTenantSchema.mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: { query: jest.Mock }) => Promise<unknown>) =>
        fn(queryRunner),
    );

    const dataSource = {
      createQueryRunner: () => queryRunner,
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        ExecutionOrderProjectionConvergenceService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ExecutionOrderProjectionConvergenceService);
  });

  describe('getRelayHealth', () => {
    it('devuelve HEALTHY si no hay eventos pendientes', async () => {
      queryRunner.query.mockResolvedValueOnce([
        {
          pending_count: '0',
          oldest_age_seconds: null,
          last_published_at: null,
        },
      ]);

      const health = await service.getRelayHealth();

      expect(health.relayStatus).toBe('HEALTHY');
      expect(health.pendingEvents).toBe(0);
      expect(health.oldestPendingAgeSeconds).toBeNull();
    });

    it('devuelve DEGRADED si el evento más antiguo tiene más de 2 minutos', async () => {
      queryRunner.query.mockResolvedValueOnce([
        {
          pending_count: '3',
          oldest_age_seconds: '180',
          last_published_at: null,
        },
      ]);

      const health = await service.getRelayHealth();

      expect(health.relayStatus).toBe('DEGRADED');
      expect(health.pendingEvents).toBe(3);
    });

    it('devuelve STOPPED si el evento más antiguo tiene más de 10 minutos', async () => {
      queryRunner.query.mockResolvedValueOnce([
        {
          pending_count: '10',
          oldest_age_seconds: '900',
          last_published_at: null,
        },
      ]);

      const health = await service.getRelayHealth();

      expect(health.relayStatus).toBe('STOPPED');
      expect(health.pendingEvents).toBe(10);
    });
  });

  describe('reconcileOrder', () => {
    it('detecta discrepancia cuando la proyección no coincide con el estado canónico', async () => {
      queryRunner.query
        .mockResolvedValueOnce([{ id: 'eo-001', status: 'IN_PROGRESS', result: null }])
        .mockResolvedValueOnce([{ status: 'SCHEDULED' }])
        .mockResolvedValueOnce([{ status: 'SCHEDULED' }])
        .mockResolvedValueOnce([{ task_id: 'task-001' }])
        .mockResolvedValueOnce([{ status: 'SCHEDULED' }]);

      const result = await service.reconcileOrder('eo-001');

      expect(result.hasDiscrepancy).toBe(true);
      expect(result.expectedScheduleStatus).toBe('IN_PROGRESS');
      expect(result.expectedVisitStatus).toBe('IN_EXECUTION');
      expect(result.expectedTaskStatus).toBe('IN_PROGRESS');
      expect(result.scheduleEventStatus).toBe('SCHEDULED');
    });

    it('no detecta discrepancia cuando todas las proyecciones están en sync', async () => {
      queryRunner.query
        .mockResolvedValueOnce([{ id: 'eo-001', status: 'COMPLETED', result: 'EXECUTED' }])
        .mockResolvedValueOnce([{ status: 'COMPLETED' }])
        .mockResolvedValueOnce([{ status: 'CLOSED' }])
        .mockResolvedValueOnce([{ task_id: 'task-001' }])
        .mockResolvedValueOnce([{ status: 'RESOLVED' }]);

      const result = await service.reconcileOrder('eo-001');

      expect(result.hasDiscrepancy).toBe(false);
    });

    it('maneja OT sin task_id sin error', async () => {
      queryRunner.query
        .mockResolvedValueOnce([{ id: 'eo-001', status: 'CANCELLED', result: 'CANCELLED' }])
        .mockResolvedValueOnce([{ status: 'CANCELLED' }])
        .mockResolvedValueOnce([{ status: 'CANCELLED' }])
        .mockResolvedValueOnce([{ task_id: null }]);

      const result = await service.reconcileOrder('eo-001');

      expect(result.taskStatus).toBeNull();
    });
  });
});
