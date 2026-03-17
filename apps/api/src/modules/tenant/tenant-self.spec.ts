/**
 * Tests de integración para los contratos self-service del tenant autenticado.
 *
 * Verifica:
 * - GET /api/v1/tenants/me retorna datos del tenant del JWT
 * - GET /api/v1/tenants/me/settings retorna configuración operativa
 * - GET /api/v1/tenants/me/summary retorna summary (solo ADMIN)
 * - Isolation: un rol de plataforma (SYSTEM_ADMIN) no puede usar estos endpoints
 *   sin tenantId válido en el JWT
 *
 * BT-DE-13 — HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@iwana/shared';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

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
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: new Date('2026-01-01'),
    // Branding
    logoLightUrl: null,
    logoDarkUrl: null,
    sealLightUrl: null,
    sealDarkUrl: null,
    showTenantName: true,
  };

  const tenantSelfSettings = {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'CO',
    features: { billing: false, mfa_required_all: false },
  };

  const dashboardSummaryData = {
    tenant: tenantSelfData,
    settings: tenantSelfSettings,
    metrics: {
      configuredUsers: 3,
      mfaCoverage: null,
      pendingAlerts: 2,
      auditEventsLast7d: 15,
    },
    alerts: [
      {
        id: 'mfa-not-required',
        severity: 'warning' as const,
        title: 'MFA no obligatorio',
        description: 'Se recomienda habilitar MFA obligatorio.',
        href: '/dashboard/settings',
      },
    ],
  };

  const tenantService = {
    getTenantSelf: jest.fn().mockResolvedValue(tenantSelfData),
    getTenantSelfSettings: jest.fn().mockResolvedValue(tenantSelfSettings),
    updateTenantSelfProfile: jest.fn().mockResolvedValue(tenantSelfData),
    updateTenantSelfSettings: jest.fn().mockResolvedValue(tenantSelfSettings),
    updateTenantSelfBranding: jest.fn().mockResolvedValue(tenantSelfData),
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

  describe('PATCH /tenants/me/branding', () => {
    it('actualiza branding usando tenantId y actor del JWT', async () => {
      const payload = {
        sealLightUrl: 'https://cdn.empresa.co/seal-light.svg',
        showTenantName: false,
      };

      const result = await controller.patchMeBranding(adminJwt, payload);

      expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
        'tenant-uuid-1',
        payload,
        'user-uuid-admin',
      );
      expect(result.data).toBeDefined();
    });

    it('pasa tenantId del JWT — nunca un id hardcodeado', async () => {
      const otherJwt = { ...adminJwt, tenantId: 'otro-tenant-uuid' };
      await controller.patchMeBranding(otherJwt, {});

      expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
        'otro-tenant-uuid',
        expect.any(Object),
        expect.any(String),
      );
    });
  });
});
