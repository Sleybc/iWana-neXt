import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantContext, Tenant } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { Request, Response } from 'express';
import {
  platformRefreshCookieName,
  tenantAccessCookieName,
} from '../auth/session-cookies.constants';
import { TenantMiddleware, type TenantResolutionSource } from './tenant.middleware';
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

type MarkedRequest = Request & { iwanaTenantResolutionSource?: TenantResolutionSource };

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
      expect((request as MarkedRequest).iwanaTenantResolutionSource).toBe('jwt-verified');
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
      expect((request as MarkedRequest).iwanaTenantResolutionSource).toBe('public-header');
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

  it('marca X-Tenant-Slug como fallback público cuando el Bearer no verifica', async () => {
    const tenant = buildTenant();
    jwtService.verify.mockImplementation(() => {
      throw new Error('Bearer inválido');
    });
    tenantService.findBySlug.mockResolvedValue(tenant);

    const request = buildRequest({
      originalUrl: '/api/v1/auth/login',
      url: '/api/v1/auth/login',
      headers: {
        authorization: 'Bearer bearer-no-verificable',
        'x-tenant-slug': tenant.slug,
      },
    });
    const next = jest.fn(() => {
      expect((request as MarkedRequest).iwanaTenantResolutionSource).toBe('public-header');
      expect(TenantContext.get()?.tenantId).toBe(tenant.id);
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

  it('resuelve el contexto desde la cookie de access cuando hay JWT valido (C-1)', async () => {
    const tenant = buildTenant();
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      jti: 'jwt-jti-cookie',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenant);

    const request = buildRequest({
      cookies: { [tenantAccessCookieName()]: 'cookie.jwt.token' },
    });

    const next = jest.fn(() => {
      expect((request as MarkedRequest).iwanaTenantResolutionSource).toBe('jwt-verified');
      expect(TenantContext.get()).toEqual({
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      });
    });

    await middleware.use(request, {} as Response, next);

    expect(jwtService.verify).toHaveBeenCalledWith('cookie.jwt.token');
    expect(tenantService.findById).toHaveBeenCalledWith(tenant.id);
    expect(tenantService.findBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  // TEST DE ARQUITECTURA (C-1, BLOQUEANTE DE MERGE): una petición autenticada
  // de tenant NUNCA resuelve contexto por `X-Tenant-Slug`, ni siquiera cuando
  // la cabecera viaja con un valor impostor. Si este test falla, el contexto
  // volvió a depender de un valor controlado por el cliente en rutas
  // autenticadas: es una regresión de multi-tenancy y se bloquea el merge.
  it('una peticion autenticada con JWT de tenant valido NUNCA resuelve contexto por X-Tenant-Slug', async () => {
    const realTenant = buildTenant({ id: 'tenant-uuid-real', schemaName: 'tenant_real' });
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: realTenant.id,
      schemaName: realTenant.schemaName,
      jti: 'jwt-jti-5',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(realTenant);
    tenantService.findBySlug.mockResolvedValue(
      buildTenant({ id: 'tenant-uuid-spoofed', slug: 'otro-tenant', schemaName: 'tenant_spoofed' }),
    );

    const request = buildRequest({
      headers: {
        authorization: 'Bearer valid.jwt.token',
        'x-tenant-slug': 'otro-tenant',
      },
    });

    const next = jest.fn(() => {
      expect(TenantContext.get()).toEqual({
        tenantId: realTenant.id,
        schemaName: realTenant.schemaName,
        tenantSlug: realTenant.slug,
      });
    });

    await middleware.use(request, {} as Response, next);

    expect(tenantService.findBySlug).not.toHaveBeenCalled();
    expect(tenantService.findById).toHaveBeenCalledWith(realTenant.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('una peticion autenticada por cookie con X-Tenant-Slug impostor tambien resuelve por el token (C-1)', async () => {
    const realTenant = buildTenant();
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-1',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: realTenant.id,
      schemaName: realTenant.schemaName,
      jti: 'jwt-jti-6',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(realTenant);

    const request = buildRequest({
      headers: { 'x-tenant-slug': 'impostor' },
      cookies: { [tenantAccessCookieName()]: 'cookie.jwt.token' },
    });

    const next = jest.fn(() => {
      expect(TenantContext.get()).toEqual({
        tenantId: realTenant.id,
        schemaName: realTenant.schemaName,
        tenantSlug: realTenant.slug,
      });
    });

    await middleware.use(request, {} as Response, next);

    expect(tenantService.findBySlug).not.toHaveBeenCalled();
    expect(tenantService.findById).toHaveBeenCalledWith(realTenant.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('no exige X-Tenant-Slug en /auth/refresh con cookie de refresh de plataforma (C-6)', async () => {
    const request = buildRequest({
      method: 'POST',
      originalUrl: '/api/v1/auth/refresh',
      url: '/api/v1/auth/refresh',
      cookies: { [platformRefreshCookieName()]: 'platform.refresh.token' },
    });

    const next = jest.fn();

    await middleware.use(request, {} as Response, next);

    expect(tenantService.findBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fija iwanaVerifiedSub desde los claims verificados (P-09, bucket por sujeto)', async () => {
    const tenant = buildTenant();
    jwtService.verify.mockReturnValue({
      sub: 'user-uuid-sub-9',
      email: 'hash-email-123',
      role: 'tenant_admin',
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      jti: 'jwt-jti-9',
      type: 'tenant',
    });
    tenantService.findById.mockResolvedValue(tenant);

    const request = buildRequest({
      cookies: { [tenantAccessCookieName()]: 'cookie.jwt.token' },
    });

    const next = jest.fn(() => {
      expect((request as Request & { iwanaVerifiedSub?: string }).iwanaVerifiedSub).toBe(
        'user-uuid-sub-9',
      );
    });

    await middleware.use(request, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('P-17: el 404 de ruta publica no devuelve el slug pedido', async () => {
    tenantService.findBySlug.mockResolvedValue(null);

    const request = buildRequest({
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-slug': 'empresa-inexistente' },
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(
      'Empresa no encontrada.',
    );

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.not.toThrow(
      'empresa-inexistente',
    );
  });

  it('P-17: el 403 de ruta publica no revela el estado comercial', async () => {
    tenantService.findBySlug.mockResolvedValue(buildTenant({ status: TenantStatus.SUSPENDED }));

    const request = buildRequest({
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      url: '/api/v1/auth/login',
      headers: { 'x-tenant-slug': 'isp-test' },
    });

    await expect(middleware.use(request, {} as Response, jest.fn())).rejects.toThrow(
      'La empresa no esta disponible. Contactar soporte iWana.',
    );
  });
});
