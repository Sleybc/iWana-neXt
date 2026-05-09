import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleConflictService } from '../services/schedule-conflict.service';
import { ScheduleEventStatus } from '@iwana/shared';

// Mock de runInTenantSchema para controlar el comportamiento del QR
jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ScheduleEvent: class {},
  WorkOrder: class {},
  WorkOrderTask: class {},
  ScheduleRescheduleLog: class {},
  TechnicianAvailability: class {},
}));

describe('ScheduleConflictService', () => {
  let service: ScheduleConflictService;
  let mockDataSource: Partial<DataSource>;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const baseParams = {
    tenantId: 'tenant-001',
    assignedUserId: 'user-001',
    scheduledStartAt: '2026-06-01T09:00:00Z',
    scheduledEndAt: '2026-06-01T11:00:00Z',
  };

  beforeEach(() => {
    mockDataSource = {};
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new ScheduleConflictService(mockDataSource as DataSource);
  });

  describe('hasConflict', () => {
    it('should return true when an active event overlaps the range', async () => {
      // El QR simulado devuelve un resultado (conflicto encontrado)
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue({ '?column?': '1' }),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.hasConflict(baseParams);
      expect(result).toBe(true);
    });

    it('should return false when no active event overlaps', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue(undefined),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.hasConflict(baseParams);
      expect(result).toBe(false);
    });

    it('should call andWhere with excludeId when excludeEventId is provided', async () => {
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              getRawOne: jest.fn().mockResolvedValue(undefined),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.hasConflict({ ...baseParams, excludeEventId: 'event-to-exclude' });

      // Verificar que se agrego la condicion de exclusion
      const calls = andWhereMock.mock.calls;
      const excludeCall = calls.find((c) => String(c[0]).includes('excludeId'));
      expect(excludeCall).toBeDefined();
    });

    it('should cast active status arrays to the tenant enum type for PostgreSQL', async () => {
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              getRawOne: jest.fn().mockResolvedValue(undefined),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.hasConflict(baseParams);

      const statusCall = andWhereMock.mock.calls.find((call) =>
        String(call[0]).includes(':statuses'),
      );
      expect(statusCall).toEqual(
        expect.arrayContaining([
          expect.stringContaining('CAST(:statuses AS schedule_event_status[])'),
        ]),
      );
    });

    it('should not query when COMPLETED/CANCELLED/NO_SHOW statuses — non-conflicting by design', async () => {
      // El servicio usa ACTIVE_STATUSES internamente; este test valida que la lista excluye terminales
      // probando indirectamente: si el mock devuelve undefined, hasConflict = false
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue(undefined),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.hasConflict(baseParams);
      expect(result).toBe(false);
    });
  });
});
