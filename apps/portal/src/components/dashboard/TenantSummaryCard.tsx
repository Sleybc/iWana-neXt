// apps/portal/src/components/dashboard/TenantSummaryCard.tsx
import { Badge, Card, CardContent } from '@iwana/ui';
import { Building2, MapPin, Globe } from 'lucide-react';
import type { TenantSelf, TenantSelfSettings } from '@/lib/api-client';
import { portalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';

interface TenantSummaryCardProps {
  tenant: TenantSelf;
  settings: TenantSelfSettings;
}

/** Mapea el estado del tenant a variante visual de Badge */
function statusVariant(status: TenantSelf['status']): 'lime' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE') return portalActiveBadgeVariant;
  if (status === 'SUSPENDED') return 'error';
  if (status === 'PROVISIONING') return 'warning';
  if (status === 'PROVISIONING_FAILED') return 'error';
  if (status === 'MARKED_FOR_DELETION') return 'error';
  return 'neutral';
}

function statusLabel(status: TenantSelf['status']): string {
  const labels: Record<TenantSelf['status'], string> = {
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    INACTIVE: 'Inactivo',
    PROVISIONING: 'Aprovisionando',
    PROVISIONING_FAILED: 'Error de aprovisionamiento',
    MARKED_FOR_DELETION: 'En eliminación',
  };
  return labels[status] ?? status;
}

function resolveLocation(tenant: TenantSelf): string {
  const parts = [tenant.city, tenant.department].filter(Boolean);
  if (parts.length === 0) {
    return tenant.countryCode ?? 'No disponible';
  }

  return `${parts.join(', ')}${tenant.countryCode ? ` · ${tenant.countryCode}` : ''}`;
}

function resolveWebsite(tenant: TenantSelf): string {
  return tenant.website?.trim() || 'No disponible';
}

/**
 * Tarjeta de resumen de la empresa autenticada.
 * Muestra nombre, slug, estado, configuración operativa y datos de contacto.
 * Los datos provienen de contratos self-service — nunca de endpoints de plataforma.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2 (BT-DE-08)
 */
export function TenantSummaryCard({ tenant, settings }: TenantSummaryCardProps) {
  return (
    <Card className="border border-gray-200 dark:border-dark-border dark:bg-dark-surface-2">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5 dark:border-dark-border-2">
          <div className="min-w-0 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iwana-primary-50 dark:bg-iwana-primary-800/30">
              <Building2
                className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300"
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Empresa actual</p>
              <h2 className="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-white">
                {tenant.name}
              </h2>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                Identificador interno{' '}
                <span className="rounded-lg bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-800 dark:bg-dark-surface-3 dark:text-gray-100">
                  {tenant.slug}
                </span>
              </p>
            </div>
          </div>

          <Badge variant={statusVariant(tenant.status)} className="shrink-0">
            {statusLabel(tenant.status)}
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-300">
              Perfil empresarial
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-gray-100 dark:border-dark-border-2">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-border-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Ubicación</span>
                <span className="text-right text-sm font-medium text-gray-800 dark:text-white">
                  {resolveLocation(tenant)}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                  <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Sitio web
                </span>
                <span className="max-w-[60%] truncate text-right text-sm font-medium text-gray-800 dark:text-white">
                  {resolveWebsite(tenant)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-300">
              Configuración operativa
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-gray-100 dark:border-dark-border-2">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-border-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Zona horaria</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {settings.timezone}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-border-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Moneda</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {settings.currency}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-border-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Idioma</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {settings.language}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  País
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {settings.country}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
