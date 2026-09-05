import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NestMiddleware,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  platformAccessCookieName,
  platformRefreshCookieName,
  tenantAccessCookieName,
} from '../auth/session-cookies.constants';
import { PUBLIC_ROUTES_WITH_TENANT, PUBLIC_ROUTES_WITHOUT_TENANT } from './public-routes';
import { TenantService } from './tenant.service';

export type TenantResolutionSource = 'jwt-verified' | 'public-header' | 'none';

type TenantResolutionRequest = Request & {
  iwanaTenantResolutionSource?: TenantResolutionSource;
  /**
   * `sub` del JWT verificado en la rama `jwt-verified` (P-09, Ola 2).
   * Lo consume el tracker del rate limiter global para el bucket por sujeto.
   * Nunca sale de input del cliente: solo se fija desde claims firmados.
   */
  iwanaVerifiedSub?: string;
};

/**
 * Middleware de resolucion de tenant por request.
 *
 * Extrae el identificador del tenant del request y lo almacena en
 * AsyncLocalStorage (TenantContext) para toda la cadena de ejecucion.
 *
 * Pipeline de seguridad (HLD Seccion 2):
 *   JwtAuthGuard → TenantMiddleware → RolesGuard → AbacGuard → Business Logic
 *
 * Resolucion vigente (ADR-081, C-1):
 * - JWT verificado (cabecera Bearer durante la transicion, o cookie de access)
 *   → tenantId + schemaName desde claims firmados
 * - Fallback transitorio para auth publico → header X-Tenant-Slug, reservado a
 *   las rutas publicas de PUBLIC_ROUTES_WITH_TENANT. Una peticion autenticada
 *   de tenant NUNCA resuelve contexto por esa cabecera: el contexto sale del
 *   token verificado, no de un valor controlado por el cliente.
 *
 * Rechaza con 404 si el tenant no existe.
 * Rechaza con 403 si el tenant esta SUSPENDED, INACTIVE o MARKED_FOR_DELETION.
 *
 * NOTA: Este middleware NO debe aplicarse a los endpoints de administracion
 * de tenants (/api/v1/tenants) ya que esos operan en el schema publico
 * y no requieren contexto de tenant.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    this.markResolutionSource(req, 'none');
    const jwtPayload = this.tryExtractJwtPayload(req);

    if (jwtPayload?.type === 'tenant' && jwtPayload.tenantId && jwtPayload.schemaName) {
      const tenant = await this.tenantService.findById(jwtPayload.tenantId);

      if (!tenant) {
        throw new UnauthorizedException('El tenant del token no existe.');
      }

      if (tenant.schemaName !== jwtPayload.schemaName) {
        throw new UnauthorizedException('El token contiene un schema de tenant invalido.');
      }

      // P-09: el `sub` verificado queda en el request para el bucket por
      // sujeto del rate limiter (corre despues del middleware, antes de guards).
      (req as TenantResolutionRequest).iwanaVerifiedSub = jwtPayload.sub;

      return this.runWithTenantContext(req, tenant, next, 'jwt-verified');
    }

    const tenantSlug = this.normalizeTenantSlug(req.headers['x-tenant-slug'] as string | undefined);

    if (!tenantSlug) {
      if (this.requiresTenantHeader(req)) {
        throw new BadRequestException(
          'Debe indicar el tenant via header X-Tenant-Slug para este endpoint.',
        );
      }

      // Si hay JWT valido (type='platform' o type='tenant' sin claims de schema),
      // permitir paso sin contexto: JwtAuthGuard ya valido el token o rutas de
      // plataforma no requieren tenant.
      if (jwtPayload) {
        this.markResolutionSource(req, 'jwt-verified');
        return next();
      }

      // Sin JWT ni X-Tenant-Slug en ruta protegida -> rechazar antes de que
      // TenantContext.getOrThrow() genere un 500 generico en la capa de negocio.
      if (!this.isPublicRoute(req)) {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      return next();
    }

    // El slug solo llega aqui cuando NO hay un JWT de tenant verificado. En una
    // peticion autenticada (token valido en Bearer o cookie) la resolucion ya
    // retorno arriba desde los claims; esta cabecera no puede suplantarlo.
    const tenant = await this.tenantService.findBySlug(tenantSlug);

    if (!tenant) {
      // P-17: sin eco del slug — el identificador pedido no vuelve en el
      // cuerpo. El codigo 404 se conserva: el login del portal lo mapea a su
      // mensaje util (LoginForm.tsx) y unificar codigos sin FE degradaria esa
      // UX (escalado como [CONSULTA] a EM-ARCH).
      this.logger.warn(
        `Resolucion de tenant inexistente [slug=${tenantSlug} ruta=${this.getNormalizedPath(req)}].`,
      );
      throw new NotFoundException('Empresa no encontrada.');
    }

    return this.runWithTenantContext(req, tenant, next, 'public-header');
  }

  /**
   * Extrae y verifica el JWT del request.
   *
   * Fuentes, en orden: cabecera `Authorization: Bearer` (transicion) y cookie
   * de access por audiencia (C-1). Devuelve el primer payload que verifica;
   * ante un token invalido o expirado prueba la siguiente fuente de la lista.
   * La lista de candidatos es de un solo elemento si hay Bearer (un Bearer
   * invalido no cae a las cookies); sin Bearer contiene la cookie de tenant y
   * luego la de plataforma, de modo que una cookie de tenant invalida sí
   * prueba la de plataforma. Si ninguna fuente verifica, no resuelve contexto.
   */
  private tryExtractJwtPayload(req: Request): JwtPayload | null {
    for (const candidate of this.readAccessTokenCandidates(req)) {
      if (!candidate) {
        continue;
      }

      try {
        return this.jwtService.verify<JwtPayload>(candidate);
      } catch {
        // Token invalido o expirado: probar la siguiente fuente.
      }
    }

    return null;
  }

  /** Fuentes del access token: cabecera Bearer y cookies de access de ambas audiencias. */
  private readAccessTokenCandidates(req: Request): Array<string | undefined> {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const bearerToken = authHeader.slice('Bearer '.length).trim();
      if (bearerToken) {
        return [bearerToken];
      }
    }

    const cookies = (req.cookies ?? {}) as Record<string, string>;
    return [cookies[tenantAccessCookieName()], cookies[platformAccessCookieName()]];
  }

  private normalizeTenantSlug(rawSlug: string | undefined): string {
    return rawSlug?.trim().toLowerCase() ?? '';
  }

  /**
   * ¿Es una ruta anónima? Cubre los dos estados públicos: las de ámbito
   * plataforma y las que operan sobre un tenant concreto.
   *
   * Se usa para no rechazar con 401 una petición sin JWT que legítimamente no
   * lo lleva. La clasificación vive en `public-routes.ts` como fuente única, y
   * `tenant-public-routes.spec.ts` impide que vuelva a divergir de los
   * `@Public()` reales — antes de 2026-07-19 nunca estuvieron sincronizados.
   */
  private isPublicRoute(req: Request): boolean {
    const normalizedPath = this.getNormalizedPath(req);

    return (
      PUBLIC_ROUTES_WITHOUT_TENANT.includes(normalizedPath) ||
      PUBLIC_ROUTES_WITH_TENANT.includes(normalizedPath)
    );
  }

  /**
   * ¿Esta ruta anónima exige `X-Tenant-Slug`?
   *
   * Solo las públicas que operan sobre un tenant concreto: su handler resuelve
   * `TenantContext`, así que sin header no puede atenderse y conviene un 400
   * explicativo en vez del 500 genérico que saldría de `getOrThrow()`.
   *
   * Excepción (ADR-081, C-6): `/auth/refresh` con cookie de refresh de
   * plataforma no opera sobre un tenant — la consola no tiene schema. El
   * handler decide el flujo por la cookie presente; exigirle un slug
   * impediría el ciclo de refresco de la sesión de plataforma.
   */
  private requiresTenantHeader(req: Request): boolean {
    if (!PUBLIC_ROUTES_WITH_TENANT.includes(this.getNormalizedPath(req))) {
      return false;
    }

    if (this.getNormalizedPath(req) === '/auth/refresh') {
      const cookies = (req.cookies ?? {}) as Record<string, string>;
      if (cookies[platformRefreshCookieName()]) {
        return false;
      }
    }

    return true;
  }

  private getNormalizedPath(req: Request): string {
    return (req.originalUrl || req.url || '').split('?')[0]?.replace(/^\/api\/v1/, '') ?? '';
  }

  private runWithTenantContext(
    req: Request,
    tenant: { id: string; schemaName: string; slug: string; status: TenantStatus },
    next: NextFunction,
    source: TenantResolutionSource,
  ): void {
    this.ensureTenantIsOperable(tenant.slug, tenant.status);
    this.markResolutionSource(req, source);

    TenantContext.run(
      {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      },
      () => next(),
    );
  }

  private markResolutionSource(req: Request, source: TenantResolutionSource): void {
    (req as TenantResolutionRequest).iwanaTenantResolutionSource = source;
  }

  private ensureTenantIsOperable(tenantSlug: string, tenantStatus: TenantStatus): void {
    // P-17: mensaje unico sin estado comercial (SUSPENDED / INACTIVE /
    // MARKED_FOR_DELETION no se revelan a anonimos); el detalle va al log del
    // servidor. El codigo 403 se conserva por la misma razon que el 404.
    if (
      tenantStatus === TenantStatus.SUSPENDED ||
      tenantStatus === TenantStatus.INACTIVE ||
      tenantStatus === TenantStatus.MARKED_FOR_DELETION
    ) {
      this.logger.warn(
        `Resolucion de tenant no operable [slug=${tenantSlug} estado=${tenantStatus}].`,
      );
      throw new ForbiddenException('La empresa no esta disponible. Contactar soporte iWana.');
    }
  }
}
