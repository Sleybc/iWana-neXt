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
            query: jest.fn().mockResolvedValue([]),
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              setParameter: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve({ todayCount: '5' });
                if (callCount === 2) return Promise.resolve({ overdueCount: '2' });
                if (callCount === 3) return Promise.resolve({ upcomingCount: '12' });
                if (callCount === 4) return Promise.resolve({ activeCount: '5' });
                if (callCount === 5) return Promise.resolve({ enRouteCount: '1' });
                if (callCount === 6) return Promise.resolve({ atRiskCount: '2' });
                if (callCount === 7) {
                  return Promise.resolve({
                    total_open: '4',
                    ready_to_schedule_count: '2',
                    needs_context_count: '1',
                    overdue_sla_count: '1',
                    high_priority_open_count: '2',
                  });
                }
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
        pendingInbox: {
          totalOpen: 4,
          readyToScheduleCount: 2,
          needsContextCount: 1,
          overdueSlaCount: 1,
          highPriorityOpenCount: 2,
        },
        technicianLoad: expect.arrayContaining([
          expect.objectContaining({ assignedUserId: 'tech-001', todayCount: 3 }),
          expect.objectContaining({ assignedUserId: 'tech-002', todayCount: 2 }),
        ]),
      });
    });

    it('should return zeros when no events exist', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            query: jest.fn().mockResolvedValue([]),
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              setParameter: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
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
      expect(summary.pendingInbox).toEqual({
        totalOpen: 0,
        readyToScheduleCount: 0,
        needsContextCount: 0,
        overdueSlaCount: 0,
        highPriorityOpenCount: 0,
      });
      expect(summary.technicianLoad).toHaveLength(0);
    });

    it('should return additive command center metrics without removing legacy fields', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const rawOneResponses = [
          { todayCount: '6' },
          { overdueCount: '2' },
          { upcomingCount: '9' },
          { activeCount: '4' },
          { enRouteCount: '1' },
          { atRiskCount: '2' },
          {
            total_open: '5',
            ready_to_schedule_count: '3',
            needs_context_count: '1',
            overdue_sla_count: '1',
            high_priority_open_count: '2',
          },
        ];
        const rawManyResponses = [
          [
            {
              assigned_user_id: 'tech-001',
              today_count: '4',
              overdue_count: '1',
              total_minutes: '390',
            },
          ],
          [
            {
              id: 'evt-overdue-001',
              title: 'Instalacion pendiente',
              assigned_user_id: 'tech-001',
              scheduled_start_at: new Date('2026-05-09T08:00:00.000Z'),
            },
          ],
          [
            {
              id: 'evt-draft-001',
              title: 'Visita en borrador',
              assigned_user_id: 'tech-002',
              scheduled_start_at: new Date('2026-05-09T10:00:00.000Z'),
            },
          ],
        ];
        const mockQr = {
          manager: {
            query: jest.fn().mockResolvedValue([]),
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              setParameter: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawOne: jest
                .fn()
                .mockImplementation(() => Promise.resolve(rawOneResponses.shift() ?? null)),
              getRawMany: jest
                .fn()
                .mockImplementation(() => Promise.resolve(rawManyResponses.shift() ?? [])),
            }),
          },
        };
        return fn(mockQr as any);
      });

      const summary = await service.getSummary();

      expect(summary).toMatchObject({
        todayCount: 6,
        overdueCount: 2,
        upcomingCount: 9,
        activeCount: 4,
        enRouteCount: 1,
        atRiskCount: 2,
        pendingInbox: {
          totalOpen: 5,
          readyToScheduleCount: 3,
          needsContextCount: 1,
          overdueSlaCount: 1,
          highPriorityOpenCount: 2,
        },
        technicianLoad: [
          {
            assignedUserId: 'tech-001',
            todayCount: 4,
            overdueCount: 1,
            totalScheduledMinutes: 390,
            utilizationPercent: 81,
            riskLevel: 'HIGH',
          },
        ],
      });
      expect(summary.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'overdue-evt-overdue-001',
            type: 'OVERDUE_EVENT',
            severity: 'critical',
            eventId: 'evt-overdue-001',
            assignedUserId: 'tech-001',
          }),
          expect.objectContaining({
            id: 'draft-soon-evt-draft-001',
            type: 'DRAFT_STARTING_SOON',
            severity: 'warning',
            eventId: 'evt-draft-001',
            assignedUserId: 'tech-002',
          }),
          expect.objectContaining({
            id: 'high-load-tech-001',
            type: 'HIGH_TECHNICIAN_LOAD',
            severity: 'warning',
            assignedUserId: 'tech-001',
          }),
        ]),
      );
    });

    it('should cast active status arrays to the tenant enum type for PostgreSQL', async () => {
      const andWhereMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const rawOneResponses = [
          { todayCount: '0' },
          { overdueCount: '0' },
          { upcomingCount: '0' },
          { activeCount: '0' },
          { enRouteCount: '0' },
          { atRiskCount: '0' },
          {
            total_open: '0',
            ready_to_schedule_count: '0',
            needs_context_count: '0',
            overdue_sla_count: '0',
            high_priority_open_count: '0',
          },
        ];
        const mockQr = {
          manager: {
            query: jest.fn().mockResolvedValue([]),
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              setParameter: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: andWhereMock,
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawOne: jest
                .fn()
                .mockImplementation(() => Promise.resolve(rawOneResponses.shift() ?? null)),
              getRawMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.getSummary();

      const activeStatusCalls = andWhereMock.mock.calls.filter((call) =>
        String(call[0]).includes(':statuses'),
      );
      expect(activeStatusCalls).toHaveLength(6);
      expect(activeStatusCalls).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.stringContaining('CAST(:statuses AS schedule_event_status[])'),
          ]),
        ]),
      );
    });

    it('should bind now when computing technician overdue load in SELECT expressions', async () => {
      const setParameterMock = jest.fn().mockReturnThis();

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const rawOneResponses = [
          { todayCount: '0' },
          { overdueCount: '0' },
          { upcomingCount: '0' },
          { activeCount: '0' },
          { enRouteCount: '0' },
          { atRiskCount: '0' },
          {
            total_open: '0',
            ready_to_schedule_count: '0',
            needs_context_count: '0',
            overdue_sla_count: '0',
            high_priority_open_count: '0',
          },
        ];
        const mockQr = {
          manager: {
            query: jest.fn().mockResolvedValue([]),
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              setParameter: setParameterMock,
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawOne: jest
                .fn()
                .mockImplementation(() => Promise.resolve(rawOneResponses.shift() ?? null)),
              getRawMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.getSummary();

      expect(setParameterMock).toHaveBeenCalledWith('now', expect.any(Date));
    });

    it('should derive pending inbox readiness without persisting status changes', async () => {
      const addSelectMock = jest.fn().mockReturnThis();
      const queryMock = jest.fn().mockResolvedValue([]);

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const rawOneResponses = [
          { todayCount: '0' },
          { overdueCount: '0' },
          { upcomingCount: '0' },
          { activeCount: '0' },
          { enRouteCount: '0' },
          { atRiskCount: '0' },
          {
            total_open: '0',
            ready_to_schedule_count: '0',
            needs_context_count: '0',
            overdue_sla_count: '0',
            high_priority_open_count: '0',
          },
        ];
        const mockQr = {
          manager: {
            query: queryMock,
            createQueryBuilder: () => ({
              select: jest.fn().mockReturnThis(),
              addSelect: addSelectMock,
              setParameter: jest.fn().mockReturnThis(),
              from: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              getRawOne: jest
                .fn()
                .mockImplementation(() => Promise.resolve(rawOneResponses.shift() ?? null)),
              getRawMany: jest.fn().mockResolvedValue([]),
            }),
          },
        };
        return fn(mockQr as any);
      });

      await service.getSummary();

      const visitRequestUpdates = queryMock.mock.calls.filter(([query]) =>
        /UPDATE\s+visit_requests/i.test(String(query)),
      );
      expect(visitRequestUpdates).toHaveLength(0);

      const readinessExpression = addSelectMock.mock.calls.find(
        (call) => call[1] === 'ready_to_schedule_count',
      )?.[0];
      const needsContextExpression = addSelectMock.mock.calls.find(
        (call) => call[1] === 'needs_context_count',
      )?.[0];

      expect(String(readinessExpression)).toContain("NULLIF(TRIM(vr.address), '') IS NOT NULL");
      expect(String(readinessExpression)).toContain(
        "NULLIF(TRIM(vr.municipality), '') IS NOT NULL",
      );
      expect(String(needsContextExpression)).toContain("NULLIF(TRIM(vr.address), '') IS NOT NULL");
    });
  });
});
