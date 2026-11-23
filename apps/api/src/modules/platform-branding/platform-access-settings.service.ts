import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PlatformBrandingSettings } from '@iwana/db';
import {
  AuditAction,
  TENANT_USAGE_GRANTABLE_ROLES,
  type TenantUsageGrantableRole,
} from '@iwana/shared';
import { Repository } from 'typeorm';
import { PlatformAuditService } from '../audit/platform-audit.service';

const PLATFORM_SETTINGS_ID = 'platform';

/**
 * Ajustes de acceso de plataforma guardados en la fila única de configuración
 * (`platform_branding_settings`, id `platform`). Hoy: qué roles, además del administrador,
 * ven «Uso por empresa» (ADR-114 v1.3 §9). Sin caché: cada lectura va a la base, para que un
 * cambio rija en la siguiente petición.
 */
@Injectable()
export class PlatformAccessSettingsService {
  constructor(
    @InjectRepository(PlatformBrandingSettings)
    private readonly settingsRepo: Repository<PlatformBrandingSettings>,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async getTenantUsageGrantedRoles(): Promise<TenantUsageGrantableRole[]> {
    const row = await this.settingsRepo.findOne({
      where: { id: PLATFORM_SETTINGS_ID },
      select: { id: true, tenantUsageViewerRoles: true },
    });
    return this.normalize(row?.tenantUsageViewerRoles ?? []);
  }

  async setTenantUsageGrantedRoles(
    grantedRoles: readonly TenantUsageGrantableRole[],
    actor: { userId: string; ipAddress: string | null },
  ): Promise<TenantUsageGrantableRole[]> {
    const next = this.normalize(grantedRoles);
    // S1 (ADR-114 v1.3 §9): bloqueo de la fila, escritura y auditoría en una sola transacción.
    // Si la auditoría falla, el ajuste no cambia; dos escrituras concurrentes se serializan y
    // el «anterior» de cada fila de auditoría es el valor que la otra dejó.
    await this.settingsRepo.manager.transaction(async (manager) => {
      // Sin espera ilimitada si otra sesión retiene la fila (p. ej. una escritura de branding).
      await manager.query(`SET LOCAL lock_timeout = '5s'`);
      // Crea la fila si falta, sin depender de que el branding la haya creado antes.
      await manager.query(
        `INSERT INTO public.platform_branding_settings
           (id, product_name, surface_name, metadata_title, metadata_description)
         VALUES ($1, 'iWana neXt', 'Portal administrativo', 'iWana neXt — Portal Administrativo',
                 'Portal administrativo para operadores ISP iWana neXt')
         ON CONFLICT (id) DO NOTHING`,
        [PLATFORM_SETTINGS_ID],
      );
      const locked = (await manager.query(
        `SELECT tenant_usage_viewer_roles AS roles
           FROM public.platform_branding_settings
          WHERE id = $1
          FOR UPDATE`,
        [PLATFORM_SETTINGS_ID],
      )) as Array<{ roles: string[] | null }>;
      const previous = this.normalize(locked[0]?.roles ?? []);
      await manager.query(
        `UPDATE public.platform_branding_settings
            SET tenant_usage_viewer_roles = $2::text[], updated_at = now()
          WHERE id = $1`,
        [PLATFORM_SETTINGS_ID, next],
      );
      await this.platformAuditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'TenantUsageVisibility',
          entityId: PLATFORM_SETTINGS_ID,
          userId: actor.userId,
          ipAddress: actor.ipAddress,
          oldValue: { grantedRoles: previous },
          newValue: { grantedRoles: next },
        },
        manager,
      );
    });
    return next;
  }

  /** Orden estable y solo roles autorizables (defensa además del CHECK de la 037). */
  private normalize(roles: readonly string[]): TenantUsageGrantableRole[] {
    return TENANT_USAGE_GRANTABLE_ROLES.filter((role) => roles.includes(role));
  }
}
