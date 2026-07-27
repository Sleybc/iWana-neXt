import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { QueryRunner } from 'typeorm';
import { UserRole } from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';

import { MAX_PAGE_OFFSET } from './clamp-page';
import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';

// —— parties ——
import { PartiesController } from '../../modules/parties/parties.controller';
import { PartyService } from '../../modules/parties/services/party.service';
import { PartyRoleService } from '../../modules/parties/services/party-role.service';
import { PartyContactService } from '../../modules/parties/services/party-contact.service';
// —— crm ——
import { OpportunitiesController } from '../../modules/crm/opportunities/opportunities.controller';
import { OpportunitiesService } from '../../modules/crm/opportunities/opportunities.service';
// —— assurance ——
import { AssuranceController } from '../../modules/assurance/assurance.controller';
import { TicketsService } from '../../modules/assurance/services/tickets.service';
import { CommentsService } from '../../modules/assurance/services/comments.service';
import { TimelineService } from '../../modules/assurance/services/timeline.service';
import { SlaService } from '../../modules/assurance/services/sla.service';
import { PqrService } from '../../modules/assurance/services/pqr.service';
import { AssuranceDashboardService } from '../../modules/assurance/services/assurance-dashboard.service';
import { AssuranceFieldServicePort } from '../../modules/assurance/ports/assurance-field-service.port';
// —— inventory ——
import { PurchasingController } from '../../modules/inventory/purchasing.controller';
import { PurchasingQueryService } from '../../modules/inventory/services/purchasing-query.service';
import { PurchasingService } from '../../modules/inventory/services/purchasing.service';
import { PurchasingPolicyService } from '../../modules/inventory/services/purchasing-policy.service';
import { GoodsReceiptService } from '../../modules/inventory/services/goods-receipt.service';
import { RfqService } from '../../modules/inventory/services/rfq.service';
import { RfqPdfService } from '../../modules/inventory/services/rfq-pdf.service';
import { SupplierProfileService } from '../../modules/inventory/services/supplier-profile.service';
import { SupplierPartyPort } from '../../modules/inventory/ports/supplier-party.port';
// —— wfm ——
import { WfmController } from '../../modules/wfm/wfm.controller';
import { WorkOrdersService } from '../../modules/wfm/services/work-orders.service';
import { ScheduleEventsService } from '../../modules/wfm/services/schedule-events.service';
import { VisitRequestsService } from '../../modules/wfm/services/visit-requests.service';
import { ScheduleRecommendationsService } from '../../modules/wfm/services/schedule-recommendations.service';
import { TechnicianAvailabilityService } from '../../modules/wfm/services/technician-availability.service';
import { WfmDashboardService } from '../../modules/wfm/services/wfm-dashboard.service';
import { OperationalEventualitiesService } from '../../modules/wfm/services/operational-eventualities.service';
import { OperatingWindowResolverService } from '../../modules/wfm/services/operating-window-resolver.service';
import { WfmOrganizationSitesReadPort } from '../../modules/wfm/ports/wfm-organization-sites-read.port';
import { WfmTenantSettingsReadPort } from '../../modules/wfm/ports/wfm-tenant-settings-read.port';

/**
 * Cota de paginación `clampPage` verificada EN EL ENDPOINT, no en el helper.
 *
 * ## Por qué existe (hallazgo A-2 / disposición §3,
 * INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0)
 *
 * `clamp-page.spec.ts` prueba `clampPage` llamándola directamente. Su propio
 * comentario declara el hueco: «si alguien borra `clampPage` de los servicios,
 * los endpoints dejan de proteger el pool». `MAX_PAGE_OFFSET = 9_999` solo
 * protege si cada servicio la invoca; un test unitario del helper sigue verde
 * aunque ningún servicio lo llame ya.
 *
 * Este spec cierra ese hueco: hace peticiones HTTP reales (supertest) contra
 * los controllers reales, con los servicios REALES —no mocks— y solo la capa de
 * base de datos sustituida. Si un servicio deja de llamar a `clampPage`, la
 * petición fuera de rango deja de responder 400 y el test se pone rojo.
 *
 * ## Muestra de endpoints y por qué esta
 *
 * Cinco listados paginados, uno por cada módulo del Modulith que hoy invoca
 * `clampPage`, elegidos para cubrir las tres formas distintas en que el
 * parámetro llega al servicio —y por tanto los tres modos en que la cota podría
 * perderse en una refactorización:
 *
 * | Módulo | Endpoint | Servicio real | Validación previa de `page` |
 * | --- | --- | --- | --- |
 * | parties | `GET /api/v1/parties` | `PartyService.findAll` | DTO class-validator (`ListPartiesDto`) |
 * | crm | `GET /api/v1/opportunities` | `OpportunitiesService.findAll` | pipe dedicado (`CrmListPagePipe`) |
 * | assurance | `GET /api/v1/assurance/tickets` | `TicketsService.list` | esquema Zod (`ListTicketsQuerySchema`) |
 * | inventory | `GET /api/v1/purchasing/requests` | `PurchasingQueryService.listRequests` | Zod híbrido page/cursor |
 * | wfm | `GET /api/v1/wfm/work-orders` | `WorkOrdersService.list` | ninguna: `@Query('page')` crudo |
 *
 * `page=100` + `limit=100` es el caso de borde exacto de BL-2: ambos valores
 * pasan todas las validaciones previas de cada módulo (el tope de `limit` es
 * 100 y el de `page`, donde existe, también), y su producto —10 000— es el
 * primer valor que supera `MAX_PAGE_OFFSET`. Es decir: **el 400 solo puede
 * venir de `clampPage`**, de ningún otro validador de la cadena.
 *
 * ## Qué se sustituye y qué no
 *
 * Solo `runInTenantSchema` está mockeado, de modo que ninguna consulta llega a
 * PostgreSQL pero el camino de control del servicio es el de producción. Eso
 * permite además la aserción que da sentido a DEF-2: en el caso fuera de rango
 * `runInTenantSchema` **no se llama**, es decir, la petición se rechaza antes de
 * ocupar una conexión del pool compartido de pgBouncer.
 */

