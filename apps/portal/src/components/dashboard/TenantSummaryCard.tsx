import Link from 'next/link';
import { Badge } from '@iwana/ui';
import type { DashboardSummaryTenant, TenantSelfSettings } from '@/lib/api-client';
import { portalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import { PortalPanel, portalInlineTextLinkClassName } from '@/components/shared/portal-ui';

interface TenantSummaryCardProps {
  tenant: DashboardSummaryTenant;
  settings: TenantSelfSettings;
}

function statusVariant(
  status: DashboardSummaryTenant['status'],
): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE') return portalActiveBadgeVariant;
  if (status === 'SUSPENDED') return 'error';
  if (status === 'PROVISIONING') return 'warning';
  if (status === 'PROVISIONING_FAILED') return 'error';
  if (status === 'MARKED_FOR_DELETION') return 'error';
  return 'neutral';
}

function statusLabel(status: DashboardSummaryTenant['status']): string {
  const labels: Record<DashboardSummaryTenant['status'], string> = {
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    INACTIVE: 'Inactivo',
    PROVISIONING: 'En preparación',
    PROVISIONING_FAILED: 'Error de preparación',
    MARKED_FOR_DELETION: 'En eliminación',
  };
  return labels[status] ?? 'Estado desconocido';
}

function resolveLocation(tenant: DashboardSummaryTenant): string {
  const parts = [tenant.city, tenant.department].filter(Boolean);
  if (parts.length === 0) {
    return tenant.countryCode ?? 'No disponible';
  }
  return parts.join(', ');
}

/**
 * B3 · Estado de la empresa — ficha subordinada (UX §2.2 / §8).
 * Una fila de pares etiqueta/valor; el detalle vive en Configuración.
 */
export function TenantSummaryCard({ tenant, settings }: TenantSummaryCardProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Estado del servicio', value: statusLabel(tenant.status) },
    { label: 'Zona horaria', value: settings.timezone },
    { label: 'Moneda', value: settings.currency },
    { label: 'Ubicación', value: resolveLocation(tenant) },
    { label: 'País', value: settings.country },
  ];

  return (
    <PortalPanel
      title={tenant.name}
      description="Resumen operativo de tu empresa"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(tenant.status)}>{statusLabel(tenant.status)}</Badge>
          <Link href="/dashboard/settings" className={portalInlineTextLinkClassName}>
            Ver en configuración
          </Link>
        </div>
      }
    >
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">{row.label}</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{row.value}</dd>
          </div>
        ))}
      </dl>
    </PortalPanel>
  );
}
