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
    const previous = await this.getTenantUsageGrantedRoles();
    // El UPSERT evita depender de que el branding haya creado la fila antes.
    await this.settingsRepo.query(
      `INSERT INTO public.platform_branding_settings
         (id, product_name, surface_name, metadata_title, metadata_description, tenant_usage_viewer_roles)
       VALUES ($1, 'iWana neXt', 'Portal administrativo', 'iWana neXt — Portal Administrativo',
               'Portal administrativo para operadores ISP iWana neXt', $2::text[])
       ON CONFLICT (id) DO UPDATE
         SET tenant_usage_viewer_roles = EXCLUDED.tenant_usage_viewer_roles, updated_at = now()`,
      [PLATFORM_SETTINGS_ID, next],
    );
    await this.platformAuditService.log({
      action: AuditAction.UPDATE,
      entityType: 'TenantUsageVisibility',
      entityId: PLATFORM_SETTINGS_ID,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      oldValue: { grantedRoles: previous },
      newValue: { grantedRoles: next },
    });
    return next;
  }

  /** Orden estable y solo roles autorizables (defensa además del CHECK de la 037). */
  private normalize(roles: readonly string[]): TenantUsageGrantableRole[] {
    return TENANT_USAGE_GRANTABLE_ROLES.filter((role) => roles.includes(role));
  }
}