const TENANT_CONTEXT = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  schemaName: 'tenant_test',
  tenantSlug: 'test',
};

const ADMIN_TOKEN = 'Bearer admin-token';

const ADMIN_ACTOR: JwtPayload & { id: string } = {
  id: '00000000-0000-4000-8000-0000000000ad',
  sub: '00000000-0000-4000-8000-0000000000ad',
  email: 'qa-clamp-page@iwana.invalid',
  role: UserRole.ADMIN,
  tenantId: TENANT_CONTEXT.tenantId,
  schemaName: TENANT_CONTEXT.schemaName,
  jti: 'jti-clamp-page',
  type: 'tenant',
};

/** Mensaje literal de `clamp-page.ts` cuando `page * limit` supera la cota. */
const OUT_OF_RANGE_MESSAGE = 'El número de página excede el límite permitido';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    // TenantContext se conserva real: el contexto lo abre un middleware del test.
    runInTenantSchema: jest.fn(),
  };
});

jest.mock('../../modules/auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload & { id?: string };
        };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);

      if (isPublic) {
        return true;
      }

      const req = context.switchToHttp().getRequest();
      if (req.headers.authorization !== ADMIN_TOKEN) {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      req.user = ADMIN_ACTOR;
      return true;
    }
  },
}));

jest.mock('../../modules/auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const user = context.switchToHttp().getRequest().user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) {
        return true;
      }

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }

      return true;
    }
  },
}));

/** Resultados de las operaciones terminales del QueryBuilder falso. */
const TERMINAL_RESULTS: Record<string, unknown> = {
  getMany: [],
  getManyAndCount: [[], 0],
  getOne: null,
  getCount: 0,
  getRawMany: [],
  getRawOne: undefined,
  getRawAndEntities: { entities: [], raw: [] },
  execute: [],
};

/** Props que nunca deben resolverse como método encadenable del stub. */
const NON_CHAINABLE = new Set(['then', 'catch', 'finally', 'constructor']);

/**
 * QueryBuilder falso encadenable. Devuelve `this` para cualquier método de
 * construcción y una promesa vacía para los terminales, sin conocer de antemano
 * qué métodos usa cada servicio.
 */
function createQueryBuilderStub(): unknown {
  const stub: unknown = new Proxy(
    {},
    {
      get(_target, property): unknown {
        if (typeof property !== 'string' || NON_CHAINABLE.has(property)) {
          return undefined;
        }
        if (property in TERMINAL_RESULTS) {
          return async (): Promise<unknown> => TERMINAL_RESULTS[property];
        }
        return (): unknown => stub;
      },
    },
  );
  return stub;
}

function createFakeQueryRunner(): QueryRunner {
  return {
    manager: {
      createQueryBuilder: (): unknown => createQueryBuilderStub(),
    },
  } as unknown as QueryRunner;
}

/** Providers no ejercitados por este spec: existen solo para satisfacer la DI. */
function stubProvider(): Record<string, never> {
  return {};
}

interface PaginatedEndpoint {
  readonly modulo: string;
  readonly ruta: string;
  readonly servicio: string;
}

const ENDPOINTS: readonly PaginatedEndpoint[] = [
  { modulo: 'parties', ruta: '/api/v1/parties', servicio: 'PartyService.findAll' },
  { modulo: 'crm', ruta: '/api/v1/opportunities', servicio: 'OpportunitiesService.findAll' },
  { modulo: 'assurance', ruta: '/api/v1/assurance/tickets', servicio: 'TicketsService.list' },
  {
    modulo: 'inventory',
    ruta: '/api/v1/purchasing/requests',
    servicio: 'PurchasingQueryService.listRequests',
  },
  { modulo: 'wfm', ruta: '/api/v1/wfm/work-orders', servicio: 'WorkOrdersService.list' },
];

