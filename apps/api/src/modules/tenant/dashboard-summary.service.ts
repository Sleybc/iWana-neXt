import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { Tenant, User, AuditLog, runInTenantSchema } from '@iwana/db';
import { TenantStatus, UserStatus } from '@iwana/shared';
import {
  DashboardAlertDto,
  DashboardMetricsDto,
  DashboardSummaryResponseDto,
  DashboardSummaryTenantDto,
  TenantSelfSettingsResponseDto,
} from './dto/tenant-self.dto';

/** Default alineado con TenantService.toSelfSettingsDto. */
const DEFAULT_FIBER_INSTALLATION_THRESHOLD_METERS = 50;

type UsersMetrics = {
  configuredUsers: number;
  mfaCoverage: number;
};

/**
 * Servicio de summary del dashboard empresarial.
 *
 * Agrega en una sola respuesta:
 *   - Datos base del tenant autenticado (schema público) — 13 campos, sin marca.
 *   - Configuración operativa del tenant (incluye fiberInstallationThresholdMeters).
 *   - Métricas: usuarios configurados, cobertura MFA real, audit events 7d.
 *   - Alertas de onboarding generadas a partir del estado real del tenant.
 *
 * Decisión arquitectónica: Opción A confirmada por CTO.
 * AuditQueryService se inyecta directamente ya que AuditModule exporta el servicio.
 * No se crea un módulo nuevo — el summary es una query facade dentro de TenantModule.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2, §3.3, §3.4
 * HLD-MOD02-DASHBOARD-EMPRESA-v2.0 §4.3 (C-1/C-2/C-3)
 */
