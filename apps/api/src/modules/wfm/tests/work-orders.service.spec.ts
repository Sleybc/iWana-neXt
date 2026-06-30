import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  UserRole,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
  WorkOrderTaskStatus,
} from '@iwana/shared';
import { WorkOrdersService } from '../services/work-orders.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  WorkOrder: class {},
  WorkOrderTask: class {},
  ScheduleEvent: class {},
  ScheduleRescheduleLog: class {},
  TechnicianAvailability: class {},
}));

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let mockDataSource: Partial<DataSource>;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const mockActor = {
    sub: 'user-actor',
    email: 'actor@test.com',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    role: UserRole.ADMIN,
    iat: 0,
    exp: 9999999999,
  };

  const contractorActor = {
    sub: 'contractor-001',
    email: 'contractor@test.com',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    role: UserRole.CONTRACTOR,
    iat: 0,
    exp: 9999999999,
  };

  beforeEach(() => {
    mockDataSource = {};
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new WorkOrdersService(mockDataSource as DataSource);
  });

  describe('generateCode', () => {
    it('should generate WO-YYYYMMDD-001 when no WOs exist today', async () => {
      const mockQr = {
        manager: {
          createQueryBuilder: () => ({
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
          }),
        },
      };

      const code = await service.generateCode(mockQr.manager as any, 'tenant-001');

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(code).toBe(`WO-${today}-001`);
    });

    it('should generate WO-YYYYMMDD-002 when one WO already exists today', async () => {
      const mockQr = {
        manager: {
          createQueryBuilder: () => ({
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ count: '1' }),
          }),
        },
      };

      const code = await service.generateCode(mockQr.manager as any, 'tenant-001');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(code).toBe(`WO-${today}-002`);
    });
  });

  describe('transitionStatus', () => {
    it('should set closedBy and closedAt when transitioning to DONE', async () => {
      const existingWo = {
        id: 'wo-001',
        tenantId: 'tenant-001',
        status: WorkOrderStatus.IN_PROGRESS,
        assignedUserId: 'user-001',
      };

      let updatedData: any = null;

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(existingWo),
            update: jest.fn().mockImplementation((_entity, _where, data) => {
              updatedData = data;
              return Promise.resolve({ affected: 1 });
            }),
          },
        };
        return fn(mockQr as any);
      });

      const result = await service.transitionStatus(
        'wo-001',
        { status: WorkOrderStatus.DONE },
        mockActor as any,
      );

      expect(updatedData.closedBy).toBe(mockActor.sub);
      expect(updatedData.closedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(WorkOrderStatus.DONE);
    });

    it('should throw BadRequestException when WO is already in terminal state', async () => {
      const terminalWo = {
        id: 'wo-001',
        tenantId: 'tenant-001',
        status: WorkOrderStatus.DONE,
        assignedUserId: 'user-001',
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: { findOne: jest.fn().mockResolvedValue(terminalWo) },
        };
        return fn(mockQr as any);
      });

      await expect(
        service.transitionStatus('wo-001', { status: WorkOrderStatus.CANCELLED }, mockActor as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when WO does not exist', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: { findOne: jest.fn().mockResolvedValue(null) },
        };
        return fn(mockQr as any);
      });

      await expect(
        service.transitionStatus('no-exist', { status: WorkOrderStatus.DONE }, mockActor as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when CONTRACTOR tries to transition another assigned WO', async () => {
      const existingWo = {
        id: 'wo-010',
        tenantId: 'tenant-001',
        status: WorkOrderStatus.OPEN,
        assignedUserId: 'someone-else',
      };

      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
        const mockQr = {
          manager: {
            findOne: jest.fn().mockResolvedValue(existingWo),
          },
        };
        return fn(mockQr as any);
      });

      await expect(
        service.transitionStatus(
          'wo-010',
          { status: WorkOrderStatus.IN_PROGRESS },
          contractorActor as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createWithinManager', () => {
    it('should retry when the generated code collides on the unique tenant constraint', async () => {
      const generatedCodes: [string, string] = ['WO-20260506-001', 'WO-20260506-002'];
      jest
        .spyOn(service, 'generateCode')
        .mockResolvedValueOnce(generatedCodes[0])
        .mockResolvedValueOnce(generatedCodes[1]);

      const uniqueViolation = new QueryFailedError(
        'INSERT INTO work_orders',
        [],
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'uq_work_orders_tenant_code',
        }),
      );

      const saveMock = jest
        .fn()
        .mockRejectedValueOnce(uniqueViolation)
        .mockResolvedValueOnce({ id: 'wo-001', code: generatedCodes[1] })
        .mockResolvedValueOnce({ id: 'task-001' });

      const manager = {
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: saveMock,
      };

      const result = await service.createWithinManager(
        manager as any,
        'tenant-001',
        {
          summary: 'Visita tecnica',
          priority: WorkOrderPriority.NORMAL,
          sourceContext: WorkOrderSourceContext.MANUAL,
        },
        'user-001',
        'actor-001',
      );

      expect(service.generateCode).toHaveBeenCalledTimes(2);
      expect(result.code).toBe(generatedCodes[1]);
    });

    it('should fail explicitly after exhausting code retries', async () => {
      jest.spyOn(service, 'generateCode').mockResolvedValue('WO-20260506-001');

      const uniqueViolation = new QueryFailedError(
        'INSERT INTO work_orders',
        [],
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'uq_work_orders_tenant_code',
        }),
      );

      const manager = {
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockRejectedValue(uniqueViolation),
      };

      await expect(
        service.createWithinManager(
          manager as any,
          'tenant-001',
          {
            summary: 'Visita tecnica',
            priority: WorkOrderPriority.NORMAL,
            sourceContext: WorkOrderSourceContext.MANUAL,
          },
          'user-001',
          'actor-001',
        ),
      ).rejects.toThrow(ConflictException);
      expect(service.generateCode).toHaveBeenCalledTimes(3);
    });
  });
});
