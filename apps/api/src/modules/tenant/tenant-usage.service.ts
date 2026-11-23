import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuditAction, TenantStatus, canRoleViewTenantUsage } from '@iwana/shared';
import type { TenantUsage, TenantUsageGrantableRole, TenantUsageVisibility } from '@iwana/shared';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAccessSettingsService } from '../platform-branding/platform-access-settings.service';

interface TenantUsageRow {
  tenant_id: string;
  name: string;
  active_subscribers: number | null;
  max_subscribers: number | null;
  measured_at: Date | null;
}

/**
 * Uso por empresa para la consola de plataforma (ADR-114 D1, D4–D6). Solo lee `public`:
 * `tenants` y `tenant_usage_snapshots`, que llena el muestreador del worker. Nunca lee un
 * schema de empresa. Una empresa `ACTIVE` sin medición sale con `null`, nunca 0.
 */
@Injectable()
export class TenantUsageService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly platformAuditService: PlatformAuditService,
    private readonly accessSettings: PlatformAccessSettingsService,
  ) {}

  /** Ajuste guardado y respuesta para el rol que pregunta (ADR-114 v1.3 §9). */
  async getVisibility(role: string): Promise<TenantUsageVisibility> {
    const grantedRoles = await this.accessSettings.getTenantUsageGrantedRoles();
    return { grantedRoles, canView: canRoleViewTenantUsage(role, grantedRoles) };
  }

  async updateVisibility(
    grantedRoles: readonly TenantUsageGrantableRole[],
    actor: { userId: string; role: string; ipAddress: string | null },
  ): Promise<TenantUsageVisibility> {
    const saved = await this.accessSettings.setTenantUsageGrantedRoles(grantedRoles, actor);
    return { grantedRoles: saved, canView: canRoleViewTenantUsage(actor.role, saved) };
  }

  async getUsage(actor: {
    userId: string;
    role: string;
    ipAddress: string | null;
  }): Promise<TenantUsage> {
    // v1.3 §9: el permiso se evalúa contra el ajuste guardado en cada petición, sin caché.
    const grantedRoles = await this.accessSettings.getTenantUsageGrantedRoles();
    if (!canRoleViewTenantUsage(actor.role, grantedRoles)) {
      throw new ForbiddenException('No tienes permiso para ver el uso por empresa.');
    }

    const rows = (await this.dataSource.query(
      `SELECT t.id::text AS tenant_id, t.name, u.active_subscribers, t.max_subscribers,
              u.measured_at
         FROM public.tenants t
         LEFT JOIN public.tenant_usage_snapshots u ON u.tenant_id = t.id
        WHERE t.status = $1
        ORDER BY t.name ASC, t.id ASC`,
      [TenantStatus.ACTIVE],
    )) as TenantUsageRow[];

    const usage: TenantUsage = {
      items: rows.map((row) => ({
        tenantId: row.tenant_id,
        name: row.name,
        activeSubscribers: row.active_subscribers ?? null,
        maxSubscribers: row.max_subscribers ?? null,
        measuredAt: row.measured_at ? new Date(row.measured_at).toISOString() : null,
      })),
      generatedAt: new Date().toISOString(),
    };

    // D6 / condición 6: actor, IP y cantidad devuelta; sin nombres ni conteos por empresa.
    await this.platformAuditService.log({
      action: AuditAction.LIST_ACCESS,
      entityType: 'TenantUsage',
      entityId: 'N/A',
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      newValue: { tenantsReturned: usage.items.length },
    });
    return usage;
  }
}
