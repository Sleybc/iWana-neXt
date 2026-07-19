import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PUBLIC_ROUTES_WITH_TENANT, PUBLIC_ROUTES_WITHOUT_TENANT } from './public-routes';
import { TenantService } from './tenant.service';

/**
 * Middleware de resolucion de tenant por request.
 *
 * Extrae el identificador del tenant del request y lo almacena en
 * AsyncLocalStorage (TenantContext) para toda la cadena de ejecucion.
 *
 * Pipeline de seguridad (HLD Seccion 2):
 *   JwtAuthGuard → TenantMiddleware → RolesGuard → AbacGuard → Business Logic
 *
 * Resolucion vigente:
 * - Bearer JWT valido → tenantId + schemaName desde claims firmados
 * - Fallback transitorio para auth publico → header X-Tenant-Slug
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
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const jwtPayload = this.tryExtractJwtPayload(req);

    if (jwtPayload?.type === 'tenant' && jwtPayload.tenantId && jwtPayload.schemaName) {
      const tenant = await this.tenantService.findById(jwtPayload.tenantId);

      if (!tenant) {
        throw new UnauthorizedException('El tenant del token no existe.');
      }

      if (tenant.schemaName !== jwtPayload.schemaName) {
        throw new UnauthorizedException('El token contiene un schema de tenant invalido.');
      }

      return this.runWithTenantContext(tenant, next);
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
        return next();
      }

      // Sin JWT ni X-Tenant-Slug en ruta protegida -> rechazar antes de que
      // TenantContext.getOrThrow() genere un 500 generico en la capa de negocio.
      if (!this.isPublicRoute(req)) {
        throw new UnauthorizedException('Token de acceso invalido o expirado.');
      }

      return next();
    }

    const tenant = await this.tenantService.findBySlug(tenantSlug);

    if (!tenant) {
      throw new NotFoundException(`Tenant "${tenantSlug}" no encontrado.`);
    }

    return this.runWithTenantContext(tenant, next);
  }

  private tryExtractJwtPayload(req: Request): JwtPayload | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const rawToken = authHeader.slice('Bearer '.length).trim();
    if (!rawToken) {
      return null;
    }

    try {
      return this.jwtService.verify<JwtPayload>(rawToken);
    } catch {
      // El guard JWT emitira el 401 correspondiente; aqui solo resolvemos contexto.
      return null;
    }
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
   * Antes se condicionaba a `method === 'POST'`; se quita porque la exigencia
   * depende de si el handler necesita tenant, no del verbo. Hoy las seis rutas
   * de esa lista son POST, así que el comportamiento observable no cambia.
   */
  private requiresTenantHeader(req: Request): boolean {
    return PUBLIC_ROUTES_WITH_TENANT.includes(this.getNormalizedPath(req));
  }

  private getNormalizedPath(req: Request): string {
    return (req.originalUrl || req.url || '').split('?')[0]?.replace(/^\/api\/v1/, '') ?? '';
  }

  private runWithTenantContext(
    tenant: { id: string; schemaName: string; slug: string; status: TenantStatus },
    next: NextFunction,
  ): void {
    this.ensureTenantIsOperable(tenant.slug, tenant.status);

    TenantContext.run(
      {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      },
      () => next(),
    );
  }

  private ensureTenantIsOperable(tenantSlug: string, tenantStatus: TenantStatus): void {
    // Tenants SUSPENDED e INACTIVE no pueden operar
    if (tenantStatus === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(
        `El tenant "${tenantSlug}" esta suspendido. Contactar soporte iWana.`,
      );
    }

    if (tenantStatus === TenantStatus.INACTIVE) {
      throw new ForbiddenException(`El tenant "${tenantSlug}" esta inactivo.`);
    }

    if (tenantStatus === TenantStatus.MARKED_FOR_DELETION) {
      throw new ForbiddenException(`El tenant "${tenantSlug}" esta marcado para eliminacion.`);
    }
  }
}
