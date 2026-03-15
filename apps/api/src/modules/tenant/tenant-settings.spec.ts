import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Tenant } from '@iwana/db';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { TenantService } from './tenant.service';

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: '9f6e39ec-d756-4447-ad8f-bf6b768feefe',
    name: 'ISP Test',
    slug: 'isp-test',
    schemaName: 'tenant_isp_test',
    status: 'ACTIVE' as never,
    settings: {},
    contactEmail: 'ops@example.test',
    maxSubscribers: 100,
    // Campos de empresa (todos null por defecto)
    legalName: null,
    nit: null,
    nitDv: null,
    companyType: null,
    address: null,
    city: null,
    department: null,
    countryCode: 'CO',
    postalCode: null,
    coordinates: null,
    phone: null,
    website: null,
    economicSector: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Tenant settings', () => {
  let service: TenantService;
  let repo: jest.Mocked<Repository<Tenant>>;

  const redisMock = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    repo = module.get(getRepositoryToken(Tenant));
    jest.clearAllMocks();
  });

  it('getSettings retorna defaults cuando JSONB está vacío', async () => {
    repo.findOne.mockResolvedValue(buildTenant({ settings: {}, maxSubscribers: 0 }));

    const data = await service.getSettings('9f6e39ec-d756-4447-ad8f-bf6b768feefe');

    expect(data.timezone).toBe('America/Bogota');
    expect(data.currency).toBe('COP');
    expect(data.features.billing).toBe(false);
  });

  it('getSettings retorna valores mergeados cuando JSONB tiene datos parciales', async () => {
    repo.findOne.mockResolvedValue(
      buildTenant({ settings: { timezone: 'America/Lima', features: { billing: true } } }),
    );

    const data = await service.getSettings('9f6e39ec-d756-4447-ad8f-bf6b768feefe');

    expect(data.timezone).toBe('America/Lima');
    expect(data.currency).toBe('COP');
    expect(data.features.billing).toBe(true);
    expect(data.features.mfa_required_all).toBe(false);
  });

  it('updateSettings actualiza solo campos enviados', async () => {
    const tenant = buildTenant({
      settings: { timezone: 'America/Bogota', currency: 'COP', features: { billing: false } },
      maxSubscribers: 100,
    });
    repo.findOne.mockResolvedValue(tenant);
    repo.save.mockImplementation(async (entity) => entity as Tenant);

    const data = await service.updateSettings(tenant.id, {
      currency: 'USD',
      features: { billing: true },
    });

    expect(data.currency).toBe('USD');
    expect(data.timezone).toBe('America/Bogota');
    expect(data.features.billing).toBe(true);
  });

  it('updateSettings registra auditoría con oldValue/newValue', async () => {
    const tenant = buildTenant({ settings: {} });
    repo.findOne.mockResolvedValue(tenant);
    repo.save.mockImplementation(async (entity) => entity as Tenant);

    await service.updateSettings(tenant.id, { country: 'MX' }, 'actor-1');

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'TenantSettings',
        oldValue: expect.any(Object),
        newValue: expect.any(Object),
      }),
    );
  });

  it('getSettings retorna 404 si tenant no existe', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.getSettings('missing')).rejects.toThrow(NotFoundException);
  });

  it('updateSettings valida timezone IANA', async () => {
    const tenant = buildTenant({ settings: {} });
    repo.findOne.mockResolvedValue(tenant);

    await expect(service.updateSettings(tenant.id, { timezone: 'zona-invalida' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
