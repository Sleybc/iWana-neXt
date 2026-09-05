import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ExecutionOrderProjectionConvergenceService } from '../services/execution-order-projection-convergence.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

// Mock @iwana/db module-level para runInTenantSchema y TenantContext
const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => ({
  isValidSchemaName: (schemaName: string) => schemaName.startsWith('tenant_'),
  runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  TenantContext: {
    getOrThrow: () => mockTenantContextGetOrThrow(),
  },
}));

describe('ExecutionOrderProjectionConvergenceService', () => {
  let service: ExecutionOrderProjectionConvergenceService;
  let queryRunner: { query: jest.Mock; manager: Record<string, unknown> };
  let config: { get: jest.Mock };
  let dataSource: { query: jest.Mock };
  let redis: { get: jest.Mock };

  beforeEach(async () => {
    queryRunner = { query: jest.fn(), manager: {} };
    config = { get: jest.fn().mockReturnValue(undefined) };
    dataSource = { query: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null) };

    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 't0000000-0000-4000-8000-000000000001',
      schemaName: 'tenant_test001',
    });

    mockRunInTenantSchema.mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: { query: jest.Mock }) => Promise<unknown>) =>
        fn(queryRunner),
    );

    const queryRunnerDataSource = {
      createQueryRunner: () => queryRunner,
      query: dataSource.query,
    } as unknown as DataSource;

    const module = await Test.createTestingModule({
      providers: [
        ExecutionOrderProjectionConvergenceService,
        { provide: DataSource, useValue: queryRunnerDataSource },
        { provide: ConfigService, useValue: config },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(ExecutionOrderProjectionConvergenceService);
  });

  describe('getPlatformRelayTelemetry', () => {
    it('agrega profundidad, DLQ, reconciliación y distribución sin umbral', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 't0000000-0000-4000-8000-000000000001', schema_name: 'tenant_test001' },
      ]);
      queryRunner.query
        .mockResolvedValueOnce([
          {
            pending_count: '2',
            oldest_age_seconds: '45',
            dlq_size: '1',
          },
        ])
        .mockResolvedValueOnce([{ lag_seconds: '5' }, { lag_seconds: '45' }])
        .mockResolvedValueOnce([
          {
            execution_order_status: 'IN_PROGRESS',
            execution_order_result: null,
            schedule_status: 'SCHEDULED',
            visit_status: 'IN_EXECUTION',
            task_status: 'IN_PROGRESS',
          },
        ]);
      redis.get.mockResolvedValueOnce('2026-07-30T12:00:00.000Z');

      const telemetry = await service.getPlatformRelayTelemetry();

      expect(telemetry.outboxDepth).toBe(2);
      expect(telemetry.oldestPendingAgeSeconds).toBe(45);
      expect(telemetry.dlqSize).toBe(1);
      expect(telemetry.reconciliationDiscrepancies).toBe(1);
      expect(telemetry.lastScanAt).toBe('2026-07-30T12:00:00.000Z');
      expect(telemetry.lagDistributionSeconds).toMatchObject({
        count: 2,
        minSeconds: 5,
        p95Seconds: 45,
        maxSeconds: 45,
      });
      expect(telemetry.lagThresholdStatus).toBe('sin umbral aprobado');
    });
  });

  describe('countTenantDiscrepancies — compatibilidad de tipos del join', () => {
    it('castea explícitamente el UUID de operational_tasks al VARCHAR de execution_orders.task_id', async () => {
      // `operational_tasks.id` es UUID y `execution_orders.task_id` es
      // VARCHAR(160) (migraciones tenant 045 y 056). Sin cast, PostgreSQL
      // aborta con "operator does not exist: uuid = character varying" y la
      // telemetría del relay queda degradada a WARN y nunca se recolecta.
      dataSource.query.mockResolvedValueOnce([
        { id: 't0000000-0000-4000-8000-000000000001', schema_name: 'tenant_test001' },
      ]);
      queryRunner.query
        .mockResolvedValueOnce([{ pending_count: '0', oldest_age_seconds: null, dlq_size: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getPlatformRelayTelemetry();

      const reconciliationSql = queryRunner.query.mock.calls
        .map(([sql]: [string]) => sql)
        .find((sql: string) => sql.includes('LEFT JOIN operational_tasks task'));

      expect(reconciliationSql).toBeDefined();
      expect(reconciliationSql).toMatch(/ON\s+task\.id::text\s*=\s*eo\.task_id/);
      expect(reconciliationSql).not.toMatch(/ON\s+task\.id\s*=\s*eo\.task_id/);
    });

    it('no aborta la telemetría del tenant cuando la reconciliación devuelve filas', async () => {
      dataSource.query.mockResolvedValueOnce([
        { id: 't0000000-0000-4000-8000-000000000001', schema_name: 'tenant_test001' },
      ]);
      queryRunner.query
        .mockResolvedValueOnce([{ pending_count: '0', oldest_age_seconds: null, dlq_size: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            execution_order_status: 'COMPLETED',
            execution_order_result: 'EXECUTED',
            schedule_status: 'COMPLETED',
            visit_status: 'CLOSED',
            task_status: 'RESOLVED',
          },
        ]);

      const telemetry = await service.getPlatformRelayTelemetry();

      expect(telemetry.reconciliationDiscrepancies).toBe(0);
    });
  });

  describe('getRelayHealth', () => {
    it('reporta medición sin veredicto cuando no hay umbral aprobado', async () => {
      queryRunner.query
        .mockResolvedValueOnce([
          {
            pending_count: '0',
            oldest_age_seconds: null,
          },
        ])
        .mockResolvedValueOnce([]);
      redis.get.mockResolvedValueOnce(null);

      const health = await service.getRelayHealth();

      expect(health.relayStatus).toBe('UNVERIFIED');
      expect(health.pendingEvents).toBe(0);
      expect(health.oldestPendingAgeSeconds).toBeNull();
      expect(health.lastScanAt).toBeNull();
      expect(health.lagThresholdStatus).toBe('sin umbral aprobado');
    });

    it('no inventa un veredicto aunque el lag pendiente crezca', async () => {
      queryRunner.query
        .mockResolvedValueOnce([
          {
            pending_count: '3',
            oldest_age_seconds: '180',
            dlq_size: '1',
            lag_count: '3',
            lag_min_seconds: '10',
            lag_p50_seconds: '180',
            lag_p95_seconds: '240',
            lag_p99_seconds: '240',
            lag_max_seconds: '240',
          },
        ])
        .mockResolvedValueOnce([]);
      redis.get.mockResolvedValueOnce('2026-07-30T12:00:00.000Z');

      const health = await service.getRelayHealth();

      expect(health.relayStatus).toBe('UNVERIFIED');
      expect(health.pendingEvents).toBe(3);
      expect(health.lastScanAt).toBe('2026-07-30T12:00:00.000Z');
      expect(health.dlqSize).toBe(1);
      expect(health.lagDistributionSeconds.p95Seconds).toBe(240);
    });

    it('aplica solo los umbrales explícitamente configurados', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'OUTBOX_RELAY_LAG_DEGRADED_SECONDS') return 100;
        if (key === 'OUTBOX_RELAY_LAG_STOPPED_SECONDS') return 500;
        return undefined;
      });
      queryRunner.query
        .mockResolvedValueOnce([
          {
            pending_count: '10',
            oldest_age_seconds: '900',
          },
        ])
        .mockResolvedValueOnce([]);
      redis.get.mockResolvedValueOnce(null);

      const health = await service.getRelayHealth();

      expect(health.relayStatus).toBe('STOPPED');
      expect(health.pendingEvents).toBe(10);
      expect(health.lagThresholds).toEqual({ degradedSeconds: 100, stoppedSeconds: 500 });
      expect(health.lagThresholdStatus).toBe('configured');
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

    it('OT pre-inicio (ASSIGNED) sin iniciar mantiene proyecciones SCHEDULED sin divergencia', async () => {
      // Sin auto-promoción por registro (remediación MOD11), la OT canónica
      // permanece en ASSIGNED mientras no ocurra start(); el reconciliador
      // espera SCHEDULED y no hay divergencia inducible por registro.
      queryRunner.query
        .mockResolvedValueOnce([{ id: 'eo-001', status: 'ASSIGNED', result: null }])
        .mockResolvedValueOnce([{ status: 'SCHEDULED' }])
        .mockResolvedValueOnce([{ status: 'SCHEDULED' }])
        .mockResolvedValueOnce([{ task_id: 'task-001' }])
        .mockResolvedValueOnce([{ status: 'SCHEDULED' }]);

      const result = await service.reconcileOrder('eo-001');

      expect(result.hasDiscrepancy).toBe(false);
      expect(result.expectedScheduleStatus).toBe('SCHEDULED');
      expect(result.expectedVisitStatus).toBe('SCHEDULED');
      expect(result.expectedTaskStatus).toBe('SCHEDULED');
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
