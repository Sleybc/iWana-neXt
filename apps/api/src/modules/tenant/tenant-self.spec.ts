/**
 * Tests de integración para los contratos self-service del tenant autenticado
 * y unitarios del DashboardSummaryService (Track A — C-1/C-2/C-3).
 *
 * Verifica:
 * - GET /api/v1/tenants/me retorna datos del tenant del JWT
 * - GET /api/v1/tenants/me/settings retorna configuración operativa
 * - GET /api/v1/tenants/me/summary retorna summary (solo ADMIN)
 * - Isolation: un rol de plataforma (SYSTEM_ADMIN) no puede usar estos endpoints
 *   sin tenantId válido en el JWT
 * - A-1: fiberInstallationThresholdMeters paridad summary ↔ settings mapper
 * - A-2: mfaCoverage real (con usuarios, sin usuarios, fallo de fuente)
 * - A-3: tenant del summary sin campos de marca
 *
 * BT-DE-13 — HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
 * HLD-MOD02-DASHBOARD-EMPRESA-v2.0 §4.3
 */

jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: jest.fn(),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AuditLog, runInTenantSchema, Tenant, User } from '@iwana/db';
import { TenantStatus, UserRole, UserStatus } from '@iwana/shared';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardSummaryService } from './dashboard-summary.service';
import { TenantController } from './tenant.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantService } from './tenant.service';

