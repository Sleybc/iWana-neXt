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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {/* Ícono empresa */}
            <div className="w-12 h-12 shrink-0 rounded-xl bg-iwana-primary/10 dark:bg-iwana-primary/20 flex items-center justify-center">
              <Building2
                className="w-6 h-6 text-iwana-primary dark:text-iwana-primary-300"
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                {tenant.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="font-mono text-xs bg-gray-100 dark:bg-dark-surface-3 px-1.5 py-0.5 rounded">
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
        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-dark-border-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Zona horaria
            </p>
            <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">
              {settings.timezone}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Moneda
            </p>
            <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">
              {settings.currency}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Idioma
            </p>
            <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">
              {settings.language}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              País
            </p>
            <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">
              {settings.country}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
