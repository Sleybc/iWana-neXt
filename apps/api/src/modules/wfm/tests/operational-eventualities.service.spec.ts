import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema, WfmOperationalEventuality } from '@iwana/db';
import { OperationalEventualityStatus, OperationalEventualityType } from '@iwana/shared';
import { OperationalEventualitiesService } from '../services/operational-eventualities.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  WfmOperationalEventuality: class {},
}));

describe('OperationalEventualitiesService', () => {
  let service: OperationalEventualitiesService;
  let mockDataSource: Partial<DataSource>;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const TENANT_ID = 'tenant-001';
  const CREATED_BY_ID = 'user-admin-001';

  const validDto = {
    userId: '11111111-1111-1111-1111-111111111111',
    organizationSiteId: null,
    type: OperationalEventualityType.EARLY_ENTRY,
    startsAt: '2026-06-01T06:00:00Z',
    endsAt: '2026-06-01T08:00:00Z',
    reason: 'El cliente solicitó visita temprana',
    origin: 'visit_request',
    requiresHrReview: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDataSource = {};
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new OperationalEventualitiesService(mockDataSource as DataSource);
  });

  describe('create', () => {
    it('debe crear una eventualidad con datos válidos', async () => {
      const savedEntity: Partial<WfmOperationalEventuality> = {
        id: 'oe-001',
        tenantId: TENANT_ID,
        userId: validDto.userId,
        type: validDto.type,
        status: OperationalEventualityStatus.PENDING,
        startsAt: new Date(validDto.startsAt),
        endsAt: new Date(validDto.endsAt),
        reason: validDto.reason ?? null,
        origin: validDto.origin ?? null,
        requiresHrReview: false,
        createdById: CREATED_BY_ID,
      };

      const mockManager = {
        create: jest.fn().mockReturnValue(savedEntity),
        save: jest.fn().mockResolvedValue(savedEntity),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      const result = await service.create(CREATED_BY_ID, validDto);

      expect(result).toEqual(savedEntity);
      expect(mockManager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: validDto.userId,
          type: OperationalEventualityType.EARLY_ENTRY,
          status: OperationalEventualityStatus.PENDING,
          requiresHrReview: false,
          createdById: CREATED_BY_ID,
        }),
      );
    });

    it('debe lanzar BadRequestException si startsAt >= endsAt', async () => {
      const invalidDto = {
        ...validDto,
        startsAt: '2026-06-01T10:00:00Z',
        endsAt: '2026-06-01T08:00:00Z',
      };

      await expect(service.create(CREATED_BY_ID, invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si startsAt === endsAt', async () => {
      const invalidDto = {
        ...validDto,
        startsAt: '2026-06-01T08:00:00Z',
        endsAt: '2026-06-01T08:00:00Z',
      };

      await expect(service.create(CREATED_BY_ID, invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllByTenant', () => {
    it('debe retornar array filtrado por tenantId', async () => {
      const entities: Partial<WfmOperationalEventuality>[] = [
        {
          id: 'oe-001',
          tenantId: TENANT_ID,
          type: OperationalEventualityType.EXTRA_AVAILABILITY,
          status: OperationalEventualityStatus.CONFIRMED,
        },
        {
          id: 'oe-002',
          tenantId: TENANT_ID,
          type: OperationalEventualityType.OPERATIONAL_BLOCK,
          status: OperationalEventualityStatus.PENDING,
        },
      ];

      const mockManager = {
        find: jest.fn().mockResolvedValue(entities),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      const result = await service.findAllByTenant();

      expect(result).toEqual(entities);
      expect(mockManager.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });

    it('debe aplicar filtro de userId cuando se proporciona', async () => {
      const mockManager = { find: jest.fn().mockResolvedValue([]) };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      await service.findAllByTenant({ userId: 'user-123' });

      expect(mockManager.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { tenantId: TENANT_ID, userId: 'user-123' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('debe lanzar NotFoundException si no existe la entidad', async () => {
      const mockManager = { findOne: jest.fn().mockResolvedValue(null) };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('debe retornar la entidad si existe', async () => {
      const entity: Partial<WfmOperationalEventuality> = {
        id: 'oe-001',
        tenantId: TENANT_ID,
        type: OperationalEventualityType.EMERGENCY_RESPONSE,
        status: OperationalEventualityStatus.PENDING,
      };

      const mockManager = { findOne: jest.fn().mockResolvedValue(entity) };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      const result = await service.findOne('oe-001');
      expect(result).toEqual(entity);
    });
  });

  describe('updateStatus', () => {
    it('debe cambiar el status correctamente', async () => {
      const entity: Partial<WfmOperationalEventuality> = {
        id: 'oe-001',
        tenantId: TENANT_ID,
        status: OperationalEventualityStatus.PENDING,
      };

      const updatedEntity = { ...entity, status: OperationalEventualityStatus.CONFIRMED };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(entity),
        save: jest.fn().mockResolvedValue(updatedEntity),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      const result = await service.updateStatus('oe-001', {
        status: OperationalEventualityStatus.CONFIRMED,
      });

      expect(result.status).toBe(OperationalEventualityStatus.CONFIRMED);
      expect(mockManager.save).toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si la entidad no existe', async () => {
      const mockManager = { findOne: jest.fn().mockResolvedValue(null) };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      await expect(
        service.updateStatus('non-existent', { status: OperationalEventualityStatus.CANCELLED }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('debe marcar deleted_at con softRemove', async () => {
      const entity: Partial<WfmOperationalEventuality> = {
        id: 'oe-001',
        tenantId: TENANT_ID,
        status: OperationalEventualityStatus.CONFIRMED,
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(entity),
        softRemove: jest.fn().mockResolvedValue(undefined),
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      await expect(service.softDelete('oe-001')).resolves.toBeUndefined();
      expect(mockManager.softRemove).toHaveBeenCalledWith(expect.anything(), entity);
    });

    it('debe lanzar NotFoundException si la entidad no existe', async () => {
      const mockManager = { findOne: jest.fn().mockResolvedValue(null) };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => {
        return cb({ manager: mockManager } as never);
      });

      await expect(service.softDelete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
