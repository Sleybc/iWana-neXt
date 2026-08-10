/**
 * DTOs para los contratos self-service del tenant autenticado.
 * Usados por GET /api/v1/tenants/me y GET /api/v1/tenants/me/settings.
 *
 * Estos contratos son distintos al TenantResponseDto de plataforma:
 * exponen solo los campos relevantes para el panel empresarial del tenant.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
 * HLD-MOD02-DASHBOARD-EMPRESA-v2.0 §4.3 (C-1/C-2/C-3)
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  nitDv: string | null;
  city: string | null;
  department: string | null;
  countryCode: string | null;
  phone: string | null;
  website: string | null;
  createdAt: Date;

  // Branding del tenant
  logoLightUrl: string | null;
  logoLightAssetId: string | null;
  logoDarkUrl: string | null;
  logoDarkAssetId: string | null;
  sealLightUrl: string | null;
  sealLightAssetId: string | null;
  sealDarkUrl: string | null;
  sealDarkAssetId: string | null;
  faviconLightUrl: string | null;
  faviconLightAssetId: string | null;
  faviconDarkUrl: string | null;
  faviconDarkAssetId: string | null;
  loginBackgroundLightUrl: string | null;
  loginBackgroundLightAssetId: string | null;
  loginBackgroundDarkUrl: string | null;
  loginBackgroundDarkAssetId: string | null;
  showTenantName: boolean;
  brandingProductName: string | null;
  brandingSurfaceName: string | null;
  brandingMetadataTitle: string | null;
  brandingMetadataDescription: string | null;
}

/**
 * Subconjunto del tenant servido por GET /tenants/me/summary.
 * Solo los 13 campos que el mapper asigna — sin marca ni nitDv.
 * Corrige C-1 (HLD v2.0 §4.3): el resumen ya no declara campos que no entrega.
 */
export class DashboardSummaryTenantDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: TenantStatus })
  status: TenantStatus;

  @ApiProperty()
  contactEmail: string;

  @ApiProperty({ nullable: true, type: String })
  legalName: string | null;

  @ApiProperty({ nullable: true, type: String })
  nit: string | null;

  @ApiProperty({ nullable: true, type: String })
  city: string | null;

  @ApiProperty({ nullable: true, type: String })
  department: string | null;

  @ApiProperty({ nullable: true, type: String })
  countryCode: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ nullable: true, type: String })
  website: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}

/** Respuesta pública mínima para aplicar branding en el login del portal. */
export class TenantPublicBrandingResponseDto {
  displayName: string;
  productName: string;
  surfaceName: string;
  metadataTitle: string;
  metadataDescription: string;
  showTenantName: boolean;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  faviconLightUrl: string | null;
  faviconDarkUrl: string | null;
  loginBackgroundLightUrl: string | null;
  loginBackgroundDarkUrl: string | null;
}

/**
 * Configuración operativa del tenant autenticado.
 * Devuelve los campos funcionales visibles en el panel empresarial.
 */
export class TenantSelfSettingsResponseDto {
  @ApiProperty({ example: 'America/Bogota' })
  timezone: string;

  @ApiProperty({ example: 'COP' })
  currency: string;

  @ApiProperty({ example: 'es-CO' })
  language: string;

  @ApiProperty({ example: 'CO' })
  country: string;

  @ApiProperty({
    description:
      'Umbral de instalación de fibra en metros. Default 50 (mismo mapper que /me/settings).',
    example: 50,
  })
  fiberInstallationThresholdMeters: number;

  @ApiProperty({
    type: 'object',
    properties: {
      billing: { type: 'boolean' },
      mfa_required_all: { type: 'boolean' },
    },
  })
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
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['info', 'warning', 'error'] })
  severity: 'info' | 'warning' | 'error';

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  href?: string;
}

/**
 * Métricas del dashboard para el tenant autenticado.
 * `null` en conteos/cobertura significa fallo de fuente (no se pudo contar).
 * Cero usuarios activos produce cobertura definida (ratio 1 — vacuamente cumplida).
 */
export class DashboardMetricsDto {
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Usuarios ACTIVE; null si falló el conteo',
  })
  configuredUsers: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Ratio [0,1] de usuarios ACTIVE con mfaEnabled. null = fallo de fuente. Sin usuarios ACTIVE = 1.',
  })
  mfaCoverage: number | null;

  @ApiProperty({ description: 'Alertas warning|error pendientes' })
  pendingAlerts: number;

  @ApiProperty({ nullable: true, type: Number })
  auditEventsLast7d: number | null;
}

/**
 * Respuesta del summary del dashboard empresarial.
 * Agrega datos del tenant, métricas y alertas de onboarding.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.4 (TenantDashboardSummary)
 * HLD-MOD02-DASHBOARD-EMPRESA-v2.0 §4.3
 */
export class DashboardSummaryResponseDto {
  @ApiProperty({ type: DashboardSummaryTenantDto })
  tenant: DashboardSummaryTenantDto;

  @ApiProperty({ type: TenantSelfSettingsResponseDto })
  settings: TenantSelfSettingsResponseDto;

  @ApiProperty({ type: DashboardMetricsDto })
  metrics: DashboardMetricsDto;

  @ApiProperty({ type: [DashboardAlertDto] })
  alerts: DashboardAlertDto[];
}