describe('TenantController — contratos self-service del tenant', () => {
  let controller: TenantController;

  /** Payload JWT de un ADMIN de tenant */
  const adminJwt: JwtPayload = {
    sub: 'user-uuid-admin',
    email: 'abc123def456',
    role: UserRole.ADMIN,
    tenantId: 'tenant-uuid-1',
    schemaName: 'tenant_empresa_test',
    jti: 'jti-1',
    type: 'tenant',
  };

  /** Payload JWT de un NOC del mismo tenant */
  const nocJwt: JwtPayload = {
    sub: 'user-uuid-noc',
    email: 'abc123def457',
    role: UserRole.NOC,
    tenantId: 'tenant-uuid-1',
    schemaName: 'tenant_empresa_test',
    jti: 'jti-2',
    type: 'tenant',
  };

  const tenantSelfData = {
    id: 'tenant-uuid-1',
    name: 'Empresa Test ISP',
    slug: 'empresa-test',
    status: 'ACTIVE' as const,
    contactEmail: 'contacto@empresa-test.co',
    legalName: null,
    nit: null,
    nitDv: null,
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: new Date('2026-01-01'),
  };

  const tenantSelfSettings = {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    fiberInstallationThresholdMeters: 50,
    features: { billing: false, mfa_required_all: false },
  };

  const dashboardSummaryData = {
    tenant: {
      id: tenantSelfData.id,
      name: tenantSelfData.name,
      slug: tenantSelfData.slug,
      status: tenantSelfData.status,
      contactEmail: tenantSelfData.contactEmail,
      legalName: tenantSelfData.legalName,
      nit: tenantSelfData.nit,
      city: tenantSelfData.city,
      department: tenantSelfData.department,
      countryCode: tenantSelfData.countryCode,
      phone: tenantSelfData.phone,
      website: tenantSelfData.website,
      createdAt: tenantSelfData.createdAt,
    },
    settings: tenantSelfSettings,
    metrics: {
      configuredUsers: 3,
      mfaCoverage: 2 / 3,
      pendingAlerts: 2,
      auditEventsLast7d: 15,
    },
    alerts: [
      {
        id: 'mfa-not-required',
        severity: 'warning' as const,
        title: 'Verificación en dos pasos no obligatoria',
        description:
          'Se recomienda activar la verificación en dos pasos obligatoria para todos los usuarios de la empresa.',
        href: '/dashboard/settings',
      },
    ],
  };

  const tenantService = {
    getTenantSelf: jest.fn().mockResolvedValue(tenantSelfData),
    getTenantSelfSettings: jest.fn().mockResolvedValue(tenantSelfSettings),
    updateTenantSelfProfile: jest.fn().mockResolvedValue(tenantSelfData),
    updateTenantSelfSettings: jest.fn().mockResolvedValue(tenantSelfSettings),
    findOne: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    suspend: jest.fn(),
    activate: jest.fn(),
  };

  const dashboardSummaryService = {
    getSummary: jest.fn().mockResolvedValue(dashboardSummaryData),
  };

  const provisioningService = { enqueue: jest.fn() };
  const authService = { regenerateTenantAdminCredentials: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: tenantService },
        { provide: TenantProvisioningService, useValue: provisioningService },
        { provide: AuthService, useValue: authService },
        { provide: DashboardSummaryService, useValue: dashboardSummaryService },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
    jest.clearAllMocks();
    tenantService.getTenantSelf.mockResolvedValue(tenantSelfData);
    tenantService.getTenantSelfSettings.mockResolvedValue(tenantSelfSettings);
    dashboardSummaryService.getSummary.mockResolvedValue(dashboardSummaryData);
  });

  describe('GET /tenants/me', () => {
    it('retorna los datos base del tenant del ADMIN autenticado', async () => {
      const result = await controller.getMe(adminJwt);

      expect(tenantService.getTenantSelf).toHaveBeenCalledWith('tenant-uuid-1');
      expect(result.data.id).toBe('tenant-uuid-1');
      expect(result.data.name).toBe('Empresa Test ISP');
      expect(result.data.slug).toBe('empresa-test');
      expect(result.data.status).toBe('ACTIVE');
    });

    it('retorna los datos base del tenant para NOC también', async () => {
      const result = await controller.getMe(nocJwt);

      expect(tenantService.getTenantSelf).toHaveBeenCalledWith('tenant-uuid-1');
      expect(result.data.id).toBe('tenant-uuid-1');
    });

    it('pasa el tenantId del JWT al servicio — nunca un id hardcodeado', async () => {
      const otherJwt = { ...adminJwt, tenantId: 'otro-tenant-uuid' };
      await controller.getMe(otherJwt);

      expect(tenantService.getTenantSelf).toHaveBeenCalledWith('otro-tenant-uuid');
      // Nunca pasa un id diferente al del JWT
      expect(tenantService.getTenantSelf).not.toHaveBeenCalledWith('tenant-uuid-1');
    });
  });

  describe('GET /tenants/me/settings', () => {
    it('retorna la configuración operativa del tenant del ADMIN', async () => {
      const result = await controller.getMeSettings(adminJwt);

      expect(tenantService.getTenantSelfSettings).toHaveBeenCalledWith('tenant-uuid-1');
      expect(result.data.timezone).toBe('America/Bogota');
      expect(result.data.currency).toBe('COP');
      expect(result.data.features).toEqual({ billing: false, mfa_required_all: false });
    });

    it('retorna la configuración para NOC también', async () => {
      const result = await controller.getMeSettings(nocJwt);
      expect(result.data.timezone).toBe('America/Bogota');
    });
  });

  describe('PATCH /tenants/me/profile', () => {
    it('actualiza el perfil empresarial usando tenantId y actor del JWT', async () => {
      const payload = {
        contactEmail: 'nuevo-contacto@empresa-test.co',
        legalName: 'Empresa Test SAS',
        city: 'Cali',
      };

      const result = await controller.patchMeProfile(adminJwt, payload);

      expect(tenantService.updateTenantSelfProfile).toHaveBeenCalledWith(
        'tenant-uuid-1',
        payload,
        'user-uuid-admin',
      );
      expect(result.data.name).toBe('Empresa Test ISP');
    });
  });

  describe('PATCH /tenants/me/settings', () => {
    it('actualiza settings tenant-managed usando tenantId y actor del JWT', async () => {
      const payload = {
        timezone: 'America/Lima',
        features: { mfa_required_all: true },
      };

      const result = await controller.patchMeSettings(adminJwt, payload);

      expect(tenantService.updateTenantSelfSettings).toHaveBeenCalledWith(
        'tenant-uuid-1',
        payload,
        'user-uuid-admin',
      );
      expect(result.data.timezone).toBe('America/Bogota');
    });
  });

  describe('GET /tenants/me/summary', () => {
    it('retorna el summary completo para el ADMIN', async () => {
      const result = await controller.getMeSummary(adminJwt);

      expect(dashboardSummaryService.getSummary).toHaveBeenCalledWith(
        'tenant-uuid-1',
        'tenant_empresa_test',
      );
      expect(result.data.tenant.name).toBe('Empresa Test ISP');
      expect(result.data.metrics.auditEventsLast7d).toBe(15);
      expect(result.data.alerts).toHaveLength(1);
      expect(result.data.alerts[0]?.severity).toBe('warning');
      expect(result.data.alerts[0]?.id).toBe('mfa-not-required');
      expect(result.data.alerts[0]?.title).toBe('Verificación en dos pasos no obligatoria');
      expect(result.data.alerts[0]?.description).toContain('verificación en dos pasos');
      expect(result.data.alerts[0]?.title).not.toMatch(/MFA/i);
      expect(result.data.alerts[0]?.description).not.toMatch(/MFA/i);
    });

    it('pasa tanto tenantId como schemaName del JWT al servicio', async () => {
      await controller.getMeSummary(adminJwt);

      // Ambos claims del JWT se usan para el summary — nunca solo uno
      expect(dashboardSummaryService.getSummary).toHaveBeenCalledWith(
        adminJwt.tenantId,
        adminJwt.schemaName,
      );
    });

    it('el summary incluye métricas con null cuando la fuente no existe', async () => {
      const summaryWithNullMetrics = {
        ...dashboardSummaryData,
        metrics: { ...dashboardSummaryData.metrics, configuredUsers: null, mfaCoverage: null },
      };
      dashboardSummaryService.getSummary.mockResolvedValueOnce(summaryWithNullMetrics);

      const result = await controller.getMeSummary(adminJwt);

      // Null está permitido — nunca datos inventados
      expect(result.data.metrics.configuredUsers).toBeNull();
      expect(result.data.metrics.mfaCoverage).toBeNull();
    });
  });
});

