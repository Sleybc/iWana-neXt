// apps/portal/src/components/dashboard/TenantSummaryCard.tsx
import { Badge, Card, CardContent } from '@iwana/ui';
import { Building2, MapPin, Globe } from 'lucide-react';
import type { TenantSelf, TenantSelfSettings } from '@/lib/api-client';

interface TenantSummaryCardProps {
  tenant: TenantSelf;
  settings: TenantSelfSettings;
}

/** Mapea el estado del tenant a variante visual de Badge */
function statusVariant(status: TenantSelf['status']): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'error';
  if (status === 'PROVISIONING') return 'warning';
  if (status === 'PROVISIONING_FAILED') return 'error';
  return 'neutral';
}

function statusLabel(status: TenantSelf['status']): string {
  const labels: Record<TenantSelf['status'], string> = {
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    PROVISIONING: 'Aprovisionando',
    PROVISIONING_FAILED: 'Error de aprovisionamiento',
  };
  return labels[status] ?? status;
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
    <Card className="border border-gray-100 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {/* Ícono empresa */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-surface-3">
              <Building2
                className="h-6 w-6 text-iwana-primary dark:text-iwana-primary-300"
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                {tenant.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="rounded-lg bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-dark-surface-3">
                  {tenant.slug}
                </span>
              </p>

              {/* Ubicación */}
              {(tenant.city || tenant.department) && (
                <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-2">
                  <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {[tenant.city, tenant.department].filter(Boolean).join(', ')}
                  {tenant.countryCode && ` · ${tenant.countryCode}`}
                </p>
              )}

              {/* Web */}
              {tenant.website && (
                <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <Globe className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tenant.website}</span>
                </p>
              )}
            </div>
          </div>

          <Badge variant={statusVariant(tenant.status)} className="shrink-0">
            {statusLabel(tenant.status)}
          </Badge>
        </div>

        {/* Configuración operativa */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-4 dark:border-dark-border-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              Zona horaria
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
              {settings.timezone}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              Moneda
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
              {settings.currency}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              Idioma
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
              {settings.language}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              País
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
              {settings.country}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
