import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

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
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Verificacion extremo a extremo del invariante H-01 sobre las cinco superficies
 * de plataforma: un token de tenant que se atribuye el rol SYSTEM_ADMIN recibe
 * 403 en todas ellas, y el token de plataforma legitimo no queda bloqueado.
 *
 * Complementa a `roles.guard.token-type.spec.ts` (que barre TODAS las rutas a
 * nivel de guard): aqui se comprueba que el cableado real de @UseGuards produce
 * el codigo HTTP correcto.
 */

/** Ruta representativa —y de las mas sensibles— de cada superficie. */
const PLATFORM_ROUTES = [
  ['tenant', '/api/v1/tenants'],
  ['platform-audit', '/api/v1/platform-audit-logs'],
  ['platform-branding', '/api/v1/platform/branding'],
  ['search', '/api/v1/search/global?q=demo'],
  ['platform-users', '/api/v1/platform-users/me'],
] as const;

const TENANT_TOKEN_HEADER = 'x-test-token-type';

function buildUser(type: 'platform' | 'tenant'): JwtPayload {
  return {
    sub: 'usuario-uuid',
    email: 'hash-sha256',
    role: 'SYSTEM_ADMIN',
    tenantId: type === 'tenant' ? 'tenant-uuid' : null,
    schemaName: type === 'tenant' ? 'tenant_demo' : null,
    jti: 'jti-http-token-type',
    type,
  };
}

describe('Superficies de plataforma — frontera de tipo de token (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        TenantController,
        PlatformAuditController,
        PlatformBrandingController,
        SearchController,
        PlatformUsersController,
      ],
    })
      // Todas las dependencias de negocio se sustituyen por dobles vacios: la
      // prueba solo debe llegar al handler si los guards dejaron pasar.
      .useMocker(() => ({}))
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          const req = context.switchToHttp().getRequest<{
            headers: Record<string, string | undefined>;
            user?: JwtPayload;
          }>();
          const tokenType = req.headers[TENANT_TOKEN_HEADER] === 'platform' ? 'platform' : 'tenant';
          req.user = buildUser(tokenType);
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(PLATFORM_ROUTES)(
    'superficie %s → 403 con token de tenant que se atribuye SYSTEM_ADMIN',
    async (_surface, path) => {
      await request(app.getHttpServer()).get(path).set(TENANT_TOKEN_HEADER, 'tenant').expect(403);
    },
  );

  it.each(PLATFORM_ROUTES)(
    'superficie %s → no responde 403 con token de plataforma legitimo',
    async (_surface, path) => {
      const response = await request(app.getHttpServer())
        .get(path)
        .set(TENANT_TOKEN_HEADER, 'platform');

      expect(response.status).not.toBe(403);
    },
  );
});