describe('clampPage en endpoints de listado paginado (HTTP)', () => {
  let app: INestApplication;
  const mockedRunInTenantSchema = runInTenantSchema as jest.MockedFunction<
    typeof runInTenantSchema
  >;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        PartiesController,
        OpportunitiesController,
        AssuranceController,
        PurchasingController,
        WfmController,
      ],
      providers: [
        // La única dependencia real de infraestructura: sustituida por completo.
        { provide: getDataSourceToken(), useValue: stubProvider() },

        // —— servicios REALES bajo prueba ——
        PartyService,
        OpportunitiesService,
        TicketsService,
        PurchasingQueryService,
        WorkOrdersService,

        // —— parties: resto del controller ——
        { provide: PartyRoleService, useValue: stubProvider() },
        { provide: PartyContactService, useValue: stubProvider() },

        // —— assurance: resto del controller y dependencias de TicketsService ——
        { provide: CommentsService, useValue: stubProvider() },
        { provide: TimelineService, useValue: stubProvider() },
        { provide: SlaService, useValue: stubProvider() },
        { provide: PqrService, useValue: stubProvider() },
        { provide: AssuranceDashboardService, useValue: stubProvider() },
        { provide: AssuranceFieldServicePort, useValue: stubProvider() },

        // —— inventory: resto del controller y dependencias de PurchasingQueryService ——
        { provide: PurchasingService, useValue: stubProvider() },
        { provide: PurchasingPolicyService, useValue: stubProvider() },
        { provide: GoodsReceiptService, useValue: stubProvider() },
        { provide: RfqService, useValue: stubProvider() },
        { provide: RfqPdfService, useValue: stubProvider() },
        { provide: SupplierProfileService, useValue: stubProvider() },
        { provide: SupplierPartyPort, useValue: stubProvider() },

        // —— wfm: resto del controller ——
        { provide: ScheduleEventsService, useValue: stubProvider() },
        { provide: VisitRequestsService, useValue: stubProvider() },
        { provide: ScheduleRecommendationsService, useValue: stubProvider() },
        { provide: TechnicianAvailabilityService, useValue: stubProvider() },
        { provide: WfmDashboardService, useValue: stubProvider() },
        { provide: OperationalEventualitiesService, useValue: stubProvider() },
        { provide: OperatingWindowResolverService, useValue: stubProvider() },
        { provide: WfmOrganizationSitesReadPort, useValue: stubProvider() },
        { provide: WfmTenantSettingsReadPort, useValue: stubProvider() },

        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    // Sustituto de TenantMiddleware: los servicios resuelven el schema desde
    // TenantContext, nunca desde el input de la petición.
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      TenantContext.run(TENANT_CONTEXT, () => next());
    });

    // Mismas opciones que `main.ts`: la cadena de validación previa al servicio
    // debe ser la de producción para que el 400 no pueda venir de otro sitio.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockedRunInTenantSchema.mockReset();
    mockedRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, fn) =>
      fn(createFakeQueryRunner()),
    );
  });

  it('MAX_PAGE_OFFSET sigue siendo alcanzable con page=100 y limit=100', () => {
    // Premisa de toda la tabla de abajo. Si alguien sube la cota a 10 000 o más,
    // el caso deja de ser fuera de rango y estos tests dejarían de probar nada:
    // preferimos que falle aquí, con el motivo escrito.
    expect(100 * 100).toBeGreaterThan(MAX_PAGE_OFFSET);
    expect(99 * 100).toBeLessThanOrEqual(MAX_PAGE_OFFSET);
  });

  describe.each(ENDPOINTS)('$modulo — GET $ruta', ({ ruta, servicio }: PaginatedEndpoint) => {
    it('responde 400 con el mensaje de clamp-page cuando page × limit excede la cota', async () => {
      await request(app.getHttpServer())
        .get(`${ruta}?page=100&limit=100`)
        .set('Authorization', ADMIN_TOKEN)
        .expect(400)
        .expect(({ body }) => {
          const message = (body as { message?: unknown }).message;
          expect(JSON.stringify(message)).toContain(OUT_OF_RANGE_MESSAGE);
        });
    });

    it('rechaza antes de tomar una conexión del pool (DEF-2)', async () => {
      await request(app.getHttpServer())
        .get(`${ruta}?page=100&limit=100`)
        .set('Authorization', ADMIN_TOKEN)
        .expect(400);

      // Si `${servicio}` dejara de llamar a clampPage, la petición llegaría aquí.
      expect(mockedRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('acepta el borde inferior page=99 limit=100 y llega al servicio', async () => {
      // Control positivo: prueba que el 400 anterior es de la cota y no de un
      // arnés de test roto — con el mismo endpoint y un page una unidad menor,
      // la petición atraviesa toda la cadena y alcanza la capa de datos.
      await request(app.getHttpServer())
        .get(`${ruta}?page=99&limit=100`)
        .set('Authorization', ADMIN_TOKEN)
        .expect(200);

      expect(mockedRunInTenantSchema).toHaveBeenCalledTimes(1);
      expect(mockedRunInTenantSchema).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_CONTEXT.schemaName,
        expect.any(Function),
      );
    });

    it('acepta una primera página normal (page=1, limit=20)', async () => {
      await request(app.getHttpServer())
        .get(`${ruta}?page=1&limit=20`)
        .set('Authorization', ADMIN_TOKEN)
        .expect(200);

      expect(mockedRunInTenantSchema).toHaveBeenCalledTimes(1);
    });
  });
});
