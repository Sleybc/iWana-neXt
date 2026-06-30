import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantContext, Tenant } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { Request, Response } from 'express';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-uuid-001',
    name: 'ISP Test Colombia',
    slug: 'isp-test',
    schemaName: 'tenant_isp_test',
    status: TenantStatus.ACTIVE,
    settings: { timezone: 'America/Bogota', currency: 'COP' },
    contactEmail: 'admin@isptest.co',
    maxSubscribers: 100,
    createdAt: new Date('2026-03-12T00:00:00Z'),
    updatedAt: new Date('2026-03-12T00:00:00Z'),
    ...overrides,
  } as Tenant;
}

function buildRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    headers: {},
    originalUrl: '/api/v1/users/me',
    url: '/api/v1/users/me',
    ...overrides,
  } as Request;
}

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let tenantService: jest.Mocked<Pick<TenantService, 'findById' | 'findBySlug'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;

  beforeEach(() => {
    tenantService = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
    };

    jwtService = {
      verify: jest.fn(),
    };

    middleware = new TenantMiddleware(
      tenantService as unknown as TenantService,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resuelve el contexto desde claims verificados del JWT cuando hay Bearer token', async () => {
    const tenant = buildTenant();
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      jti: 'jwt-jti-1',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenant);

    const request = buildRequest({
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    const next = jest.fn(() => {
      expect(TenantContext.get()).toEqual({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      });
    });

    await middleware.use(request, {} as Response, next);

    expect(jwtService.verify).toHaveBeenCalledWith('valid.jwt.token');
    expect(tenantService.findById).toHaveBeenCalledWith(tenant.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('hace fallback a X-Tenant-Slug en auth publico cuando no hay Bearer token', async () => {
    const tenant = buildTenant();
    tenantService.findBySlug.mockResolvedValue(tenant);

    const request = buildRequest({
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-slug': tenant.slug },
    });

    const next = jest.fn(() => {
      expect(TenantContext.get()).toEqual({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      });
    });

    await middleware.use(request, {} as Response, next);

    expect(tenantService.findBySlug).toHaveBeenCalledWith(tenant.slug);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza auth publico sin JWT ni X-Tenant-Slug', async () => {
    const request = buildRequest({
      method: 'POST',
      originalUrl: '/api/v1/auth/refresh',
      url: '/api/v1/auth/refresh',
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza el token si el schemaName del claim no coincide con public.tenants', async () => {
    const tenant = buildTenant({ schemaName: 'tenant_real' });
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: tenant.id,
      schemaName: 'tenant_falso',
      jti: 'jwt-jti-2',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenant);

    const request = buildRequest({
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza tenants suspendidos aunque el JWT sea valido', async () => {
    const tenant = buildTenant({ status: TenantStatus.SUSPENDED });
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      jti: 'jwt-jti-3',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenant);

    const request = buildRequest({
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza tenants marcados para eliminacion aunque el JWT sea valido', async () => {
    const tenant = buildTenant({ status: TenantStatus.MARKED_FOR_DELETION });
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      jti: 'jwt-jti-4',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenant);

    const request = buildRequest({
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('no obliga contexto de tenant para tokens de plataforma', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'platform-user-uuid',
      email: 'hash-platform-123',
      role: 'system_admin',
      tenantId: null,
      schemaName: null,
      jti: 'jwt-jti-platform',
      type: 'platform',
    });

    const request = buildRequest({
      originalUrl: '/api/v1/tenants',
      url: '/api/v1/tenants',
      headers: { authorization: 'Bearer platform.jwt.token' },
    });

    const next = jest.fn(() => {
      expect(TenantContext.get()).toBeUndefined();
    });

    await middleware.use(request, {} as Response, next);

    expect(tenantService.findById).not.toHaveBeenCalled();
    expect(tenantService.findBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
