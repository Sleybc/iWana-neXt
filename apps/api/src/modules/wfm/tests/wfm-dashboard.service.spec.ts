import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { WfmDashboardService } from '../services/wfm-dashboard.service';

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

describe('WfmDashboardService', () => {
  let service: WfmDashboardService;
  let mockDataSource: Partial<DataSource>;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    mockDataSource = {};
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new WfmDashboardService(mockDataSource as DataSource);
  });

  describe('getSummary', () => {
    it('should return a summary with the correct structure', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        // Simula 3 queries COUNT + 1 query de carga por tecnico
        let callCount = 0;
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve({ todayCount: '5' });
                if (callCount === 2) return Promise.resolve({ overdueCount: '2' });
                if (callCount === 3) return Promise.resolve({ upcomingCount: '12' });
                return Promise.resolve({});
              }),
              getRawMany: jest.fn().mockResolvedValue([
                { assigned_user_id: 'tech-001', count: '3' },
                { assigned_user_id: 'tech-002', count: '2' },
              ]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const summary = await service.getSummary();

      expect(summary).toMatchObject({
        todayCount: 5,
        overdueCount: 2,
        upcomingCount: 12,
        technicianLoad: expect.arrayContaining([
          { assignedUserId: 'tech-001', todayCount: 3 },
          { assignedUserId: 'tech-002', todayCount: 2 },
        ]),
      });
    });

    it('should return zeros when no events exist', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue(null),
              getRawMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const summary = await service.getSummary();

      expect(summary.todayCount).toBe(0);
      expect(summary.overdueCount).toBe(0);
      expect(summary.upcomingCount).toBe(0);
      expect(summary.technicianLoad).toHaveLength(0);
    });
  });
});