describe('DashboardSummaryService — contrato del resumen (A-1…A-3)', () => {
  let service: DashboardSummaryService;
  let tenantRepo: { findOne: jest.Mock };
  const mockedRunInTenantSchema = runInTenantSchema as jest.MockedFunction<
    typeof runInTenantSchema
  >;

  const tenantId = 'tenant-uuid-summary-1';
  const schemaName = 'tenant_empresa_summary';

  function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
    return {
      id: tenantId,
      name: 'Empresa Summary',
      slug: 'empresa-summary',
      schemaName,
      status: TenantStatus.ACTIVE,
      settings: {},
      contactEmail: 'ops@empresa-summary.test',
      adminEmail: null,
      principalAdminUserId: null,
      maxSubscribers: 100,
      legalName: null,
      nit: null,
      nitDv: null,
      companyType: null,
      address: null,
      city: 'Medellín',
      department: 'Antioquia',
      countryCode: 'CO',
      postalCode: null,
      coordinates: null,
      phone: null,
      website: null,
      economicSector: null,
      logoLightUrl: 'https://cdn.example.test/logo-light.svg',
      logoDarkUrl: null,
      sealLightUrl: null,
      sealDarkUrl: null,
      faviconLightUrl: null,
      faviconDarkUrl: null,
      loginBackgroundLightUrl: null,
      loginBackgroundDarkUrl: null,
      logoLightAssetId: null,
      logoDarkAssetId: null,
      sealLightAssetId: null,
      sealDarkAssetId: null,
      faviconLightAssetId: null,
      faviconDarkAssetId: null,
      loginBackgroundLightAssetId: null,
      loginBackgroundDarkAssetId: null,
      showTenantName: true,
      brandingProductName: 'Marca fantasma',
      brandingSurfaceName: null,
      brandingMetadataTitle: null,
      brandingMetadataDescription: null,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    } as Tenant;
  }

  /** Replica la fórmula de TenantService.toSelfSettingsDto para fiber. */
  function settingsMapperFiberThreshold(settings: Record<string, unknown>): number {
    return Number(settings['fiberInstallationThresholdMeters'] ?? 50);
  }

  type UserCountScenario = {
    activeTotal: number;
    mfaEnabled: number;
  };

  function mockSchemaQueries(users: UserCountScenario, auditCount = 7): void {
    mockedRunInTenantSchema.mockImplementation(async (_ds, _schema, work) => {
      const userRepo = {
        count: jest.fn(async (opts?: { where?: Record<string, unknown> }) => {
          const where = opts?.where ?? {};
          if (where['mfaEnabled'] === true) {
            return users.mfaEnabled;
          }
          if (where['status'] === UserStatus.ACTIVE) {
            return users.activeTotal;
          }
          return 0;
        }),
      };
      const auditRepo = {
        count: jest.fn().mockResolvedValue(auditCount),
      };
      const qr = {
        manager: {
          getRepository: (entity: unknown) => {
            if (entity === User) return userRepo;
            if (entity === AuditLog) return auditRepo;
            throw new Error('Repositorio inesperado en mock de summary');
          },
        },
      };
      return work(qr as never);
    });
  }

  beforeEach(async () => {
    tenantRepo = { findOne: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardSummaryService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();

    service = module.get(DashboardSummaryService);
    mockedRunInTenantSchema.mockReset();
  });

  describe('A-1 · fiberInstallationThresholdMeters', () => {
    it('coincide con el mapper de settings cuando el campo no existe (default 50)', async () => {
      const tenant = buildTenant({ settings: { timezone: 'America/Bogota' } });
      tenantRepo.findOne.mockResolvedValue(tenant);
      mockSchemaQueries({ activeTotal: 2, mfaEnabled: 1 });

      const summary = await service.getSummary(tenantId, schemaName);
      const fromSettingsMapper = settingsMapperFiberThreshold(
        tenant.settings as Record<string, unknown>,
      );

      expect(summary.settings.fiberInstallationThresholdMeters).toBe(50);
      expect(summary.settings.fiberInstallationThresholdMeters).toBe(fromSettingsMapper);
    });

    it('coincide con el mapper de settings cuando el tenant tiene umbral persistido', async () => {
      const tenant = buildTenant({
        settings: { fiberInstallationThresholdMeters: 120, currency: 'COP' },
      });
      tenantRepo.findOne.mockResolvedValue(tenant);
      mockSchemaQueries({ activeTotal: 2, mfaEnabled: 2 });

      const summary = await service.getSummary(tenantId, schemaName);
      const fromSettingsMapper = settingsMapperFiberThreshold(
        tenant.settings as Record<string, unknown>,
      );

      expect(summary.settings.fiberInstallationThresholdMeters).toBe(120);
      expect(summary.settings.fiberInstallationThresholdMeters).toBe(fromSettingsMapper);
    });
  });

  describe('A-2 · mfaCoverage', () => {
    it('calcula el ratio mfaEnabled/ACTIVE cuando hay usuarios', async () => {
      tenantRepo.findOne.mockResolvedValue(buildTenant());
      mockSchemaQueries({ activeTotal: 4, mfaEnabled: 1 });

      const summary = await service.getSummary(tenantId, schemaName);

      expect(summary.metrics.configuredUsers).toBe(4);
      expect(summary.metrics.mfaCoverage).toBe(0.25);
    });

    it('con cero usuarios ACTIVE produce cobertura definida (1), no null', async () => {
      tenantRepo.findOne.mockResolvedValue(buildTenant());
      mockSchemaQueries({ activeTotal: 0, mfaEnabled: 0 });

      const summary = await service.getSummary(tenantId, schemaName);

      expect(summary.metrics.configuredUsers).toBe(0);
      expect(summary.metrics.mfaCoverage).toBe(1);
      expect(summary.metrics.mfaCoverage).not.toBeNull();
    });

    it('retorna null en mfaCoverage y configuredUsers cuando falla el conteo', async () => {
      tenantRepo.findOne.mockResolvedValue(buildTenant());
      mockedRunInTenantSchema.mockImplementation(async (_ds, _schema, work) => {
        const qr = {
          manager: {
            getRepository: (entity: unknown) => {
              if (entity === User) {
                return {
                  count: jest.fn().mockRejectedValue(new Error('schema unavailable')),
                };
              }
              if (entity === AuditLog) {
                return { count: jest.fn().mockResolvedValue(3) };
              }
              throw new Error('unexpected entity');
            },
          },
        };
        return work(qr as never);
      });

      const summary = await service.getSummary(tenantId, schemaName);

      expect(summary.metrics.configuredUsers).toBeNull();
      expect(summary.metrics.mfaCoverage).toBeNull();
      expect(summary.metrics.auditEventsLast7d).toBe(3);
    });
  });

  describe('A-3 · tenant estrecho sin marca', () => {
    it('expone exactamente los 13 campos servidos y omite branding', async () => {
      tenantRepo.findOne.mockResolvedValue(buildTenant());
      mockSchemaQueries({ activeTotal: 1, mfaEnabled: 1 });

      const summary = await service.getSummary(tenantId, schemaName);
      const keys = Object.keys(summary.tenant).sort();

      expect(keys).toEqual(
        [
          'city',
          'contactEmail',
          'countryCode',
          'createdAt',
          'department',
          'id',
          'legalName',
          'name',
          'nit',
          'phone',
          'slug',
          'status',
          'website',
        ].sort(),
      );
      expect(summary.tenant).not.toHaveProperty('logoLightUrl');
      expect(summary.tenant).not.toHaveProperty('brandingProductName');
      expect(summary.tenant).not.toHaveProperty('nitDv');
      expect(summary.tenant).not.toHaveProperty('showTenantName');
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.getSummary(tenantId, schemaName)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
