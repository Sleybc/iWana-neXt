import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { TaskTimelineEventType } from '@iwana/shared';
import { TaskTimelineService } from '../services/task-timeline.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  TaskTimelineEvent: class TaskTimelineEvent {},
  TaskAssignmentHistory: class TaskAssignmentHistory {},
}));

describe('TaskTimelineService', () => {
  let service: TaskTimelineService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new TaskTimelineService({} as DataSource);
    jest.clearAllMocks();
  });

  describe('recordWithManager', () => {
    it('debe crear un evento de timeline usando un EntityManager', async () => {
      const manager = {
        create: jest.fn((_entity, data) => data),
        save: jest.fn().mockImplementation(async (_entity, data) => ({
          id: 'tl-event-001',
          ...data,
          occurredAt: new Date(),
        })),
      };

      const result = await service.recordWithManager(manager as any, {
        taskId: 'task-001',
        tenantId: 'tenant-001',
        eventType: TaskTimelineEventType.CREATED,
        payload: { status: 'OPEN' },
        actorUserId: 'user-001',
      });

      expect(manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          taskId: 'task-001',
          tenantId: 'tenant-001',
          eventType: TaskTimelineEventType.CREATED,
          actorUserId: 'user-001',
        }),
      );
      expect(manager.save).toHaveBeenCalled();
      expect(result.id).toBe('tl-event-001');
    });

    it('debe usar payload vacío si no se proporciona', async () => {
      const manager = {
        create: jest.fn((_entity, data) => data),
        save: jest.fn().mockImplementation(async (_entity, data) => ({
          id: 'tl-event-002',
          ...data,
        })),
      };

      await service.recordWithManager(manager as any, {
        taskId: 'task-002',
        tenantId: 'tenant-001',
        eventType: TaskTimelineEventType.STATUS_CHANGED,
        actorUserId: null,
      });

      expect(manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: {},
          actorUserId: null,
        }),
      );
    });

    it('debe registrar occurredAt con la fecha actual', async () => {
      const beforeCall = Date.now();
      const manager = {
        create: jest.fn((_entity, data) => data),
        save: jest.fn().mockImplementation(async (_entity, data) => data),
      };

      const result = await service.recordWithManager(manager as any, {
        taskId: 'task-003',
        tenantId: 'tenant-001',
        eventType: TaskTimelineEventType.BLOCKED,
        actorUserId: 'user-001',
      });

      const afterCall = Date.now();
      expect(result.occurredAt).toBeDefined();
      const occurredTime = (result as any).occurredAt.getTime();
      expect(occurredTime).toBeGreaterThanOrEqual(beforeCall);
      expect(occurredTime).toBeLessThanOrEqual(afterCall);
    });
  });

  describe('listTimeline', () => {
    it('debe listar eventos de timeline por taskId ordenados por occurred_at ASC', async () => {
      const mockEvents = [
        { id: 'evt-1', taskId: 'task-001', eventType: TaskTimelineEventType.CREATED },
        { id: 'evt-2', taskId: 'task-001', eventType: TaskTimelineEventType.STATUS_CHANGED },
      ];

      const getMany = jest.fn().mockResolvedValue(mockEvents);
      const orderBy = jest.fn().mockReturnValue({ getMany });
      const andWhere = jest.fn().mockReturnValue({ orderBy });
      const where = jest.fn().mockReturnValue({ andWhere });
      const createQueryBuilder = jest.fn().mockReturnValue({ where });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.listTimeline('task-001');

      expect(mockRunInTenantSchema).toHaveBeenCalled();
      expect(createQueryBuilder).toHaveBeenCalledWith(expect.anything(), 'tte');
      expect(result).toEqual(mockEvents);
    });

    it('debe retornar array vacío si no hay eventos', async () => {
      const getMany = jest.fn().mockResolvedValue([]);
      const orderBy = jest.fn().mockReturnValue({ getMany });
      const andWhere = jest.fn().mockReturnValue({ orderBy });
      const where = jest.fn().mockReturnValue({ andWhere });
      const createQueryBuilder = jest.fn().mockReturnValue({ where });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.listTimeline('task-999');

      expect(result).toEqual([]);
    });
  });

  describe('listAssignmentHistory', () => {
    it('debe listar historial de asignaciones por taskId ordenados por created_at ASC', async () => {
      const mockHistory = [
        { id: 'hist-1', taskId: 'task-001', newResponsibleRefId: 'user-001' },
        { id: 'hist-2', taskId: 'task-001', newResponsibleRefId: 'user-002' },
      ];

      const getMany = jest.fn().mockResolvedValue(mockHistory);
      const orderBy = jest.fn().mockReturnValue({ getMany });
      const andWhere = jest.fn().mockReturnValue({ orderBy });
      const where = jest.fn().mockReturnValue({ andWhere });
      const createQueryBuilder = jest.fn().mockReturnValue({ where });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.listAssignmentHistory('task-001');

      expect(mockRunInTenantSchema).toHaveBeenCalled();
      expect(createQueryBuilder).toHaveBeenCalledWith(expect.anything(), 'tah');
      expect(result).toEqual(mockHistory);
    });

    it('debe retornar array vacío si no hay historial de asignaciones', async () => {
      const getMany = jest.fn().mockResolvedValue([]);
      const orderBy = jest.fn().mockReturnValue({ getMany });
      const andWhere = jest.fn().mockReturnValue({ orderBy });
      const where = jest.fn().mockReturnValue({ andWhere });
      const createQueryBuilder = jest.fn().mockReturnValue({ where });

      mockRunInTenantSchema.mockImplementation(async (_ds: any, _schema: string, fn: any) =>
        fn({ manager: { createQueryBuilder } }),
      );

      const result = await service.listAssignmentHistory('task-999');

      expect(result).toEqual([]);
    });
  });
});