@Injectable()
export class DashboardSummaryService {
  private readonly logger = new Logger(DashboardSummaryService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Genera el summary completo del dashboard para el tenant autenticado.
   *
   * @param tenantId UUID del tenant extraído del JWT claim.
   * @param schemaName Nombre del schema PostgreSQL del tenant para queries en schema de tenant.
   */
  async getSummary(tenantId: string, schemaName: string): Promise<DashboardSummaryResponseDto> {
    // Leer datos base del tenant desde schema público
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    // Resolver métricas desde el schema del tenant en paralelo para reducir latencia
    const [usersMetricsResult, auditEventsLast7d] = await Promise.allSettled([
      this.countUsersMetrics(schemaName),
      this.countAuditEventsLast7d(schemaName),
    ]);

    const usersMetrics =
      usersMetricsResult.status === 'fulfilled' ? usersMetricsResult.value : null;
    const auditCount = auditEventsLast7d.status === 'fulfilled' ? auditEventsLast7d.value : null;

    if (usersMetricsResult.status === 'rejected') {
      this.logger.warn(
        `No se pudo contar usuarios/MFA para tenant ${tenantId}: ${String(usersMetricsResult.reason)}`,
      );
    }
    if (auditEventsLast7d.status === 'rejected') {
      this.logger.warn(
        `No se pudo contar audit events para tenant ${tenantId}: ${String(auditEventsLast7d.reason)}`,
      );
    }

    const usersCount = usersMetrics?.configuredUsers ?? null;
    const settings = this.resolveSettings(tenant);
    const alerts = this.buildOnboardingAlerts(tenant, usersCount);
    const metrics: DashboardMetricsDto = {
      configuredUsers: usersCount,
      mfaCoverage: usersMetrics?.mfaCoverage ?? null,
      pendingAlerts: alerts.filter((a) => a.severity === 'warning' || a.severity === 'error')
        .length,
      auditEventsLast7d: auditCount,
    };

    return {
      tenant: this.toSummaryTenantDto(tenant),
      settings,
      metrics,
      alerts,
    };
  }

  /**
   * Cuenta usuarios ACTIVE y cobertura MFA en una sola transacción de schema.
   * Cobertura = mfaEnabled / ACTIVE. Sin usuarios ACTIVE → 1 (vacuamente cumplida).
   * `null` solo cuando la fuente falla (rechazo de la promesa en getSummary).
   */
  private async countUsersMetrics(schemaName: string): Promise<UsersMetrics> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const repo = qr.manager.getRepository(User);
      const configuredUsers = await repo.count({ where: { status: UserStatus.ACTIVE } });
      if (configuredUsers === 0) {
        return { configuredUsers: 0, mfaCoverage: 1 };
      }
      const mfaEnabledUsers = await repo.count({
        where: { status: UserStatus.ACTIVE, mfaEnabled: true },
      });
      return {
        configuredUsers,
        mfaCoverage: mfaEnabledUsers / configuredUsers,
      };
    });
  }

  /**
   * Cuenta eventos de audit de los últimos 7 días en el schema del tenant.
   * Opción A: usa DataSource directamente para no depender del TenantContext
   * que requiere request activa — este servicio puede llamarse sin contexto HTTP.
   */
  private async countAuditEventsLast7d(schemaName: string): Promise<number | null> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const repo = qr.manager.getRepository(AuditLog);
      const count = await repo.count({
        where: { createdAt: MoreThanOrEqual(sevenDaysAgo) },
      });
      return count;
    });
  }

  /**
   * Genera alertas de onboarding basadas en el estado real del tenant.
   * Ninguna alerta es inventada — todas se derivan de datos verificables.
   */
  private buildOnboardingAlerts(tenant: Tenant, usersCount: number | null): DashboardAlertDto[] {
    const alerts: DashboardAlertDto[] = [];
    const settings = this.asRecord(tenant.settings);
    const features = this.asRecord(settings['features']);

    // Alerta si el tenant está en estado diferente a ACTIVE
    if (tenant.status === TenantStatus.PROVISIONING) {
      alerts.push({
        id: 'tenant-provisioning',
        severity: 'info',
        title: 'Empresa en configuración',
        description: 'Estamos preparando el entorno de tu empresa. Estará listo pronto.',
      });
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      alerts.push({
        id: 'tenant-suspended',
        severity: 'error',
        title: 'Empresa suspendida',
        description:
          'El acceso a la empresa está suspendido. Contacta al equipo de soporte de la plataforma.',
      });
    }

    if (tenant.status === TenantStatus.INACTIVE) {
      alerts.push({
        id: 'tenant-inactive',
        severity: 'error',
        title: 'Empresa inactiva',
        description: 'El contrato de la empresa finalizó y el acceso quedó bloqueado.',
      });
    }

    if (tenant.status === TenantStatus.MARKED_FOR_DELETION) {
      alerts.push({
        id: 'tenant-marked-for-deletion',
        severity: 'error',
        title: 'Empresa marcada para eliminación',
        description:
          'La empresa se eliminará próximamente. Contacta a soporte si necesitas restaurarla.',
      });
    }

    // Alerta si la verificación en dos pasos no es obligatoria para toda la empresa
    if (!features['mfa_required_all']) {
      alerts.push({
        id: 'mfa-not-required',
        severity: 'warning',
        title: 'Verificación en dos pasos no obligatoria',
        description:
          'Se recomienda activar la verificación en dos pasos obligatoria para todos los usuarios de la empresa.',
        href: '/dashboard/settings',
      });
    }

    // Alerta si hay muy pocos usuarios configurados
    if (usersCount !== null && usersCount <= 1) {
      alerts.push({
        id: 'few-users',
        severity: 'info',
        title: 'Usuarios pendientes de configurar',
        description: 'Solo hay un usuario activo. Considera agregar más miembros del equipo.',
      });
    }

    // Alerta si faltan datos de contacto o legales
    if (!tenant.phone && !tenant.website) {
      alerts.push({
        id: 'incomplete-profile',
        severity: 'info',
        title: 'Perfil de empresa incompleto',
        description: 'Completa la información de contacto y los datos de tu empresa.',
        href: '/dashboard/settings',
      });
    }

    return alerts;
  }

  /** Mapea Tenant al DTO estrecho del resumen — 13 campos, sin marca. */
  private toSummaryTenantDto(tenant: Tenant): DashboardSummaryTenantDto {
    const dto = new DashboardSummaryTenantDto();
    dto.id = tenant.id;
    dto.name = tenant.name;
    dto.slug = tenant.slug;
    dto.status = tenant.status;
    dto.contactEmail = tenant.contactEmail;
    dto.legalName = tenant.legalName ?? null;
    dto.nit = tenant.nit ?? null;
    dto.city = tenant.city ?? null;
    dto.department = tenant.department ?? null;
    dto.countryCode = tenant.countryCode ?? null;
    dto.phone = tenant.phone ?? null;
    dto.website = tenant.website ?? null;
    dto.createdAt = tenant.createdAt;
    return dto;
  }

  /** Normaliza la configuración operativa del tenant aplicando defaults (paridad con /me/settings). */
  private resolveSettings(tenant: Tenant): TenantSelfSettingsResponseDto {
    const settings = this.asRecord(tenant.settings);
    const features = this.asRecord(settings['features']);
    const dto = new TenantSelfSettingsResponseDto();
    dto.timezone = String(settings['timezone'] ?? 'America/Bogota');
    dto.currency = String(settings['currency'] ?? 'COP');
    dto.language = String(settings['language'] ?? 'es-CO');
    dto.country = String(settings['country'] ?? 'CO');
    dto.fiberInstallationThresholdMeters = Number(
      settings['fiberInstallationThresholdMeters'] ?? DEFAULT_FIBER_INSTALLATION_THRESHOLD_METERS,
    );
    dto.features = {
      billing: Boolean(features['billing'] ?? false),
      mfa_required_all: Boolean(features['mfa_required_all'] ?? false),
    };
    return dto;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }
}
