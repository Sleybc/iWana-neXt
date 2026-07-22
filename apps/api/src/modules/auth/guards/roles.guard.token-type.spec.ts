import { ExecutionContext, ForbiddenException, Type } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { isPlatformOnlyRole, PlatformRole, UserRole } from '@iwana/shared';
// Los controladores de plataforma inyectan AuthService solo como token de DI.
// Mockear el modulo evita cargar otplib@13 (ESM) en un runner CommonJS.
jest.mock('../auth.service', () => ({
  AuthService: class AuthService {},
}));

import { PlatformAuditController } from '../../audit/platform-audit.controller';
import { PlatformBrandingController } from '../../platform-branding/platform-branding.controller';
import { PlatformUsersController } from '../../platform-users/platform-users.controller';
import { SearchController } from '../../search/search.controller';
import { TenantController } from '../../tenant/tenant.controller';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PlatformOnlyGuard } from './platform-only.guard';
import { RolesGuard } from './roles.guard';

/**
 * Invariante de seguridad H-01: un rol de plataforma NO puede ejercerse con un
 * token de tenant, por mucho que el literal del rol coincida.
 *
 * La comprobacion recorre las rutas REALES de las cinco superficies de
 * plataforma leyendo su metadata @Roles(). Si alguien anade manana una ruta
 * nueva a cualquiera de esos controladores, entra automaticamente en el barrido
 * — es lo que impide que el fallo reaparezca por olvido.
 */

/** Las cinco superficies alcanzables descritas en el hallazgo. */
const PLATFORM_SURFACES: Array<Type<unknown>> = [
  TenantController,
  PlatformAuditController,
  PlatformBrandingController,
  SearchController,
  PlatformUsersController,
];

/** Controladores cuya superficie completa es de plataforma. */
const PURE_PLATFORM_SURFACES: Array<Type<unknown>> = [
  PlatformAuditController,
  PlatformBrandingController,
  SearchController,
  PlatformUsersController,
];

interface RouteUnderTest {
  controller: Type<unknown>;
  methodName: string;
  handler: (...args: unknown[]) => unknown;
  requiredRoles: string[];
}

function buildPayload(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: 'usuario-uuid',
    email: 'hash-sha256',
    role: UserRole.ADMIN,
    tenantId: 'tenant-uuid',
    schemaName: 'tenant_demo',
    jti: 'jti-token-type',
    type: 'tenant',
    ...overrides,
  };
}

function buildContext(
  route: Pick<RouteUnderTest, 'controller' | 'handler'>,
  user: JwtPayload | undefined,
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => route.handler,
    getClass: () => route.controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Todas las rutas de un controlador con los roles efectivos que declaran. */
function collectRoutes(controller: Type<unknown>): RouteUnderTest[] {
  const reflector = new Reflector();
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((methodName) => methodName !== 'constructor')
    .map((methodName) => ({ methodName, member: prototype[methodName] }))
    .filter(
      (entry): entry is { methodName: string; member: (...args: unknown[]) => unknown } =>
        typeof entry.member === 'function' &&
        Reflect.getMetadata(PATH_METADATA, entry.member) !== undefined,
    )
    .map(({ methodName, member }) => ({
      controller,
      methodName,
      handler: member,
      requiredRoles: reflector.getAllAndOverride<string[]>(ROLES_KEY, [member, controller]) ?? [],
    }));
}

/** Rutas que declaran al menos un rol de plataforma. */
function collectPlatformRoutes(controller: Type<unknown>): RouteUnderTest[] {
  return collectRoutes(controller).filter((route) => route.requiredRoles.some(isPlatformOnlyRole));
}

/** Rutas que declaran exclusivamente roles de tenant. */
function collectTenantRoutes(controller: Type<unknown>): RouteUnderTest[] {
  return collectRoutes(controller).filter(
    (route) =>
      route.requiredRoles.length > 0 &&
      route.requiredRoles.every((role) => !isPlatformOnlyRole(role)),
  );
}

describe('RolesGuard — frontera de tipo de token en superficies de plataforma', () => {
  const guard = new RolesGuard(new Reflector());

  it('cada superficie de plataforma expone al menos una ruta con rol de plataforma', () => {
    for (const controller of PLATFORM_SURFACES) {
      expect(collectPlatformRoutes(controller).length).toBeGreaterThan(0);
    }
  });

  describe.each(PLATFORM_SURFACES.map((controller) => [controller.name, controller] as const))(
    '%s',
    (_name, controller) => {
      const routes = collectPlatformRoutes(controller as Type<unknown>);

      it.each(routes.map((route) => [route.methodName, route] as const))(
        '%s deniega un token de tenant con rol SYSTEM_ADMIN',
        (_methodName, route) => {
          const context = buildContext(
            route,
            buildPayload({ type: 'tenant', role: 'SYSTEM_ADMIN' as UserRole }),
          );

          expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        },
      );

      it.each(routes.map((route) => [route.methodName, route] as const))(
        '%s deniega un token de tenant con rol IWANA_SUPPORT',
        (_methodName, route) => {
          const context = buildContext(
            route,
            buildPayload({ type: 'tenant', role: 'IWANA_SUPPORT' as UserRole }),
          );

          expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        },
      );

      it.each(routes.map((route) => [route.methodName, route] as const))(
        '%s admite el token de plataforma legitimo',
        (_methodName, route) => {
          const platformRole = route.requiredRoles.find(isPlatformOnlyRole) as PlatformRole;
          const context = buildContext(
            route,
            buildPayload({
              type: 'platform',
              role: platformRole as unknown as UserRole,
              tenantId: null,
              schemaName: null,
            }),
          );

          expect(guard.canActivate(context)).toBe(true);
        },
      );
    },
  );

  describe('rutas de tenant del mismo controlador', () => {
    const tenantRoutes = collectTenantRoutes(TenantController);

    it('TenantController conserva rutas de ambito tenant', () => {
      expect(tenantRoutes.length).toBeGreaterThan(0);
    });

    it.each(tenantRoutes.map((route) => [route.methodName, route] as const))(
      '%s sigue admitiendo un rol de tenant legitimo',
      (_methodName, route) => {
        const tenantRole = route.requiredRoles.find(
          (role) => !isPlatformOnlyRole(role),
        ) as UserRole;
        const context = buildContext(route, buildPayload({ type: 'tenant', role: tenantRole }));

        expect(guard.canActivate(context)).toBe(true);
      },
    );
  });
});

describe('PlatformOnlyGuard — complemento a nivel de clase', () => {
  const guard = new PlatformOnlyGuard(new Reflector());

  it.each(PURE_PLATFORM_SURFACES.map((controller) => [controller.name, controller] as const))(
    '%s deniega cualquier token de tenant',
    (_name, controller) => {
      const routes = collectPlatformRoutes(controller as Type<unknown>);
      const route = routes[0]!;
      const context = buildContext(
        route,
        buildPayload({ type: 'tenant', role: 'SYSTEM_ADMIN' as UserRole }),
      );

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    },
  );

  it('deniega una peticion sin usuario autenticado', () => {
    const route = collectPlatformRoutes(SearchController)[0]!;

    expect(() => guard.canActivate(buildContext(route, undefined))).toThrow(ForbiddenException);
  });

  it('admite el token de plataforma', () => {
    const route = collectPlatformRoutes(SearchController)[0]!;
    const context = buildContext(
      route,
      buildPayload({
        type: 'platform',
        role: PlatformRole.SYSTEM_ADMIN as unknown as UserRole,
        tenantId: null,
        schemaName: null,
      }),
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
