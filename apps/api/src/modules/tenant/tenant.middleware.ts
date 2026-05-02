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

      // Si no hay JWT de tenant ni header, no se establece contexto.
      // Las rutas protegidas fallaran en JwtAuthGuard y las de plataforma no lo requieren.
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

  private requiresTenantHeader(req: Request): boolean {
    const requestPath = (req.originalUrl || req.url || '').split('?')[0] ?? '';
    const normalizedPath = requestPath.replace(/^\/api\/v1/, '');

    return (
      req.method === 'POST' &&
      ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'].includes(
        normalizedPath,
      )
    );
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
