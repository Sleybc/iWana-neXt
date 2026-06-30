import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  TaskResponsibleType,
  TaskStatus,
  TaskTimelineEventType,
  UserRole,
  UserStatus,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { TaskAssignmentService } from '../services/task-assignment.service';
import { TaskTimelineService } from '../services/task-timeline.service';

jest.mock('../../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  OperationalTask: class OperationalTask {},
  TaskAssignmentHistory: class TaskAssignmentHistory {},
}));

describe('TaskAssignmentService', () => {
  let service: TaskAssignmentService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;
  let timelineService: jest.Mocked<TaskTimelineService>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne'>>;

  const actor: JwtPayload = {
    sub: 'support-001',
    email: 'support@example.test',
    role: UserRole.SUPPORT,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    timelineService = {
      recordWithManager: jest.fn().mockResolvedValue(undefined),
      listTimeline: jest.fn(),
      listAssignmentHistory: jest.fn(),
    } as unknown as jest.Mocked<TaskTimelineService>;
    usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-999',
        role: UserRole.SUPPORT,
        status: UserStatus.ACTIVE,
      }),
    };

    service = new TaskAssignmentService(
      {} as DataSource,
      timelineService,
      usersService as unknown as UsersService,
    );
    jest.clearAllMocks();
  });

  it('reassigns a task and stores assignment history', async () => {
    const task = {
      id: 'task-001',
      tenantId: 'tenant-001',
      responsibleRefId: 'user-123',
      responsibleType: TaskResponsibleType.USER,
      status: TaskStatus.OPEN,
    };

    const manager = {
      findOne: jest.fn().mockResolvedValue(task),
      create: jest.fn((_entity, payload) => payload),
      save: jest
        .fn()
        .mockResolvedValueOnce({
          ...task,
          responsibleRefId: 'user-999',
        })
        .mockResolvedValueOnce({
          id: 'history-001',
          previousResponsibleRefId: 'user-123',
          newResponsibleRefId: 'user-999',
        }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.assign(
      'task-001',
      {
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: 'user-999',
        reason: 'Redistribucion operativa',
      },
      actor,
    );

    expect(result.responsibleRefId).toBe('user-999');
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        previousResponsibleRefId: 'user-123',
        newResponsibleRefId: 'user-999',
      }),
    );
    expect(timelineService.recordWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: TaskTimelineEventType.REASSIGNED,
      }),
    );
  });

  it('rejects reassignment for resolved tasks', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'task-001',
        tenantId: 'tenant-001',
        responsibleRefId: 'user-123',
        responsibleType: TaskResponsibleType.USER,
        status: TaskStatus.RESOLVED,
      }),
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    await expect(
      service.assign(
        'task-001',
        {
          responsibleType: TaskResponsibleType.USER,
          responsibleRefId: 'user-999',
        },
        actor,
      ),
    ).rejects.toThrow('No puedes reasignar una tarea cerrada o cancelada.');
  });
});
