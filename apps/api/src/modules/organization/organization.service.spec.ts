import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  OrganizationSite,
  OrganizationSiteCapabilityEntity,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { AuditAction, OrganizationSiteCapability, OrganizationSiteType } from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { OrganizationService } from './organization.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: { getOrThrow: jest.fn() },
    runInTenantSchema: jest.fn(),
  };
});

describe('OrganizationService', () => {
  let service: OrganizationService;
  const auditServiceMock = { log: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: getDataSourceToken(), useValue: {} },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = moduleRef.get(OrganizationService);

    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockTenantRun<TManager extends object>(manager: TManager) {
    (runInTenantSchema as jest.Mock).mockImplementation(
      async (_dataSource, _schemaName, callback: (queryRunner: { manager: TManager }) => unknown) =>
        callback({ manager }),
    );
  }

  function createSiteDetail(
    overrides: Partial<Awaited<ReturnType<OrganizationService['findOne']>>> = {},
  ) {
    return {
      id: 'site-1',
      name: 'Sede norte',
      code: 'NORTE',
      capabilities: [],
      isActive: true,
      siteType: OrganizationSiteType.OFFICE,
      address: null,
      municipality: null,
      department: null,
      country: 'CO',
      latitude: null,
      longitude: null,
      contactName: null,
      contactPhone: null,
      isPrimary: false,
      businessHoursMode: 'BASE' as const,
      businessHours: [],
      businessHoursResolved: [],
      assignments: [],
      responsibilities: [],
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('should reject creating a second primary site for the tenant', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'site-primary', isPrimary: true }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    await expect(
      service.create({
        name: 'Sede norte',
        code: 'NORTE',
        siteType: OrganizationSiteType.OFFICE,
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactName: 'Mesa tecnica centro',
        contactPhone: '+573001112233',
        isPrimary: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should persist capabilities during create when provided', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockImplementation(async (_entity, value) => ({
        id: 'site-1',
        ...(Array.isArray(value) ? value[0] : value),
      })),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantRun(manager);

    jest
      .spyOn(service as never, 'loadSiteDetail')
      .mockResolvedValue(
        createSiteDetail({ capabilities: [OrganizationSiteCapability.NOC] }) as never,
      );

    const result = await service.create({
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      latitude: 4.6486259,
      longitude: -74.0651466,
      contactName: 'Mesa tecnica centro',
      contactPhone: '+573001112233',
      capabilities: [OrganizationSiteCapability.NOC],
    });

    expect(manager.delete).toHaveBeenCalledWith(OrganizationSiteCapabilityEntity, {
      tenantId: 'tenant-test',
      siteId: 'site-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      OrganizationSiteCapabilityEntity,
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-test',
          siteId: 'site-1',
          capability: OrganizationSiteCapability.NOC,
          isEnabled: true,
        }),
      ]),
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        newValue: expect.objectContaining({
          capabilities: [OrganizationSiteCapability.NOC],
        }),
      }),
    );
    expect(result.capabilities).toEqual([OrganizationSiteCapability.NOC]);
  });

  it('should persist capabilities during update when provided', async () => {
    const existingSite = {
      id: 'site-1',
      tenantId: 'tenant-test',
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      address: null,
      municipality: null,
      department: null,
      country: 'CO',
      latitude: null,
      longitude: null,
      isPrimary: false,
      isActive: true,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(existingSite).mockResolvedValueOnce(existingSite),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantRun(manager);

    jest
      .spyOn(service as never, 'loadSiteDetail')
      .mockResolvedValueOnce(
        createSiteDetail({ capabilities: [OrganizationSiteCapability.CUSTOMER_SERVICE] }) as never,
      )
      .mockResolvedValueOnce(
        createSiteDetail({ capabilities: [OrganizationSiteCapability.TECH_DISPATCH] }) as never,
      );

    const result = await service.update('site-1', {
      capabilities: [OrganizationSiteCapability.TECH_DISPATCH],
    });

    expect(manager.delete).toHaveBeenCalledWith(OrganizationSiteCapabilityEntity, {
      tenantId: 'tenant-test',
      siteId: 'site-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      OrganizationSiteCapabilityEntity,
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-test',
          siteId: 'site-1',
          capability: OrganizationSiteCapability.TECH_DISPATCH,
          isEnabled: true,
        }),
      ]),
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        oldValue: expect.objectContaining({
          capabilities: [OrganizationSiteCapability.CUSTOMER_SERVICE],
        }),
        newValue: expect.objectContaining({
          capabilities: [OrganizationSiteCapability.TECH_DISPATCH],
        }),
      }),
    );
    expect(result.capabilities).toEqual([OrganizationSiteCapability.TECH_DISPATCH]);
  });

  it('should preserve capabilities during update when omitted', async () => {
    const existingSite = {
      id: 'site-1',
      tenantId: 'tenant-test',
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      address: null,
      municipality: null,
      department: null,
      country: 'CO',
      latitude: null,
      longitude: null,
      isPrimary: false,
      isActive: true,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(existingSite),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantRun(manager);

    jest
      .spyOn(service as never, 'loadSiteDetail')
      .mockResolvedValueOnce(
        createSiteDetail({ capabilities: [OrganizationSiteCapability.CUSTOMER_SERVICE] }) as never,
      )
      .mockResolvedValueOnce(
        createSiteDetail({ capabilities: [OrganizationSiteCapability.CUSTOMER_SERVICE] }) as never,
      );

    await service.update('site-1', { name: 'Sede norte actualizada' });

    expect(manager.delete).not.toHaveBeenCalledWith(OrganizationSiteCapabilityEntity, {
      tenantId: 'tenant-test',
      siteId: 'site-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      OrganizationSite,
      expect.objectContaining({ name: 'Sede norte actualizada' }),
    );
  });

  it('should clear capabilities during update when provided as empty array', async () => {
    const existingSite = {
      id: 'site-1',
      tenantId: 'tenant-test',
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      address: null,
      municipality: null,
      department: null,
      country: 'CO',
      latitude: null,
      longitude: null,
      isPrimary: false,
      isActive: true,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(existingSite).mockResolvedValueOnce(existingSite),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantRun(manager);

    jest
      .spyOn(service as never, 'loadSiteDetail')
      .mockResolvedValueOnce(
        createSiteDetail({ capabilities: [OrganizationSiteCapability.TECH_DISPATCH] }) as never,
      )
      .mockResolvedValueOnce(createSiteDetail({ capabilities: [] }) as never);

    const result = await service.update('site-1', { capabilities: [] });

    expect(manager.delete).toHaveBeenCalledWith(OrganizationSiteCapabilityEntity, {
      tenantId: 'tenant-test',
      siteId: 'site-1',
    });
    expect(manager.save).not.toHaveBeenCalledWith(
      OrganizationSiteCapabilityEntity,
      expect.any(Array),
    );
    expect(result.capabilities).toEqual([]);
  });

  it('should persist coordinates and site contact during create', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockImplementation(async (_entity, value) => ({
        id: 'site-1',
        ...(Array.isArray(value) ? value[0] : value),
      })),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantRun(manager);

    jest.spyOn(service as never, 'loadSiteDetail').mockResolvedValue(
      createSiteDetail({
        latitude: 4.6486259,
        longitude: -74.0651466,
        contactName: 'Mesa tecnica centro',
        contactPhone: '+573001112233',
      }) as never,
    );

    const result = await service.create({
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      latitude: 4.6486259,
      longitude: -74.0651466,
      contactName: 'Mesa tecnica centro',
      contactPhone: '+573001112233',
    });

    expect(manager.save).toHaveBeenCalledWith(
      OrganizationSite,
      expect.objectContaining({
        contactName: 'Mesa tecnica centro',
        contactPhone: '+573001112233',
      }),
    );
    expect(result.contactName).toBe('Mesa tecnica centro');
    expect(result.contactPhone).toBe('+573001112233');
  });
});
