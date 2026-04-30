jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MediaUsage } from '@iwana/db';
import { AuthService } from '../auth/auth.service';
import { TenantController } from './tenant.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantService } from './tenant.service';
import { DashboardSummaryService } from './dashboard-summary.service';

describe('TenantController', () => {
  let controller: TenantController;

  const tenantService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    suspend: jest.fn(),
    activate: jest.fn(),
    getTenantSelf: jest.fn(),
    getTenantSelfSettings: jest.fn(),
    getTenantPublicBranding: jest.fn(),
    updateTenantSelfBranding: jest.fn(),
    updateTenantBranding: jest.fn(),
    uploadTenantBrandingAsset: jest.fn(),
  };

  const provisioningService = {
    enqueue: jest.fn(),
  };

  const authService = {
    getBootstrapTenantAdminCredentials: jest.fn(),
    regenerateTenantAdminCredentials: jest.fn(),
  };

  const dashboardSummaryService = {
    getSummary: jest.fn(),
  };

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza la regeneracion si falta Idempotency-Key', async () => {
    await expect(controller.regenerateAdminCredentials('tenant-uuid-1', undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('suspende un tenant usando el servicio de tenant', async () => {
    tenantService.suspend.mockResolvedValue({
      id: 'tenant-uuid-1',
      status: 'SUSPENDED',
    });

    const result = await controller.suspend('tenant-uuid-1');

    expect(tenantService.suspend).toHaveBeenCalledWith('tenant-uuid-1');
    expect(result.data.status).toBe('SUSPENDED');
  });

  it('lista tenants pasando paginación y filtros operativos al servicio', async () => {
    tenantService.findAll.mockResolvedValue({
      data: [{ id: 'tenant-uuid-1', status: 'ACTIVE' }],
      total: 1,
    });

    const result = await controller.findAll('25', '10', 'ACTIVE', 'isp-test');

    expect(tenantService.findAll).toHaveBeenCalledWith(25, 10, {
      status: 'ACTIVE',
      search: 'isp-test',
    });
    expect(result.meta.total).toBe(1);
  });

  it('rechaza status inválidos al listar tenants', async () => {
    await expect(controller.findAll('25', '0', 'BROKEN', undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('activa un tenant usando el servicio de tenant', async () => {
    tenantService.activate.mockResolvedValue({
      id: 'tenant-uuid-1',
      status: 'ACTIVE',
    });

    const result = await controller.activate('tenant-uuid-1');

    expect(tenantService.activate).toHaveBeenCalledWith('tenant-uuid-1');
    expect(result.data.status).toBe('ACTIVE');
  });

  it('consulta el acceso bootstrap fijo del admin inicial', async () => {
    tenantService.findOne.mockResolvedValue({
      id: 'tenant-uuid-1',
      schemaName: 'tenant_isp_test',
    });
    authService.getBootstrapTenantAdminCredentials.mockResolvedValue({
      message: 'Acceso inicial fijo vigente para el ADMIN bootstrap del tenant.',
      adminEmail: 'admin@iwana.co',
      temporaryPassword: 'InitAdmin!2026',
      expiresAt: '2026-03-20T00:00:00.000Z',
    });

    const result = await controller.getBootstrapAdminCredentials('tenant-uuid-1');

    expect(tenantService.findOne).toHaveBeenCalledWith('tenant-uuid-1');
    expect(authService.getBootstrapTenantAdminCredentials).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      schemaName: 'tenant_isp_test',
    });
    expect(result.data.adminEmail).toBe('admin@iwana.co');
  });

  it('usa el tenant y delega la regeneracion segura en AuthService', async () => {
    tenantService.findOne.mockResolvedValue({
      id: 'tenant-uuid-1',
      schemaName: 'tenant_isp_test',
    });
    authService.regenerateTenantAdminCredentials.mockResolvedValue({
      message: 'Credenciales temporales regeneradas para el ADMIN inicial del tenant.',
      adminEmail: 'admin@isptest.co',
      temporaryPassword: 'IwN!a9-newpass',
      expiresAt: '2026-03-20T00:00:00.000Z',
    });

    const result = await controller.regenerateAdminCredentials('tenant-uuid-1', ' idem-1 ');

    expect(tenantService.findOne).toHaveBeenCalledWith('tenant-uuid-1');
    expect(authService.regenerateTenantAdminCredentials).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      schemaName: 'tenant_isp_test',
      idempotencyKey: 'idem-1',
    });
    expect(result.data.temporaryPassword).toBe('IwN!a9-newpass');
  });

  it('resuelve branding público por slug', async () => {
    tenantService.getTenantPublicBranding.mockResolvedValue({
      displayName: 'ISP Test Colombia',
      showTenantName: true,
      logoLightUrl: 'https://cdn.example.test/logo.png',
    });

    const result = await controller.getPublicBranding('isp-test');

    expect(tenantService.getTenantPublicBranding).toHaveBeenCalledWith('isp-test');
    expect(result.data.displayName).toBe('ISP Test Colombia');
  });

  it('actualiza branding self-service delegando al servicio', async () => {
    tenantService.updateTenantSelfBranding.mockResolvedValue({
      id: 'tenant-uuid-1',
      logoLightUrl: 'https://cdn.example.test/logo.png',
    });

    const result = await controller.patchMeBranding(
      { tenantId: 'tenant-uuid-1', sub: 'user-1' } as never,
      { logoLightUrl: 'https://cdn.example.test/logo.png' },
    );

    expect(tenantService.updateTenantSelfBranding).toHaveBeenCalledWith(
      'tenant-uuid-1',
      { logoLightUrl: 'https://cdn.example.test/logo.png' },
      'user-1',
    );
    expect(result.data.logoLightUrl).toBe('https://cdn.example.test/logo.png');
  });

  it('rechaza upload de branding self-service si falta file', async () => {
    await expect(
      controller.uploadMeBrandingAsset(
        { tenantId: 'tenant-uuid-1', sub: 'user-1' } as never,
        { usage: MediaUsage.LOGO, themeVariant: 'light' },
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
