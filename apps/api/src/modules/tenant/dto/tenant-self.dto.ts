/**
 * DTOs para los contratos self-service del tenant autenticado.
 * Usados por GET /api/v1/tenants/me y GET /api/v1/tenants/me/settings.
 *
 * Estos contratos son distintos al TenantResponseDto de plataforma:
 * exponen solo los campos relevantes para el panel empresarial del tenant.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
 */

import { TenantStatus } from '@iwana/shared';

/**
 * Datos base del tenant autenticado para el dashboard empresarial.
 * No incluye schemaName, maxSubscribers ni campos de plataforma.
 */
export class TenantSelfResponseDto {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  contactEmail: string;
  legalName: string | null;
  nit: string | null;
  city: string | null;
  department: string | null;
  countryCode: string | null;
  phone: string | null;
  website: string | null;
  createdAt: Date;
}

/**
 * Configuración operativa del tenant autenticado.
 * Devuelve los campos funcionales visibles en el panel empresarial.
 */
export class TenantSelfSettingsResponseDto {
  timezone: string;
  currency: string;
  language: string;
  country: string;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}

/**
 * Alerta de onboarding del dashboard del tenant.
 * Generada a partir del estado actual del tenant y sus configuraciones.
 */
export class DashboardAlertDto {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  href?: string;
}

/**
 * Métricas del dashboard para el tenant autenticado.
 * Los campos opcionales son null cuando la fuente aún no existe.
 */
export class DashboardMetricsDto {
  configuredUsers: number | null;
  mfaCoverage: number | null;
  pendingAlerts: number;
  auditEventsLast7d: number | null;
}

/**
 * Respuesta del summary del dashboard empresarial.
 * Agrega datos del tenant, métricas y alertas de onboarding.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.4 (TenantDashboardSummary)
 */
export class DashboardSummaryResponseDto {
  tenant: TenantSelfResponseDto;
  settings: TenantSelfSettingsResponseDto;
  metrics: DashboardMetricsDto;
  alerts: DashboardAlertDto[];
}
